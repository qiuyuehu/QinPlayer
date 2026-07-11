import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Lyrics from '../src/pages/Lyrics'
import { usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { Track } from '../src/types'

const lyricFixture = vi.hoisted(() => ([
  { time: 10, text: '第一句' },
  { time: 20, text: '第二句' },
]))
vi.mock('../src/hooks/useTrackLyrics', () => ({ useTrackLyrics: () => lyricFixture }))
vi.mock('../src/utils/colorExtract', () => ({ extractMainColor: vi.fn().mockResolvedValue('#222') }))

const track: Track = {
  id: 1,
  filePath: 'C:\\music\\song.mp3',
  fileName: 'song.mp3',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  duration: 100,
  coverPath: null,
  mtime: 0,
  playCount: 0,
  createdAt: '2026-07-11',
}

const originalScrollTo = HTMLElement.prototype.scrollTo

describe('Lyrics performance lifecycle', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })
    useUIStore.setState({
      activeNav: 'lyrics',
      previousNav: 'local',
      featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    })
    usePlayerStore.setState({
      currentTrack: track,
      duration: 100,
      seekTime: null,
      isPlaying: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalScrollTo) {
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
        configurable: true,
        value: originalScrollTo,
      })
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
    }
  })

  it('进度拖拽中离开歌词页应主动清理 document listener 且不提交 seek', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    render(<Lyrics />)

    fireEvent.mouseDown(document.querySelector('.lyrics-page__progress-bar')!, { clientX: 10 })
    act(() => useUIStore.getState().setActiveNav('local'))
    document.dispatchEvent(new MouseEvent('mouseup'))

    expect(removeSpy.mock.calls.filter(([type]) => type === 'mousemove')).toHaveLength(1)
    expect(removeSpy.mock.calls.filter(([type]) => type === 'mouseup')).toHaveLength(1)
    expect(usePlayerStore.getState().seekTime).toBeNull()
  })

  it('暂停时不应持续 RAF，点击歌词应立即更新 active 行，播放后恢复循环', () => {
    const originalRequest = globalThis.requestAnimationFrame
    const originalCancel = globalThis.cancelAnimationFrame
    const requestRaf = vi.fn((_callback: FrameRequestCallback) => 1)
    const cancelRaf = vi.fn()
    globalThis.requestAnimationFrame = requestRaf
    globalThis.cancelAnimationFrame = cancelRaf
    const view = render(<Lyrics />)

    expect(requestRaf).not.toHaveBeenCalled()
    fireEvent.click(document.querySelectorAll('.lyrics-panel__line')[1])
    expect(usePlayerStore.getState().seekTime).toBe(20)
    expect(document.querySelectorAll('.lyrics-panel__line')[1]).toHaveClass('lyrics-panel__line--active')

    act(() => usePlayerStore.getState().setPlaying(true))
    expect(requestRaf).toHaveBeenCalledTimes(1)
    act(() => useUIStore.getState().setActiveNav('local'))
    expect(cancelRaf).toHaveBeenCalledWith(1)

    view.unmount()
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
  })
})
