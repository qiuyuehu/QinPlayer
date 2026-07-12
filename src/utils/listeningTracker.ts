import { formatLocalDate } from './listeningStats'

export interface ListeningTrackerOptions {
  persist: (date: string, seconds: number) => Promise<void>
  flushThresholdSeconds?: number
}

export interface ListeningTracker {
  observe: (trackKey: string, mediaTime: number, wallClockMs: number) => void
  flush: () => Promise<void>
  resetSample: () => void
  discard: () => void
}

interface PlaybackSample {
  trackKey: string
  mediaTime: number
  wallClockMs: number
}

const MAX_INCREMENT_SECONDS = 300

function addPendingSeconds(pending: Map<string, number>, date: string, seconds: number): void {
  if (seconds <= 0) return
  pending.set(date, (pending.get(date) ?? 0) + seconds)
}

function splitAcrossLocalDates(
  startMs: number,
  endMs: number,
  countedSeconds: number,
): Array<{ date: string; seconds: number }> {
  const wallDuration = endMs - startMs
  if (wallDuration <= 0 || countedSeconds <= 0) return []

  const result: Array<{ date: string; seconds: number }> = []
  let cursor = startMs
  while (cursor < endMs) {
    const cursorDate = new Date(cursor)
    const nextMidnight = new Date(
      cursorDate.getFullYear(),
      cursorDate.getMonth(),
      cursorDate.getDate() + 1,
    ).getTime()
    const segmentEnd = Math.min(endMs, nextMidnight)
    result.push({
      date: formatLocalDate(cursorDate),
      seconds: countedSeconds * ((segmentEnd - cursor) / wallDuration),
    })
    cursor = segmentEnd
  }
  return result
}

export function createListeningTracker(options: ListeningTrackerOptions): ListeningTracker {
  const threshold = Math.max(1, options.flushThresholdSeconds ?? 30)
  const pending = new Map<string, number>()
  let sample: PlaybackSample | null = null
  let flushTail = Promise.resolve()
  let automaticFlushActive = false
  let pendingRevision = 0
  let generation = 0

  const wholePendingSeconds = (): number => {
    let total = 0
    for (const seconds of pending.values()) total += Math.floor(seconds)
    return total
  }

  const flushBatch = async (): Promise<void> => {
    const batchGeneration = generation
    const batch = new Map<string, number>()

    for (const [date, seconds] of pending) {
      const wholeSeconds = Math.floor(seconds)
      if (wholeSeconds <= 0) continue
      batch.set(date, wholeSeconds)
      const remainder = seconds - wholeSeconds
      if (remainder > 0) pending.set(date, remainder)
      else pending.delete(date)
    }

    const sortedBatch = [...batch.entries()].sort(([left], [right]) => left.localeCompare(right))
    for (const [date, totalSeconds] of sortedBatch) {
      let remaining = totalSeconds
      while (remaining > 0) {
        if (generation !== batchGeneration) return
        const chunk = Math.min(MAX_INCREMENT_SECONDS, remaining)
        try {
          await options.persist(date, chunk)
          remaining -= chunk
        } catch (error) {
          if (generation === batchGeneration) {
            addPendingSeconds(pending, date, remaining)
          }
          console.error(`[ListeningTracker] 保存 ${date} 听歌时长失败:`, error)
          break
        }
      }
    }
  }

  const flush = (): Promise<void> => {
    const run = flushTail.then(flushBatch)
    flushTail = run.catch(() => {})
    return run
  }

  const requestAutomaticFlush = (): void => {
    if (automaticFlushActive || wholePendingSeconds() < threshold) return
    automaticFlushActive = true
    const revisionAtStart = pendingRevision
    void flush().finally(() => {
      automaticFlushActive = false
      if (pendingRevision !== revisionAtStart && wholePendingSeconds() >= threshold) {
        requestAutomaticFlush()
      }
    })
  }

  const observe = (trackKey: string, mediaTime: number, wallClockMs: number): void => {
    if (!trackKey || !Number.isFinite(mediaTime) || !Number.isFinite(wallClockMs)) {
      sample = null
      return
    }

    if (!sample || sample.trackKey !== trackKey) {
      sample = { trackKey, mediaTime, wallClockMs }
      return
    }

    const mediaDelta = mediaTime - sample.mediaTime
    const wallDeltaMs = wallClockMs - sample.wallClockMs
    const previousWallClockMs = sample.wallClockMs
    sample = { trackKey, mediaTime, wallClockMs }

    if (mediaDelta <= 0 || wallDeltaMs <= 0) return
    const countedSeconds = Math.min(mediaDelta, wallDeltaMs / 1000)
    if (!Number.isFinite(countedSeconds) || countedSeconds <= 0) return

    for (const segment of splitAcrossLocalDates(previousWallClockMs, wallClockMs, countedSeconds)) {
      addPendingSeconds(pending, segment.date, segment.seconds)
    }
    pendingRevision++
    requestAutomaticFlush()
  }

  return {
    observe,
    flush,
    resetSample: () => {
      sample = null
    },
    discard: () => {
      generation++
      sample = null
      pending.clear()
      pendingRevision++
    },
  }
}

export const listeningTracker = createListeningTracker({
  persist: async (date, seconds) => {
    await window.electronAPI.invoke('listening:addSeconds', { date, seconds })
  },
})

export function flushListeningTracker(): Promise<void> {
  return listeningTracker.flush()
}

export function resetListeningTrackerSample(): void {
  listeningTracker.resetSample()
}

export function discardListeningTracker(): void {
  listeningTracker.discard()
}
