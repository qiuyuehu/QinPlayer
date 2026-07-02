/**
 * useAudioSync 测试
 * 覆盖：fadeEffect=false 时 loadWithFade 降级为直接 load
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useAudioSync } from '../src/hooks/useAudioSync'
import { usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { Track } from '../src/types'

const loadMock = vi.fn()
const loadWithFadeMock = vi.fn().mockResolvedValue(undefined)
const playMock = vi.fn().mockResolvedValue(undefined)

vi.mock('../src/utils/AudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    load: loadMock,
    loadWithFade: loadWithFadeMock,
    play: playMock,
    pause: vi.fn(),
    setVolume: vi.fn(),
    onTimeUpdate: vi.fn(),
    onEnded: vi.fn(),
    onLoadedMetadata: vi.fn(),
  })),
  hasAudioEngine: vi.fn(() => true),
}))

vi.mock('../src/utils/mediaSession', () => ({
  registerMediaSessionActions: vi.fn(),
  updateMediaSession: vi.fn(),
  setPlaybackState: vi.fn(),
}))

const track: Track = {
  id: 1,
  filePath: 'C:\\music\\a.mp3',
  fileName: 'a.mp3',
  title: '晴天',
  artist: '周杰伦',
  album: '叶惠美',
  duration: 269,
  coverPath: null,
  mtime: 0,
  playCount: 0,
  createdAt: '',
}

function HookHost() {
  useAudioSync()
  return null
}

describe('useAudioSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('fadeEffect=false 时应该直接 load，不调用 loadWithFade', async () => {
    render(<HookHost />)

    await waitFor(() => {
      expect(loadMock).toHaveBeenCalledWith('qinplayer://audio?path=C%3A%5Cmusic%5Ca.mp3')
    })
    expect(loadWithFadeMock).not.toHaveBeenCalled()
  })
})
