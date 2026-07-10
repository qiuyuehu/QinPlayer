/**
 * Lyrics 全屏布局测试
 * 覆盖 fullscreenchange 到 LyricsPanel 布局版本的状态传递
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { currentTimeRef } from '../src/utils/currentTimeRef'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { Track } from '../src/types'

vi.mock('../src/components/LyricsPanel', () => ({
  default: ({ layoutRevision = 0 }: { layoutRevision?: number }) => (
    <div
      data-testid="lyrics-panel-mock"
      data-layout-revision={layoutRevision}
    />
  ),
}))

import Lyrics from '../src/pages/Lyrics'

const track: Track = {
  id: 1,
  filePath: 'C:\\music\\fullscreen.mp3',
  fileName: 'fullscreen.mp3',
  title: '全屏测试歌曲',
  artist: '测试歌手',
  album: '测试专辑',
  duration: 180,
  coverPath: null,
  mtime: 0,
  playCount: 0,
  createdAt: '2026-07-10',
}

describe('Lyrics 全屏布局', () => {
  const originalInvoke = window.electronAPI.invoke
  const originalPlayerState = usePlayerStore.getState()
  const originalUIState = useUIStore.getState()
  const originalCurrentTime = currentTimeRef.current
  let fullscreenElement: Element | null = null

  beforeEach(() => {
    fullscreenElement = null
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    window.electronAPI.invoke = vi.fn().mockResolvedValue(null)
    currentTimeRef.current = 0
    act(() => {
      useUIStore.setState({
        activeNav: 'lyrics',
        isMiniMode: false,
        theme: 'dark',
        sidebarCollapsed: false,
        searchQuery: '',
        featureFlags: { ...DEFAULT_FEATURE_FLAGS },
      })
      usePlayerStore.setState({
        isPlaying: false,
        currentTrack: track,
        playlist: [track],
        volume: 0.8,
        playMode: 'sequential',
        fadeEnabled: true,
        lyricOffset: 0,
        duration: track.duration,
        seekTime: null,
      })
    })
  })

  afterEach(() => {
    act(() => {
      usePlayerStore.setState(originalPlayerState)
      useUIStore.setState(originalUIState)
    })
    currentTimeRef.current = originalCurrentTime
    delete (document as Document & { fullscreenElement?: Element | null }).fullscreenElement
    window.electronAPI.invoke = originalInvoke
  })

  it('fullscreenchange 应该把布局版本传给歌词面板', async () => {
    render(<Lyrics />)
    const panel = screen.getByTestId('lyrics-panel-mock')
    expect(panel).toHaveAttribute('data-layout-revision', '0')

    act(() => {
      fullscreenElement = document.documentElement
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    await waitFor(() => {
      expect(panel).toHaveAttribute('data-layout-revision', '1')
    })

    act(() => {
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    await waitFor(() => {
      expect(panel).toHaveAttribute('data-layout-revision', '0')
    })
  })
})
