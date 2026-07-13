/**
 * useAudioSync 测试
 * 覆盖：fadeEffect=false 时 loadWithFade 降级为直接 load
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { useAudioSync } from '../src/hooks/useAudioSync'
import { usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { currentTimeRef } from '../src/utils/currentTimeRef'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { Track } from '../src/types'

const loadMock = vi.fn()
const loadWithFadeMock = vi.fn().mockResolvedValue(undefined)
const playMock = vi.fn().mockResolvedValue(undefined)
const pauseMock = vi.fn()
let timeUpdateHandler: ((time: number, duration: number) => void) | undefined
let loadedMetadataHandler: ((duration: number) => void) | undefined
let endedHandler: (() => void) | undefined
let enginePlaying = true

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
const onLoadedMetadataMock = vi.fn((callback: (duration: number) => void) => {
  loadedMetadataHandler = callback
})
const onEndedMock = vi.fn((callback: () => void) => {
  endedHandler = callback
})

vi.mock('../src/utils/AudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    get playing() { return enginePlaying },
    load: loadMock,
    loadWithFade: loadWithFadeMock,
    play: playMock,
    pause: pauseMock,
    setVolume: vi.fn(),
    onTimeUpdate: onTimeUpdateMock,
    onEnded: onEndedMock,
    onLoadedMetadata: onLoadedMetadataMock,
  })),
  hasAudioEngine: vi.fn(() => true),
}))

vi.mock('../src/utils/mediaSession', () => ({
  registerMediaSessionActions: vi.fn(),
  updateMediaSession: vi.fn(),
  setPlaybackState: vi.fn(),
}))

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

describe('useAudioSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    timeUpdateHandler = undefined
    loadedMetadataHandler = undefined
    endedHandler = undefined
    enginePlaying = true
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
        volume: 0.8,
        playMode: 'sequential',
        fadeEnabled: true,
        lyricOffset: 0,
        duration: 0,
        seekTime: null,
      })
    })
  })

  it('fadeEffect=false 时应该直接 load，不调用 loadWithFade', async () => {
    render(<HookHost />)

    await waitFor(() => {
      expect(loadMock).toHaveBeenCalledWith('qinplayer://audio?path=C%3A%5Cmusic%5Ca.mp3')
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
        'qinplayer://audio?path=C%3A%5Cmusic%5C2.mp3',
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
        'qinplayer://audio?path=C%3A%5Cmusic%5C2.mp3',
        500,
      )
    })
    act(() => usePlayerStore.getState().nextTrack())
    await waitFor(() => {
      expect(loadWithFadeMock).toHaveBeenCalledWith(
        'qinplayer://audio?path=C%3A%5Cmusic%5C3.mp3',
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
})
