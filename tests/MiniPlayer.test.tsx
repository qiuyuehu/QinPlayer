/**
 * MiniPlayer 三视图集成测试
 * 覆盖视图切换、共同控制、feature flags、播放入口和共享 RAF
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MiniPlayer from '../src/components/MiniPlayer'
import { usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { currentTimeRef } from '../src/utils/currentTimeRef'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { Track } from '../src/types'

const trackA: Track = {
  id: 1,
  filePath: 'C:\\music\\a.mp3',
  fileName: 'a.mp3',
  title: '歌曲 A',
  artist: '歌手 A',
  album: '专辑 A',
  duration: 180,
  coverPath: null,
  mtime: 0,
  playCount: 0,
  createdAt: '2026-07-10',
}

const trackB: Track = {
  ...trackA,
  id: 2,
  filePath: 'C:\\music\\b.mp3',
  fileName: 'b.mp3',
  title: '歌曲 B',
  artist: '歌手 B',
  duration: 200,
}

const invokeMock = vi.fn()
const originalInvoke = window.electronAPI.invoke
const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

function getViewButtons(): HTMLButtonElement[] {
  return [
    screen.getByRole('button', { name: '歌曲视图' }),
    screen.queryByRole('button', { name: '歌词视图' }),
    screen.queryByRole('button', { name: '队列视图' }),
  ].filter((button): button is HTMLButtonElement => button !== null)
}

function expectCommonControls(): void {
  expect(screen.getByTitle('静音')).toBeInTheDocument()
  expect(screen.getByTitle('上一首')).toBeInTheDocument()
  expect(screen.getByTitle('暂停')).toBeInTheDocument()
  expect(screen.getByTitle('下一首')).toBeInTheDocument()
  expect(screen.getByTitle('展开')).toBeInTheDocument()
  expect(screen.getByTitle('关闭')).toBeInTheDocument()
}

describe('MiniPlayer', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockImplementation((channel: string) => {
      if (channel === 'read-lrc-file') {
        return Promise.resolve('[00:01.00]第一句\n[00:02.00]第二句\n[00:03.00]第三句')
      }
      return Promise.resolve(null)
    })
    window.electronAPI.invoke = invokeMock
    currentTimeRef.current = 0
    act(() => {
      useUIStore.setState({
        activeNav: 'albums',
        isMiniMode: true,
        theme: 'dark',
        sidebarCollapsed: false,
        searchQuery: '',
        featureFlags: { ...DEFAULT_FEATURE_FLAGS },
      })
      usePlayerStore.setState({
        isPlaying: true,
        currentTrack: trackA,
        playlist: [trackA, trackB],
        volume: 0.8,
        playMode: 'sequential',
        fadeEnabled: true,
        lyricOffset: 0,
        duration: trackA.duration,
        seekTime: null,
      })
    })
  })

  afterEach(() => {
    window.electronAPI.invoke = originalInvoke
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
  })

  it('初始应该选中歌曲视图且只有一个 active 入口', () => {
    render(<MiniPlayer />)

    expect(screen.getByRole('group', { name: '迷你播放器视图' })).toBeInTheDocument()
    expect(screen.getByText('歌曲 A')).toBeInTheDocument()
    expect(getViewButtons().filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '歌曲视图' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('点击视图入口应该直接切换且重复点击保持当前视图', async () => {
    render(<MiniPlayer />)

    fireEvent.click(screen.getByRole('button', { name: '歌词视图' }))
    expect(await screen.findByText('第一句')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '歌词视图' }))
    expect(screen.getByRole('button', { name: '歌词视图' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '队列视图' }))
    expect(screen.getByRole('button', { name: /歌曲 B - 歌手 B/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '歌曲视图' }))
    expect(screen.getByText('歌曲 A')).toBeInTheDocument()
  })

  it('所有视图都应该保留共同播放控制、展开和关闭', async () => {
    render(<MiniPlayer />)
    expectCommonControls()

    fireEvent.click(screen.getByRole('button', { name: '歌词视图' }))
    await screen.findByText('第一句')
    expectCommonControls()

    fireEvent.click(screen.getByRole('button', { name: '队列视图' }))
    expectCommonControls()
  })

  it('展开应该保留导航而关闭应该返回本地音乐', () => {
    const firstRender = render(<MiniPlayer />)

    fireEvent.click(screen.getByTitle('展开'))
    expect(useUIStore.getState().isMiniMode).toBe(false)
    expect(useUIStore.getState().activeNav).toBe('albums')

    firstRender.unmount()
    act(() => useUIStore.setState({ isMiniMode: true, activeNav: 'albums' }))
    render(<MiniPlayer />)
    fireEvent.click(screen.getByTitle('关闭'))

    expect(useUIStore.getState().isMiniMode).toBe(false)
    expect(useUIStore.getState().activeNav).toBe('local')
  })

  it('关闭视图 feature flag 时应该隐藏入口且不读取歌词', () => {
    act(() => {
      useUIStore.setState({
        featureFlags: {
          ...DEFAULT_FEATURE_FLAGS,
          lyrics: false,
          queuePanel: false,
        },
      })
    })

    render(<MiniPlayer />)

    expect(screen.queryByRole('button', { name: '歌词视图' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '队列视图' })).not.toBeInTheDocument()
    expect(invokeMock.mock.calls.filter(([channel]) => channel === 'read-lrc-file')).toHaveLength(0)
  })

  it('当前视图对应 flag 关闭时应该自动回到歌曲视图', async () => {
    render(<MiniPlayer />)
    fireEvent.click(screen.getByRole('button', { name: '歌词视图' }))
    await screen.findByText('第一句')

    act(() => {
      useUIStore.getState().setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, lyrics: false })
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '歌曲视图' })).toHaveAttribute('aria-pressed', 'true')
    })

    act(() => {
      useUIStore.getState().setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS })
    })
    fireEvent.click(screen.getByRole('button', { name: '队列视图' }))
    act(() => {
      useUIStore.getState().setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, queuePanel: false })
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '歌曲视图' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('卸载后重新挂载应该恢复歌曲视图', () => {
    const firstRender = render(<MiniPlayer />)
    fireEvent.click(screen.getByRole('button', { name: '队列视图' }))
    expect(screen.getByRole('button', { name: '队列视图' })).toHaveAttribute('aria-pressed', 'true')

    firstRender.unmount()
    render(<MiniPlayer />)

    expect(screen.getByRole('button', { name: '歌曲视图' })).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([
    ['playback', { playback: false, miniMode: true }],
    ['miniMode', { playback: true, miniMode: false }],
  ])('%s=false 时应该不渲染且不读取歌词', (_label, flags) => {
    act(() => {
      useUIStore.setState({
        isMiniMode: flags.miniMode,
        featureFlags: { ...DEFAULT_FEATURE_FLAGS, playback: flags.playback },
      })
    })

    const { container } = render(<MiniPlayer />)

    expect(container.querySelector('.mini-player')).not.toBeInTheDocument()
    expect(invokeMock.mock.calls.filter(([channel]) => channel === 'read-lrc-file')).toHaveLength(0)
  })

  it('点击迷你队列歌曲应该通过共享 action 只记账一次', () => {
    render(<MiniPlayer />)
    fireEvent.click(screen.getByRole('button', { name: '队列视图' }))

    fireEvent.click(screen.getByRole('button', { name: /歌曲 B - 歌手 B/ }))

    expect(usePlayerStore.getState().currentTrack).toEqual(trackB)
    expect(invokeMock.mock.calls.filter(([channel]) => channel === 'songs:recordPlay')).toHaveLength(1)
    expect(invokeMock.mock.calls.filter(([channel]) => channel === 'songs:updatePlayCount')).toHaveLength(1)
  })

  it('推进共享 RAF 时应该更新歌词视图的 active 行', async () => {
    let frameCallback: FrameRequestCallback | undefined
    globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback
      return 1
    })
    globalThis.cancelAnimationFrame = vi.fn()
    const view = render(<MiniPlayer />)

    fireEvent.click(screen.getByRole('button', { name: '歌词视图' }))
    await screen.findByText('第一句')
    expect(document.querySelector('.mini-lyrics-view__line--active')).not.toBeInTheDocument()

    act(() => {
      currentTimeRef.current = 2.2
      frameCallback?.(0)
    })

    await waitFor(() => {
      expect(screen.getByText('第二句').closest('.mini-lyrics-view__line')).toHaveClass(
        'mini-lyrics-view__line--active',
      )
    })
    view.unmount()
  })

  it('切换到相同时长歌曲时应该重置 RAF 歌词索引缓存', async () => {
    let frameCallback: FrameRequestCallback | undefined
    globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback
      return 1
    })
    globalThis.cancelAnimationFrame = vi.fn()
    invokeMock.mockImplementation((channel: string, lrcPath?: unknown) => {
      if (channel !== 'read-lrc-file') return Promise.resolve(null)
      return Promise.resolve(
        String(lrcPath).endsWith('b.lrc')
          ? '[00:01.00]乙一\n[00:02.00]乙二'
          : '[00:01.00]甲一\n[00:02.00]甲二',
      )
    })
    const sameDurationTrackB = { ...trackB, duration: trackA.duration }
    const view = render(<MiniPlayer />)

    fireEvent.click(screen.getByRole('button', { name: '歌词视图' }))
    await screen.findByText('甲一')
    act(() => {
      currentTimeRef.current = 2.2
      frameCallback?.(0)
    })
    await waitFor(() => {
      expect(screen.getByText('甲二').closest('.mini-lyrics-view__line')).toHaveClass(
        'mini-lyrics-view__line--active',
      )
    })

    act(() => usePlayerStore.getState().playTrack(sameDurationTrackB))
    await screen.findByText('乙一')
    act(() => {
      currentTimeRef.current = 2.2
      frameCallback?.(0)
    })

    await waitFor(() => {
      expect(screen.getByText('乙二').closest('.mini-lyrics-view__line')).toHaveClass(
        'mini-lyrics-view__line--active',
      )
    })
    view.unmount()
  })
})
