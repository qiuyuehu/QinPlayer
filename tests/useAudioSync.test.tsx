/**
 * useAudioSync 测试
 * 覆盖：fadeEffect=false 时 loadWithFade 降级为直接 load
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
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
})
