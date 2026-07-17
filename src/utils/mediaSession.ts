// =============================================================================
// QinPlayer — Media Session API 管理模块
// =============================================================================

import type { Track } from '../types'

type MediaSessionActions = {
  play: () => void
  pause: () => void
  prevTrack: () => void
  nextTrack: () => void
  seekTo?: (time: number) => void
}

const MEDIA_ACTIONS: MediaSessionAction[] = [
  'play',
  'pause',
  'previoustrack',
  'nexttrack',
  'seekto',
]

let mediaSessionGeneration = 0
let artworkAbortController: AbortController | null = null
let lastArtworkBlobUrl: string | null = null

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function revokeArtworkUrl(url: string | null): void {
  if (url) URL.revokeObjectURL(url)
}

function createMetadata(track: Track, artworkUrl: string | null): MediaMetadata {
  return new MediaMetadata({
    title: track.title || track.fileName,
    artist: track.artist || '未知歌手',
    album: track.album || '未知专辑',
    artwork: artworkUrl
      ? [{ src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }]
      : [],
  })
}

function commitMetadata(track: Track, artworkUrl: string | null): boolean {
  try {
    navigator.mediaSession.metadata = createMetadata(track, artworkUrl)
    return true
  } catch (error) {
    console.error('[MediaSession] 更新 metadata 失败:', error)
    return false
  }
}

/**
 * 加载本次请求独占的封面 Blob URL。全局 Blob 的接管和释放由调用方处理。
 */
async function loadArtworkUrl(track: Track, signal: AbortSignal): Promise<string | null> {
  if (!track.coverPath) return null

  const url = window.electronAPI.getCoverUrl(track.id, track.mtime)
  try {
    const response = await fetch(url, { signal })
    if (!response.ok) {
      console.warn('[MediaSession] 封面请求失败:', response.status)
      return null
    }

    const blob = await response.blob()
    if (blob.size === 0) {
      console.warn('[MediaSession] 封面 Blob 为空')
      return null
    }

    return URL.createObjectURL(blob)
  } catch (error) {
    if (!isAbortError(error)) {
      console.warn('[MediaSession] 封面图转换失败:', error)
    }
    return null
  }
}

/**
 * 立即提交文字 metadata，再异步补齐当前 generation 的封面。
 */
export async function updateMediaSession(track: Track): Promise<void> {
  if (!('mediaSession' in navigator)) return

  const generation = ++mediaSessionGeneration
  artworkAbortController?.abort()
  const controller = new AbortController()
  artworkAbortController = controller

  commitMetadata(track, null)

  if (!track.coverPath) {
    if (generation !== mediaSessionGeneration) return
    artworkAbortController = null
    const previousArtwork = lastArtworkBlobUrl
    lastArtworkBlobUrl = null
    revokeArtworkUrl(previousArtwork)
    return
  }

  const artworkUrl = await loadArtworkUrl(track, controller.signal)
  if (generation !== mediaSessionGeneration) {
    revokeArtworkUrl(artworkUrl)
    return
  }

  artworkAbortController = null
  if (!artworkUrl) {
    const previousArtwork = lastArtworkBlobUrl
    lastArtworkBlobUrl = null
    revokeArtworkUrl(previousArtwork)
    return
  }

  if (!commitMetadata(track, artworkUrl)) {
    revokeArtworkUrl(artworkUrl)
    return
  }

  const previousArtwork = lastArtworkBlobUrl
  lastArtworkBlobUrl = artworkUrl
  if (previousArtwork !== artworkUrl) revokeArtworkUrl(previousArtwork)
}

/** 清除 metadata，并使所有未完成封面请求永久失效。 */
export function clearMediaSession(): void {
  mediaSessionGeneration += 1
  artworkAbortController?.abort()
  artworkAbortController = null

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = null
  }

  const previousArtwork = lastArtworkBlobUrl
  lastArtworkBlobUrl = null
  revokeArtworkUrl(previousArtwork)
}

/** 更新播放状态。 */
export function setPlaybackState(state: 'playing' | 'paused'): void {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state
  }
}

/** 将所有已注册的 Media Session 动作恢复为空。 */
export function unregisterMediaSessionActions(): void {
  if (!('mediaSession' in navigator)) return

  for (const action of MEDIA_ACTIONS) {
    try {
      navigator.mediaSession.setActionHandler(action, null)
    } catch {
      // 某些 Chromium 版本不支持全部 action，已支持的 action 仍需继续清理。
    }
  }
}

function registerMediaSessionAction(
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler)
  } catch (error) {
    console.warn(`[MediaSession] 当前环境不支持 ${action} action:`, error)
  }
}

/** 注册动作并返回对称的注销函数。 */
export function registerMediaSessionActions(actions: MediaSessionActions): () => void {
  if (!('mediaSession' in navigator)) return () => {}

  registerMediaSessionAction('play', () => actions.play())
  registerMediaSessionAction('pause', () => actions.pause())
  registerMediaSessionAction('previoustrack', () => actions.prevTrack())
  registerMediaSessionAction('nexttrack', () => actions.nextTrack())
  registerMediaSessionAction(
    'seekto',
    actions.seekTo
      ? (details) => {
          if (details.seekTime !== undefined) actions.seekTo!(details.seekTime)
        }
      : null,
  )

  return unregisterMediaSessionActions
}

/** 设置播放位置（用于 Media Session 进度显示）。 */
export function setPositionState(
  position: number,
  duration: number,
  playbackRate: number = 1,
): void {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return

  try {
    navigator.mediaSession.setPositionState({
      duration: duration || 0,
      playbackRate,
      position: Math.min(position, duration || 0),
    })
  } catch {
    // 浏览器会拒绝无效或尚未就绪的 duration/position。
  }
}
