/**
 * LyricsPanel 组件测试
 * 覆盖单语、双语、混合歌词的可见行数规则
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import LyricsPanel from '../src/components/LyricsPanel'
import Lyrics from '../src/pages/Lyrics'
import { usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { currentTimeRef } from '../src/utils/currentTimeRef'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { LyricLine, Track } from '../src/types'

const originalScrollTo = HTMLElement.prototype.scrollTo

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    value: vi.fn(function (
      this: HTMLElement,
      options?: ScrollToOptions | number,
      y?: number,
    ) {
      this.scrollTop = typeof options === 'number' ? (y ?? 0) : (options?.top ?? 0)
    }),
    writable: true,
  })
})

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    value: originalScrollTo,
    writable: true,
  })
})

// 创建足够长的歌词，确保测试不受首尾边界影响。
function createLyrics(withTranslation = false): LyricLine[] {
  return Array.from({ length: 10 }, (_, index) => ({
    time: index * 5,
    text: `第 ${index + 1} 行歌词`,
    ...(withTranslation ? { translation: `第 ${index + 1} 行翻译` } : {}),
  }))
}

// LyricsPanel 会保留所有 DOM 节点，以行内 opacity 判断当前可见行。
function countVisibleLines(container: HTMLElement): number {
  const lines = container.querySelectorAll('.lyrics-panel__line')
  return Array.from(lines).filter((line) => {
    const opacity = Number.parseFloat(window.getComputedStyle(line).opacity)
    return opacity > 0
  }).length
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createTrack(id: number, title: string): Track {
  return {
    id,
    filePath: `C:\\music\\${id}.mp3`,
    fileName: `${id}.mp3`,
    title,
    artist: '测试歌手',
    album: '测试专辑',
    duration: 180,
    coverPath: null,
    mtime: 0,
    playCount: 0,
    createdAt: '2026-07-10',
  }
}

function mockLrcRequests(...responses: Promise<string | null>[]) {
  let responseIndex = 0
  const invoke = vi.fn((channel: string) => {
    if (channel === 'read-lrc-file') {
      return responses[responseIndex++] ?? Promise.resolve(null)
    }
    return Promise.resolve(null)
  })
  window.electronAPI.invoke = invoke
  return invoke
}

async function resolveLrc(deferred: Deferred<string | null>, content: string | null) {
  await act(async () => {
    deferred.resolve(content)
    await deferred.promise
  })
}

describe('LyricsPanel 歌词行数', () => {
  it('切换当前歌词时应该更新方向状态类', () => {
    const lyrics = createLyrics()
    const { container, rerender } = render(
      <LyricsPanel
        lyrics={lyrics}
        currentIndex={4}
        featureFlags={DEFAULT_FEATURE_FLAGS}
      />,
    )
    let lines = container.querySelectorAll('.lyrics-panel__line')

    expect(lines[3]).toHaveClass('lyrics-panel__line--past')
    expect(lines[4]).toHaveClass('lyrics-panel__line--active')
    expect(lines[5]).toHaveClass('lyrics-panel__line--future')

    rerender(
      <LyricsPanel
        lyrics={lyrics}
        currentIndex={5}
        featureFlags={DEFAULT_FEATURE_FLAGS}
      />,
    )
    lines = container.querySelectorAll('.lyrics-panel__line')

    expect(lines[4]).toHaveClass('lyrics-panel__line--past')
    expect(lines[5]).toHaveClass('lyrics-panel__line--active')
  })

  it('布局版本变化时应该立即重新定位当前歌词', () => {
    const lyrics = createLyrics()
    const { rerender } = render(
      <LyricsPanel
        lyrics={lyrics}
        currentIndex={4}
        featureFlags={DEFAULT_FEATURE_FLAGS}
        layoutRevision={0}
      />,
    )
    const scrollToMock = vi.mocked(HTMLElement.prototype.scrollTo)
    scrollToMock.mockClear()

    rerender(
      <LyricsPanel
        lyrics={lyrics}
        currentIndex={4}
        featureFlags={DEFAULT_FEATURE_FLAGS}
        layoutRevision={1}
      />,
    )

    expect(scrollToMock).toHaveBeenCalled()
    expect(scrollToMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: 'auto' }),
    )
  })

  it('单语歌词开启更多行时应该显示 6 行', () => {
    const { container } = render(
      <LyricsPanel
        lyrics={createLyrics()}
        currentIndex={4}
        featureFlags={{ ...DEFAULT_FEATURE_FLAGS, lyricsMoreLines: true }}
      />,
    )

    expect(countVisibleLines(container)).toBe(6)
  })

  it('单语歌词关闭更多行时应该显示 3 行', () => {
    const { container } = render(
      <LyricsPanel
        lyrics={createLyrics()}
        currentIndex={4}
        featureFlags={{ ...DEFAULT_FEATURE_FLAGS, lyricsMoreLines: false }}
      />,
    )

    expect(countVisibleLines(container)).toBe(3)
  })

  it('双语歌词开启更多行时仍应该显示 3 行', () => {
    const { container } = render(
      <LyricsPanel
        lyrics={createLyrics(true)}
        currentIndex={4}
        featureFlags={{ ...DEFAULT_FEATURE_FLAGS, lyricsMoreLines: true }}
      />,
    )

    expect(countVisibleLines(container)).toBe(3)
  })

  it('双语歌词关闭更多行时应该显示 3 行', () => {
    const { container } = render(
      <LyricsPanel
        lyrics={createLyrics(true)}
        currentIndex={4}
        featureFlags={{ ...DEFAULT_FEATURE_FLAGS, lyricsMoreLines: false }}
      />,
    )

    expect(countVisibleLines(container)).toBe(3)
  })

  it('部分歌词有翻译时应该按双语显示 3 行', () => {
    const lyrics = createLyrics()
    lyrics[2] = { ...lyrics[2], translation: '局部翻译' }
    const { container } = render(
      <LyricsPanel
        lyrics={lyrics}
        currentIndex={4}
        featureFlags={{ ...DEFAULT_FEATURE_FLAGS, lyricsMoreLines: true }}
      />,
    )

    expect(countVisibleLines(container)).toBe(3)
  })

  it('空歌词应该渲染空面板', () => {
    const { container } = render(
      <LyricsPanel
        lyrics={[]}
        currentIndex={-1}
        featureFlags={DEFAULT_FEATURE_FLAGS}
      />,
    )

    expect(container.querySelector('.lyrics-panel--empty')).toBeInTheDocument()
    expect(container.querySelectorAll('.lyrics-panel__line')).toHaveLength(0)
  })
})

describe('Lyrics 切歌重置', () => {
  const originalInvoke = window.electronAPI.invoke
  const trackA = createTrack(1, '歌曲 A')
  const trackB = createTrack(2, '歌曲 B')

  beforeEach(() => {
    vi.clearAllMocks()
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
        currentTrack: null,
        playlist: [],
        volume: 0.8,
        playMode: 'sequential',
        fadeEnabled: true,
        lyricOffset: 0,
        duration: 0,
        seekTime: null,
      })
    })
  })

  afterEach(() => {
    window.electronAPI.invoke = originalInvoke
  })

  it('切歌时应该立即移除上一首歌词', async () => {
    const firstRequest = createDeferred<string | null>()
    const secondRequest = createDeferred<string | null>()
    const invoke = mockLrcRequests(firstRequest.promise, secondRequest.promise)

    act(() => {
      usePlayerStore.setState({
        currentTrack: trackA,
        playlist: [trackA, trackB],
        duration: trackA.duration,
      })
    })
    const { container } = render(<Lyrics />)

    await resolveLrc(firstRequest, '[00:00.00]第一首的歌词')
    await waitFor(() => expect(container).toHaveTextContent('第一首的歌词'))

    act(() => {
      usePlayerStore.setState({ currentTrack: trackB, duration: trackB.duration })
    })

    expect(container).not.toHaveTextContent('第一首的歌词')
    await waitFor(() => {
      expect(invoke.mock.calls.filter(([channel]) => channel === 'read-lrc-file')).toHaveLength(2)
    })
  })

  it('切歌时应该替换歌词面板节点并将滚动位置归零', async () => {
    const firstRequest = createDeferred<string | null>()
    const secondRequest = createDeferred<string | null>()
    mockLrcRequests(firstRequest.promise, secondRequest.promise)

    act(() => {
      usePlayerStore.setState({
        currentTrack: trackA,
        playlist: [trackA, trackB],
        duration: trackA.duration,
      })
    })
    const { container } = render(<Lyrics />)

    await resolveLrc(firstRequest, '[00:00.00]第一首的歌词')
    await waitFor(() => expect(container).toHaveTextContent('第一首的歌词'))

    const oldPanel = container.querySelector<HTMLElement>('.lyrics-panel')
    expect(oldPanel).not.toBeNull()
    oldPanel!.scrollTop = 240
    expect(oldPanel!.scrollTop).toBe(240)

    act(() => {
      usePlayerStore.setState({ currentTrack: trackB, duration: trackB.duration })
    })

    const newPanel = container.querySelector<HTMLElement>('.lyrics-panel')
    expect(newPanel).not.toBeNull()
    expect(newPanel).not.toBe(oldPanel)
    expect(newPanel!.scrollTop).toBe(0)
  })

  it('快速往返切歌时应该只保留最后一次请求的歌词', async () => {
    const firstARequest = createDeferred<string | null>()
    const bRequest = createDeferred<string | null>()
    const secondARequest = createDeferred<string | null>()
    const invoke = mockLrcRequests(
      firstARequest.promise,
      bRequest.promise,
      secondARequest.promise,
    )

    act(() => {
      usePlayerStore.setState({
        currentTrack: trackA,
        playlist: [trackA, trackB],
        duration: trackA.duration,
      })
    })
    const { container, queryAllByText } = render(<Lyrics />)

    act(() => {
      usePlayerStore.setState({ currentTrack: trackB, duration: trackB.duration })
    })
    act(() => {
      usePlayerStore.setState({ currentTrack: trackA, duration: trackA.duration })
    })
    await waitFor(() => {
      expect(invoke.mock.calls.filter(([channel]) => channel === 'read-lrc-file')).toHaveLength(3)
    })

    await resolveLrc(secondARequest, '[00:00.00]第二次A的歌词')
    await waitFor(() => expect(container).toHaveTextContent('第二次A的歌词'))

    await resolveLrc(bRequest, '[00:00.00]过期B的歌词')
    await resolveLrc(firstARequest, '[00:00.00]过期A的歌词')

    await waitFor(() => {
      expect(queryAllByText('第二次A的歌词')).toHaveLength(1)
      expect(container).not.toHaveTextContent('过期B的歌词')
      expect(container).not.toHaveTextContent('过期A的歌词')
    })
  })

  it('连续切换无歌词歌曲时应该保持空面板且不崩溃', async () => {
    const firstRequest = createDeferred<string | null>()
    const secondRequest = createDeferred<string | null>()
    mockLrcRequests(firstRequest.promise, secondRequest.promise)

    act(() => {
      usePlayerStore.setState({
        currentTrack: trackA,
        playlist: [trackA, trackB],
        duration: trackA.duration,
      })
    })
    const { container } = render(<Lyrics />)

    await resolveLrc(firstRequest, null)
    await waitFor(() => {
      expect(container.querySelector('.lyrics-panel--empty')).toBeInTheDocument()
    })

    act(() => {
      usePlayerStore.setState({ currentTrack: trackB, duration: trackB.duration })
    })
    await resolveLrc(secondRequest, null)

    await waitFor(() => {
      expect(container.querySelector('.lyrics-panel--empty')).toBeInTheDocument()
      expect(container.querySelectorAll('.lyrics-panel__line')).toHaveLength(0)
    })
  })
})
