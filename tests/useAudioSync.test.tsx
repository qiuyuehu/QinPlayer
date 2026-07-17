/**
 * useAudioSync 测试
 * 覆盖：fadeEffect=false 时 loadWithFade 降级为直接 load
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { useAudioSync } from '../src/hooks/useAudioSync'
import { getPlaybackTrackKey, usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { currentTimeRef } from '../src/utils/currentTimeRef'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { Track } from '../src/types'

interface SourceIdentity {
  source: string
  generation: number
}

let loadGeneration = 0
let latestLoadIdentity: SourceIdentity | null = null
const beginMockLoad = (source: string): SourceIdentity => {
  latestLoadIdentity = { source, generation: ++loadGeneration }
  return latestLoadIdentity
}
const loadMock = vi.fn((source: string) => beginMockLoad(source))
const loadWithFadeMock = vi.fn(async (source: string) => beginMockLoad(source))
const playMock = vi.fn(async () => undefined)
const pauseMock = vi.fn()
let timeUpdateHandler: ((time: number, duration: number) => void) | undefined
let loadedMetadataHandler: ((duration: number, identity?: SourceIdentity | null) => void) | undefined
let endedHandler: (() => void) | undefined
let errorHandler: ((error: SourceIdentity & { code: number | null }) => void) | undefined
let enginePlaying = true
let engineCurrentTime = 0
let engineDuration = 0
let engineExists = true
const currentTimeSetMock = vi.fn()
const invalidatePendingLoadsMock = vi.fn(() => {
  latestLoadIdentity = null
  loadGeneration += 1
})

const trackerMocks = vi.hoisted(() => ({
  observe: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
  resetSample: vi.fn(),
  discard: vi.fn(),
}))

vi.mock('../src/utils/listeningTracker', () => ({
  listeningTracker: trackerMocks,
}))

const onTimeUpdateMock = vi.fn((callback: (time: number, duration: number) => void) => {
  timeUpdateHandler = callback
})
const onLoadedMetadataMock = vi.fn((callback: (duration: number, identity?: SourceIdentity | null) => void) => {
  loadedMetadataHandler = callback
})
const onEndedMock = vi.fn((callback: () => void) => {
  endedHandler = callback
})
const onErrorMock = vi.fn((callback: (error: SourceIdentity & { code: number | null }) => void) => {
  errorHandler = callback
})

vi.mock('../src/utils/AudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    get playing() { return enginePlaying },
    get duration() { return engineDuration },
    get latestLoadOperationIdentity() { return latestLoadIdentity },
    get currentTime() { return engineCurrentTime },
    set currentTime(value: number) {
      engineCurrentTime = value
      currentTimeSetMock(value)
    },
    load: loadMock,
    loadWithFade: loadWithFadeMock,
    invalidatePendingLoads: invalidatePendingLoadsMock,
    play: playMock,
    pause: pauseMock,
    setVolume: vi.fn(),
    onTimeUpdate: onTimeUpdateMock,
    onEnded: onEndedMock,
    onLoadedMetadata: onLoadedMetadataMock,
    onError: onErrorMock,
  })),
  hasAudioEngine: vi.fn(() => engineExists),
}))

const mediaSessionMocks = vi.hoisted(() => ({
  clearMediaSession: vi.fn(),
  registerMediaSessionActions: vi.fn(),
  setPlaybackState: vi.fn(),
  unregisterMediaSessionActions: vi.fn(),
  updateMediaSession: vi.fn(),
}))

vi.mock('../src/utils/mediaSession', () => mediaSessionMocks)

function createTrack(id: number, title: string, duration: number, fileStem = String(id)): Track {
  return {
    id,
    filePath: `C:\\music\\${fileStem}.mp3`,
    fileName: `${fileStem}.mp3`,
    title,
    artist: '测试歌手',
    album: '测试专辑',
    duration,
    coverPath: null,
    mtime: 0,
    playCount: 0,
    createdAt: '2026-07-10',
  }
}

const track = createTrack(1, '歌曲 A', 180, 'a')
const secondTrack = createTrack(2, '歌曲 B', 200)
const thirdTrack = createTrack(3, '歌曲 C', 220)

function HookHost() {
  useAudioSync()
  return null
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('useAudioSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    timeUpdateHandler = undefined
    loadedMetadataHandler = undefined
    endedHandler = undefined
    errorHandler = undefined
    enginePlaying = true
    engineCurrentTime = 0
    engineDuration = 0
    engineExists = true
    loadGeneration = 0
    latestLoadIdentity = null
    loadMock.mockReset().mockImplementation((source: string) => beginMockLoad(source))
    loadWithFadeMock.mockReset().mockImplementation(async (source: string) => beginMockLoad(source))
    playMock.mockReset().mockResolvedValue(undefined)
    mediaSessionMocks.registerMediaSessionActions.mockReturnValue(
      mediaSessionMocks.unregisterMediaSessionActions,
    )
    currentTimeRef.current = 0
    act(() => {
      useUIStore.setState({
        activeNav: 'local',
        isMiniMode: false,
        theme: 'dark',
        sidebarCollapsed: false,
        searchQuery: '',
        featureFlags: { ...DEFAULT_FEATURE_FLAGS, fadeEffect: false },
      })
      usePlayerStore.setState({
        isPlaying: true,
        currentTrack: track,
        playlist: [track],
        priorityQueue: [],
        priorityResumeTrackId: null,
        priorityConsumedTrackIds: [],
        detachedPlaylistIndex: null,
        volume: 0.8,
        playMode: 'sequential',
        fadeEnabled: true,
        lyricOffset: 0,
        duration: 0,
        seekTime: null,
        playbackFailure: null,
        playbackRetryVersion: 0,
      })
    })
  })

  it('fadeEffect=false 时应该直接 load，不调用 loadWithFade', async () => {
    render(<HookHost />)

    await waitFor(() => {
      expect(loadMock).toHaveBeenCalledWith('qinplayer://audio?id=1&v=0')
    })
    expect(loadWithFadeMock).not.toHaveBeenCalled()
  })

  it('手动切歌淡出期间应该忽略旧音频的 timeupdate', async () => {
    act(() => {
      useUIStore.setState({
        featureFlags: { ...DEFAULT_FEATURE_FLAGS, fadeEffect: true },
      })
      usePlayerStore.setState({ playlist: [track, secondTrack, thirdTrack] })
    })
    render(<HookHost />)

    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))
    act(() => timeUpdateHandler!(75, track.duration))
    expect(currentTimeRef.current).toBe(75)

    act(() => usePlayerStore.getState().nextTrack())
    await waitFor(() => {
      expect(loadWithFadeMock).toHaveBeenCalledWith(
        'qinplayer://audio?id=2&v=0',
        500,
      )
    })
    expect(currentTimeRef.current).toBe(0)

    act(() => timeUpdateHandler!(76, track.duration))
    expect(currentTimeRef.current).toBe(0)

    act(() => loadedMetadataHandler!(secondTrack.duration))
    act(() => timeUpdateHandler!(0.2, secondTrack.duration))
    expect(currentTimeRef.current).toBe(0.2)
    expect(loadMock).not.toHaveBeenCalled()
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    expect(pauseMock).not.toHaveBeenCalled()
  })

  it('手动切歌淡出期间应该忽略旧歌曲的 ended', async () => {
    act(() => {
      useUIStore.setState({
        featureFlags: { ...DEFAULT_FEATURE_FLAGS, fadeEffect: true },
      })
      usePlayerStore.setState({ playlist: [track, secondTrack, thirdTrack] })
    })
    render(<HookHost />)

    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))
    act(() => usePlayerStore.getState().nextTrack())
    await waitFor(() => expect(usePlayerStore.getState().currentTrack?.id).toBe(secondTrack.id))

    act(() => endedHandler!())

    expect(usePlayerStore.getState().currentTrack?.id).toBe(secondTrack.id)
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })

  it('非切换状态的 ended 应该正常进入下一首', async () => {
    act(() => {
      useUIStore.setState({
        featureFlags: { ...DEFAULT_FEATURE_FLAGS, fadeEffect: true },
      })
      usePlayerStore.setState({ playlist: [track, secondTrack, thirdTrack] })
    })
    render(<HookHost />)

    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))
    act(() => endedHandler!())

    await waitFor(() => {
      expect(usePlayerStore.getState().currentTrack?.id).toBe(secondTrack.id)
    })
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })

  it('loop 且没有插队时应该重播当前歌曲', async () => {
    act(() => usePlayerStore.setState({ playMode: 'loop' }))
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))

    act(() => endedHandler!())

    expect(usePlayerStore.getState().currentTrack).toEqual(track)
    expect(playMock).toHaveBeenCalled()
  })

  it('loop 有待播歌曲时 ended 应该优先进入待播', async () => {
    act(() => usePlayerStore.setState({ playlist: [track, secondTrack], playMode: 'loop', priorityQueue: [secondTrack] }))
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(secondTrack.duration))

    act(() => endedHandler!())

    expect(usePlayerStore.getState().currentTrack).toEqual(secondTrack)
    expect(usePlayerStore.getState().priorityResumeTrackId).toBe(track.id)
  })

  it('loop 在待播已空但存在恢复锚点时应该恢复锚点', async () => {
    act(() => usePlayerStore.setState({
      playlist: [track, secondTrack],
      currentTrack: secondTrack,
      playMode: 'loop',
      priorityResumeTrackId: track.id,
      priorityConsumedTrackIds: [secondTrack.id],
    }))
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))

    act(() => endedHandler!())

    expect(usePlayerStore.getState().currentTrack).toEqual(track)
    expect(usePlayerStore.getState().priorityResumeTrackId).toBeNull()
  })

  it('清空后续后 loop 自然结束不应该按旧插队锚点跳转', async () => {
    act(() => {
      usePlayerStore.setState({
        playlist: [track, secondTrack, thirdTrack],
        currentTrack: secondTrack,
        playMode: 'loop',
        priorityResumeTrackId: track.id,
        priorityConsumedTrackIds: [secondTrack.id],
      })
      usePlayerStore.getState().clearUpcoming()
    })
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(secondTrack.duration))

    act(() => endedHandler!())

    expect(usePlayerStore.getState()).toMatchObject({
      currentTrack: secondTrack,
      playlist: [track, secondTrack],
      priorityResumeTrackId: null,
      priorityConsumedTrackIds: [],
    })
    expect(engineCurrentTime).toBe(0)
  })

  it('loop 且当前歌曲已移出来源时应该从 detached successor 继续', async () => {
    act(() => {
      usePlayerStore.setState({ playlist: [track, secondTrack], currentTrack: track, playMode: 'loop' })
      usePlayerStore.getState().removeFromPlaylist(track.id)
    })
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))

    act(() => endedHandler!())

    expect(usePlayerStore.getState()).toMatchObject({
      currentTrack: secondTrack,
      detachedPlaylistIndex: null,
      isPlaying: true,
    })
  })

  it('loop 且最后一首来源被移除时应该停止而不是重播', async () => {
    act(() => {
      usePlayerStore.setState({ playlist: [track], currentTrack: track, playMode: 'loop' })
      usePlayerStore.getState().removeFromPlaylist(track.id)
    })
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))
    playMock.mockClear()

    act(() => endedHandler!())

    expect(usePlayerStore.getState()).toMatchObject({ currentTrack: track, playlist: [], isPlaying: false })
    expect(playMock).not.toHaveBeenCalled()
  })

  it('priority 播放期间 resume 被移除后应该从 detached successor 恢复', async () => {
    act(() => usePlayerStore.setState({
      playlist: [secondTrack, thirdTrack],
      currentTrack: thirdTrack,
      playMode: 'sequential',
      priorityResumeTrackId: track.id,
      priorityConsumedTrackIds: [thirdTrack.id],
      detachedPlaylistIndex: 0,
    }))
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(thirdTrack.duration))

    act(() => endedHandler!())

    expect(usePlayerStore.getState()).toMatchObject({
      currentTrack: secondTrack,
      priorityResumeTrackId: null,
      priorityConsumedTrackIds: [],
      detachedPlaylistIndex: null,
    })
  })

  it.each(['sequential', 'shuffle'] as const)('%s + detached 的 ended 只应该前进一次', async (playMode) => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    act(() => usePlayerStore.setState({
      playlist: [secondTrack, thirdTrack],
      currentTrack: track,
      playMode,
      detachedPlaylistIndex: 0,
    }))
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))

    act(() => endedHandler!())

    expect(usePlayerStore.getState()).toMatchObject({ currentTrack: secondTrack, detachedPlaylistIndex: null })
    randomSpy.mockRestore()
  })

  it('顺序模式有待播歌曲时 ended 只前进一次', async () => {
    act(() => usePlayerStore.setState({ playlist: [track, secondTrack, thirdTrack], priorityQueue: [thirdTrack] }))
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))

    act(() => endedHandler!())

    expect(usePlayerStore.getState().currentTrack).toEqual(thirdTrack)
    expect(usePlayerStore.getState().priorityQueue).toEqual([])
  })

  it('playback 关闭或旧 ended 时不应该推进优先队列', async () => {
    act(() => usePlayerStore.setState({ priorityQueue: [secondTrack] }))
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))
    act(() => useUIStore.setState({ featureFlags: { ...DEFAULT_FEATURE_FLAGS, playback: false } }))

    act(() => endedHandler!())

    expect(usePlayerStore.getState().currentTrack).toEqual(track)
    expect(usePlayerStore.getState().priorityQueue).toEqual([secondTrack])
  })

  it('快速 A→B→C 时应该持续忽略旧 timeupdate', async () => {
    act(() => {
      useUIStore.setState({
        featureFlags: { ...DEFAULT_FEATURE_FLAGS, fadeEffect: true },
      })
      usePlayerStore.setState({ playlist: [track, secondTrack, thirdTrack] })
    })
    render(<HookHost />)

    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))
    act(() => timeUpdateHandler!(75, track.duration))
    expect(currentTimeRef.current).toBe(75)

    act(() => usePlayerStore.getState().nextTrack())
    await waitFor(() => {
      expect(loadWithFadeMock).toHaveBeenCalledWith(
        'qinplayer://audio?id=2&v=0',
        500,
      )
    })
    act(() => usePlayerStore.getState().nextTrack())
    await waitFor(() => {
      expect(loadWithFadeMock).toHaveBeenCalledWith(
        'qinplayer://audio?id=3&v=0',
        500,
      )
    })
    expect(currentTimeRef.current).toBe(0)

    act(() => timeUpdateHandler!(76, track.duration))
    act(() => timeUpdateHandler!(77, track.duration))
    expect(currentTimeRef.current).toBe(0)

    act(() => loadedMetadataHandler!(thirdTrack.duration))
    act(() => timeUpdateHandler!(0.2, thirdTrack.duration))
    expect(currentTimeRef.current).toBe(0.2)
    expect(loadWithFadeMock).toHaveBeenCalledTimes(3)
    expect(pauseMock).not.toHaveBeenCalled()
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })

  it('真实播放 timeupdate 应使用实时曲目和墙钟采样', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(123_456)
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))

    act(() => timeUpdateHandler!(5, track.duration))

    expect(trackerMocks.observe).toHaveBeenCalledWith('1:C:\\music\\a.mp3', 5, 123_456)
    nowSpy.mockRestore()
  })

  it('缓冲停滞或 engine 未播放时不应采样', async () => {
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))
    enginePlaying = false

    act(() => timeUpdateHandler!(5, track.duration))

    expect(trackerMocks.observe).not.toHaveBeenCalled()
  })

  it('seek、切歌和暂停应该 flush 并重置采样基线', async () => {
    const view = render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))
    trackerMocks.flush.mockClear()
    trackerMocks.resetSample.mockClear()

    act(() => usePlayerStore.getState().setSeekTime(30))
    expect(trackerMocks.flush).toHaveBeenCalledTimes(1)
    expect(trackerMocks.resetSample).toHaveBeenCalledTimes(1)

    act(() => usePlayerStore.getState().setCurrentTrack(secondTrack))
    expect(trackerMocks.flush).toHaveBeenCalledTimes(2)
    expect(trackerMocks.resetSample).toHaveBeenCalledTimes(2)

    act(() => usePlayerStore.getState().setPlaying(false))
    expect(trackerMocks.flush).toHaveBeenCalledTimes(3)
    expect(trackerMocks.resetSample).toHaveBeenCalledTimes(3)
    view.unmount()
  })

  it.each(['profile', 'playback'] as const)(
    '%s 关闭时应该 discard 且后续 timeupdate 为 0 写入',
    async (flag) => {
      render(<HookHost />)
      await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
      act(() => loadedMetadataHandler!(track.duration))
      trackerMocks.discard.mockClear()
      trackerMocks.observe.mockClear()

      act(() => useUIStore.getState().setFeatureFlags({
        ...DEFAULT_FEATURE_FLAGS,
        [flag]: false,
      }))
      act(() => timeUpdateHandler!(5, track.duration))

      expect(trackerMocks.discard).toHaveBeenCalledTimes(1)
      expect(trackerMocks.observe).not.toHaveBeenCalled()
    },
  )

  it('ended 和 pagehide 应该 flush 并重置', async () => {
    render(<HookHost />)
    await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
    act(() => loadedMetadataHandler!(track.duration))
    trackerMocks.flush.mockClear()
    trackerMocks.resetSample.mockClear()

    act(() => endedHandler!())
    expect(trackerMocks.flush).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('pagehide'))
    expect(trackerMocks.flush).toHaveBeenCalledTimes(2)
    expect(trackerMocks.resetSample).toHaveBeenCalledTimes(2)
  })

  it('StrictMode effect replay 不应重复注册引擎事件或触发 flush', async () => {
    render(<StrictMode><HookHost /></StrictMode>)

    await waitFor(() => expect(onTimeUpdateMock).toHaveBeenCalledTimes(1))
    expect(onLoadedMetadataMock).toHaveBeenCalledTimes(1)
    expect(onEndedMock).toHaveBeenCalledTimes(1)
    expect(trackerMocks.flush).not.toHaveBeenCalled()
  })

  describe('播放失败与 Retry', () => {
    it('当前曲 media error 应该形成 load failure 并停止播放', async () => {
      render(<HookHost />)
      await waitFor(() => expect(errorHandler).toBeDefined())
      const identity = loadMock.mock.results.at(-1)?.value as SourceIdentity

      act(() => errorHandler!({ ...identity, code: 4 }))

      expect(usePlayerStore.getState()).toMatchObject({
        isPlaying: false,
        playbackFailure: {
          kind: 'load',
          trackKey: getPlaybackTrackKey(track),
          code: 'media-error',
        },
      })
    })

    it('直接 play rejection 应该形成 play failure，AbortError 不显示错误', async () => {
      playMock.mockRejectedValueOnce(new Error('device failed'))
      render(<HookHost />)
      await waitFor(() => expect(usePlayerStore.getState().playbackFailure?.kind).toBe('play'))

      act(() => usePlayerStore.setState({
        isPlaying: true,
        playbackFailure: null,
      }))
      playMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
      act(() => usePlayerStore.setState({ isPlaying: false }))
      act(() => usePlayerStore.setState({ isPlaying: true }))
      await act(async () => { await Promise.resolve() })

      expect(usePlayerStore.getState().playbackFailure).toBeNull()
    })

    it('metadata autoplay 与 loop replay rejection 都应该形成 play failure', async () => {
      render(<HookHost />)
      await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
      const identity = loadMock.mock.results.at(-1)?.value as SourceIdentity
      playMock.mockRejectedValueOnce(new Error('autoplay failed'))

      await act(async () => loadedMetadataHandler!(track.duration, identity))
      expect(usePlayerStore.getState().playbackFailure?.kind).toBe('play')

      act(() => usePlayerStore.setState({
        isPlaying: true,
        playMode: 'loop',
        playbackFailure: null,
      }))
      playMock.mockRejectedValueOnce(new Error('loop failed'))
      await act(async () => endedHandler!())
      expect(usePlayerStore.getState().playbackFailure?.kind).toBe('play')
    })

    it('A 的迟到 play rejection 不得污染 B', async () => {
      const delayed = createDeferred<void>()
      playMock.mockImplementationOnce(() => delayed.promise)
      render(<HookHost />)
      await waitFor(() => expect(playMock).toHaveBeenCalled())

      act(() => usePlayerStore.getState().setCurrentTrack(secondTrack))
      await waitFor(() => expect(loadMock).toHaveBeenCalledWith('qinplayer://audio?id=2&v=0'))
      await act(async () => delayed.reject(new Error('late A failure')))

      expect(usePlayerStore.getState().currentTrack).toEqual(secondTrack)
      expect(usePlayerStore.getState().isPlaying).toBe(true)
      expect(usePlayerStore.getState().playbackFailure).toBeNull()
    })

    it('A 的迟到 media error 不得污染 B', async () => {
      render(<HookHost />)
      await waitFor(() => expect(errorHandler).toBeDefined())
      const firstIdentity = loadMock.mock.results.at(-1)?.value as SourceIdentity

      act(() => usePlayerStore.getState().setCurrentTrack(secondTrack))
      await waitFor(() => expect(loadMock).toHaveBeenCalledWith('qinplayer://audio?id=2&v=0'))
      act(() => errorHandler!({ ...firstIdentity, code: 4 }))

      expect(usePlayerStore.getState()).toMatchObject({
        currentTrack: secondTrack,
        isPlaying: true,
        playbackFailure: null,
      })
    })

    it('同 Track Retry 后旧 generation 的 play rejection 不得污染新 generation', async () => {
      const stalePlay = createDeferred<void>()
      playMock.mockImplementationOnce(() => stalePlay.promise)
      render(<HookHost />)
      await waitFor(() => expect(playMock).toHaveBeenCalledTimes(1))
      act(() => usePlayerStore.setState({
        isPlaying: false,
        playbackFailure: {
          kind: 'load',
          trackKey: getPlaybackTrackKey(track),
          code: 'media-error',
        },
      }))

      act(() => usePlayerStore.getState().retryCurrentTrack())
      await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2))
      const retryIdentity = loadMock.mock.results.at(-1)?.value as SourceIdentity
      await act(async () => loadedMetadataHandler!(track.duration, retryIdentity))
      await act(async () => stalePlay.reject(new Error('stale generation failed')))

      expect(usePlayerStore.getState()).toMatchObject({
        isPlaying: true,
        playbackFailure: null,
      })
    })

    it('同 Track Retry 后旧 generation 的 play success 不得清除新错误', async () => {
      const stalePlay = createDeferred<void>()
      playMock.mockImplementationOnce(() => stalePlay.promise)
      render(<HookHost />)
      await waitFor(() => expect(playMock).toHaveBeenCalledTimes(1))
      act(() => usePlayerStore.setState({
        isPlaying: false,
        playbackFailure: {
          kind: 'load',
          trackKey: getPlaybackTrackKey(track),
          code: 'media-error',
        },
      }))

      act(() => usePlayerStore.getState().retryCurrentTrack())
      await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2))
      const retryIdentity = loadMock.mock.results.at(-1)?.value as SourceIdentity
      act(() => errorHandler!({ ...retryIdentity, code: 4 }))
      await act(async () => stalePlay.resolve())

      expect(usePlayerStore.getState().playbackFailure).toMatchObject({
        kind: 'load',
        trackKey: getPlaybackTrackKey(track),
      })
    })

    it('当前 Track play 成功应该清除对应错误', async () => {
      act(() => usePlayerStore.setState({
        playbackFailure: {
          kind: 'play',
          trackKey: getPlaybackTrackKey(track),
          code: 'play-rejected',
        },
      }))

      render(<HookHost />)

      await waitFor(() => expect(usePlayerStore.getState().playbackFailure).toBeNull())
    })

    it('Retry 应该重载同一 ID URL，并在 metadata 前恢复最后位置', async () => {
      render(<HookHost />)
      await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(1))
      currentTimeRef.current = 42
      act(() => usePlayerStore.setState({
        isPlaying: false,
        playbackFailure: {
          kind: 'load',
          trackKey: getPlaybackTrackKey(track),
          code: 'media-error',
        },
      }))

      act(() => usePlayerStore.getState().retryCurrentTrack())
      await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2))
      const retryIdentity = loadMock.mock.results.at(-1)?.value as SourceIdentity
      playMock.mockImplementationOnce(async () => {
        expect(engineCurrentTime).toBe(42)
      })
      await act(async () => loadedMetadataHandler!(track.duration, retryIdentity))

      expect(loadMock.mock.calls).toEqual([
        ['qinplayer://audio?id=1&v=0'],
        ['qinplayer://audio?id=1&v=0'],
      ])
      expect(currentTimeSetMock).toHaveBeenCalledWith(42)
    })

    it('无效 Retry 位置应该回到 0', async () => {
      render(<HookHost />)
      await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(1))
      currentTimeRef.current = Number.POSITIVE_INFINITY
      act(() => usePlayerStore.setState({
        isPlaying: false,
        playbackFailure: {
          kind: 'load',
          trackKey: getPlaybackTrackKey(track),
          code: 'media-error',
        },
      }))

      act(() => usePlayerStore.getState().retryCurrentTrack())
      await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2))
      const retryIdentity = loadMock.mock.results.at(-1)?.value as SourceIdentity
      act(() => loadedMetadataHandler!(track.duration, retryIdentity))

      expect(engineCurrentTime).toBe(0)
    })

    it('stale loadWithFade rejection 在 Retry 后不得再触发 fallback', async () => {
      const delayedFade = createDeferred<SourceIdentity | null>()
      act(() => useUIStore.setState({
        featureFlags: { ...DEFAULT_FEATURE_FLAGS, fadeEffect: true },
      }))
      loadWithFadeMock.mockImplementationOnce((source: string) => {
        beginMockLoad(source)
        return delayedFade.promise
      })
      render(<HookHost />)
      await waitFor(() => expect(loadWithFadeMock).toHaveBeenCalledTimes(1))
      act(() => usePlayerStore.setState({
        playbackFailure: {
          kind: 'load',
          trackKey: getPlaybackTrackKey(track),
          code: 'media-error',
        },
      }))

      act(() => usePlayerStore.getState().retryCurrentTrack())
      await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(1))
      await act(async () => delayedFade.reject(new Error('late fade failure')))

      expect(loadMock).toHaveBeenCalledTimes(1)
      expect(usePlayerStore.getState().playbackFailure).toBeNull()
    })
  })

  describe('pending seek', () => {
    it('引擎不存在或 metadata 未就绪时暂存，并在 autoplay 前应用', async () => {
      engineExists = false
      render(<HookHost />)
      await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
      const identity = loadMock.mock.results.at(-1)?.value as SourceIdentity
      act(() => usePlayerStore.getState().setSeekTime(30))
      expect(currentTimeSetMock).not.toHaveBeenCalled()
      engineExists = true
      playMock.mockImplementationOnce(async () => {
        expect(engineCurrentTime).toBe(30)
      })

      await act(async () => loadedMetadataHandler!(100, identity))

      expect(currentTimeSetMock).toHaveBeenCalledWith(30)
      expect(currentTimeRef.current).toBe(30)
    })

    it('同曲连续 seek 只在首次 metadata 应用最后一次并 clamp', async () => {
      render(<HookHost />)
      await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
      const identity = loadMock.mock.results.at(-1)?.value as SourceIdentity
      act(() => usePlayerStore.getState().setSeekTime(20))
      act(() => usePlayerStore.getState().setSeekTime(90))

      act(() => loadedMetadataHandler!(60, identity))
      act(() => loadedMetadataHandler!(60, identity))

      expect(currentTimeSetMock).toHaveBeenCalledTimes(1)
      expect(currentTimeSetMock).toHaveBeenCalledWith(60)
      expect(currentTimeRef.current).toBe(60)
    })

    it('A 的 pending seek 不得应用到 B', async () => {
      render(<HookHost />)
      await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
      act(() => usePlayerStore.getState().setSeekTime(45))
      act(() => usePlayerStore.getState().setCurrentTrack(secondTrack))
      await waitFor(() => expect(loadMock).toHaveBeenCalledWith('qinplayer://audio?id=2&v=0'))
      const secondIdentity = loadMock.mock.results.at(-1)?.value as SourceIdentity

      act(() => loadedMetadataHandler!(secondTrack.duration, secondIdentity))

      expect(currentTimeSetMock).not.toHaveBeenCalledWith(45)
      expect(currentTimeRef.current).toBe(0)
    })

    it('同一批更新中的 A seek 不得被重新绑定到 B', async () => {
      render(<HookHost />)
      await waitFor(() => expect(loadedMetadataHandler).toBeDefined())

      act(() => {
        usePlayerStore.getState().setSeekTime(45)
        usePlayerStore.getState().setCurrentTrack(secondTrack)
      })
      await waitFor(() => expect(loadMock).toHaveBeenCalledWith('qinplayer://audio?id=2&v=0'))
      const secondIdentity = loadMock.mock.results.at(-1)?.value as SourceIdentity
      act(() => loadedMetadataHandler!(secondTrack.duration, secondIdentity))

      expect(currentTimeSetMock).not.toHaveBeenCalledWith(45)
      expect(currentTimeRef.current).toBe(0)
    })

    it('playback 关闭后应该清理 pending seek', async () => {
      render(<HookHost />)
      await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
      const identity = loadMock.mock.results.at(-1)?.value as SourceIdentity
      act(() => usePlayerStore.getState().setSeekTime(45))
      act(() => useUIStore.setState({
        featureFlags: { ...DEFAULT_FEATURE_FLAGS, playback: false },
      }))

      act(() => loadedMetadataHandler!(track.duration, identity))

      expect(currentTimeSetMock).not.toHaveBeenCalledWith(45)
      expect(invalidatePendingLoadsMock).toHaveBeenCalled()
    })

    it('卸载后迟到 metadata 不得消费 pending seek', async () => {
      const view = render(<HookHost />)
      await waitFor(() => expect(loadedMetadataHandler).toBeDefined())
      const identity = loadMock.mock.results.at(-1)?.value as SourceIdentity
      act(() => usePlayerStore.getState().setSeekTime(45))

      view.unmount()
      act(() => loadedMetadataHandler!(track.duration, identity))

      expect(currentTimeSetMock).not.toHaveBeenCalledWith(45)
      expect(invalidatePendingLoadsMock).toHaveBeenCalled()
    })
  })

  describe('Media Session 生命周期', () => {
    it('关闭 flag 应清理 metadata/actions，且不得重新加载音频', async () => {
      render(<HookHost />)
      await waitFor(() => {
        expect(mediaSessionMocks.registerMediaSessionActions).toHaveBeenCalledTimes(1)
        expect(mediaSessionMocks.updateMediaSession).toHaveBeenCalledWith(track)
        expect(loadMock).toHaveBeenCalledTimes(1)
      })

      act(() => useUIStore.getState().setFeatureFlags({
        ...DEFAULT_FEATURE_FLAGS,
        fadeEffect: false,
        mediaSession: false,
      }))

      await waitFor(() => {
        expect(mediaSessionMocks.clearMediaSession).toHaveBeenCalled()
        expect(mediaSessionMocks.unregisterMediaSessionActions).toHaveBeenCalled()
      })
      expect(loadMock).toHaveBeenCalledTimes(1)
    })

    it('卸载时应清理 metadata 和 action handlers', async () => {
      const view = render(<HookHost />)
      await waitFor(() => {
        expect(mediaSessionMocks.registerMediaSessionActions).toHaveBeenCalledTimes(1)
      })

      view.unmount()

      expect(mediaSessionMocks.unregisterMediaSessionActions).toHaveBeenCalled()
      expect(mediaSessionMocks.clearMediaSession).toHaveBeenCalled()
    })
  })
})
