/**
 * MiniQueueView 测试
 * 覆盖空队列、行信息、当前项、点击、定位和封面降级
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import MiniQueueView from '../src/components/MiniQueueView'
import type { Track } from '../src/types'

const trackA: Track = {
  id: 1,
  filePath: 'C:\\music\\a.mp3',
  fileName: 'a.mp3',
  title: '歌曲 A',
  artist: '歌手 A',
  album: '专辑 A',
  duration: 185,
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
  duration: 62,
  coverPath: 'C:\\covers\\b.jpg',
}

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
const scrollIntoViewMock = vi.fn()

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollIntoViewMock,
  })
})

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: originalScrollIntoView,
  })
})

describe('MiniQueueView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.electronAPI = {
      ...window.electronAPI,
      invoke: vi.fn(async () => null),
    }
  })

  it('空队列时应该显示空状态', () => {
    render(<MiniQueueView tracks={[]} currentTrackId={null} onPlay={vi.fn()} />)

    expect(screen.getByText('当前播放队列为空')).toBeInTheDocument()
  })

  it('队列行应该显示封面占位、歌曲信息和格式化时长', () => {
    const { container } = render(
      <MiniQueueView tracks={[trackA, trackB]} currentTrackId={null} onPlay={vi.fn()} />,
    )

    expect(container.querySelector('.mini-queue-view__cover--placeholder')).toBeInTheDocument()
    expect(screen.getByText('歌曲 A')).toBeInTheDocument()
    expect(screen.getByText('歌手 A')).toBeInTheDocument()
    expect(screen.getByText('3:05')).toBeInTheDocument()
    expect(screen.getByAltText('歌曲 B 封面')).toHaveAttribute(
      'src',
      'qinplayer://cover?path=C%3A%5Ccovers%5Cb.jpg',
    )
  })

  it('当前歌曲应该带 active 类和 aria-current', () => {
    render(
      <MiniQueueView tracks={[trackA, trackB]} currentTrackId={2} onPlay={vi.fn()} />,
    )

    const currentRow = screen.getByRole('button', { name: /歌曲 B/ })
    expect(currentRow).toHaveClass('mini-queue-view__item--active')
    expect(currentRow).toHaveAttribute('aria-current', 'true')
  })

  it('点击非当前歌曲时应该只调用一次 onPlay', () => {
    const onPlay = vi.fn()
    render(
      <MiniQueueView tracks={[trackA, trackB]} currentTrackId={1} onPlay={onPlay} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /歌曲 B/ }))

    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onPlay).toHaveBeenCalledWith(trackB)
  })

  it('当前歌曲变化时应该立即滚动到可见范围', () => {
    const { rerender } = render(
      <MiniQueueView tracks={[trackA, trackB]} currentTrackId={1} onPlay={vi.fn()} />,
    )
    scrollIntoViewMock.mockClear()

    rerender(
      <MiniQueueView tracks={[trackA, trackB]} currentTrackId={2} onPlay={vi.fn()} />,
    )

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: 'nearest',
      behavior: 'auto',
    })
  })

  it('封面加载失败后应该改为占位且不保留破图', () => {
    const { container } = render(
      <MiniQueueView tracks={[trackB]} currentTrackId={2} onPlay={vi.fn()} />,
    )

    fireEvent.error(screen.getByAltText('歌曲 B 封面'))

    expect(screen.queryByAltText('歌曲 B 封面')).not.toBeInTheDocument()
    expect(container.querySelector('.mini-queue-view__cover--placeholder')).toBeInTheDocument()
  })

  it('source 右键应该调用原生菜单且不渲染 HTML ContextMenu', async () => {
    const { container } = render(
      <MiniQueueView tracks={[trackA, trackB]} currentTrackId={1} onPlay={vi.fn()} />,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: /歌曲 A - 歌手 A/ }))

    await waitFor(() => expect(window.electronAPI.invoke).toHaveBeenCalledWith('context-menu:show-track', {
      entries: expect.arrayContaining([
        { action: 'insert-next', enabled: false },
        { action: 'remove-playlist', enabled: true },
      ]),
      theme: 'dark',
      reducedMotion: false,
    }))
    expect(container.querySelector('.context-menu')).not.toBeInTheDocument()
  })

  it('priority 右键应该只提供 priority 移除动作', async () => {
    render(
      <MiniQueueView tracks={[trackA]} priorityQueue={[trackB]} currentTrackId={1} onPlay={vi.fn()} />,
    )
    const priorityRow = screen.getByText('歌曲 B').closest('.mini-queue-view__item')!

    fireEvent.contextMenu(priorityRow)

    await waitFor(() => {
      const payload = vi.mocked(window.electronAPI.invoke).mock.calls.find(([channel]) => channel === 'context-menu:show-track')?.[1] as { entries: Array<{ action: string }> }
      expect(payload.entries.map((entry) => entry.action)).toContain('remove-priority')
      expect(payload.entries.map((entry) => entry.action)).not.toContain('remove-playlist')
    })
  })

  it('原生菜单选择歌曲信息后仍应该显示 renderer Dialog', async () => {
    vi.mocked(window.electronAPI.invoke).mockResolvedValueOnce('show-info')
    render(<MiniQueueView tracks={[trackA]} currentTrackId={null} onPlay={vi.fn()} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: /歌曲 A - 歌手 A/ }))

    expect(await screen.findByText('歌曲信息')).toBeInTheDocument()
    expect(screen.getByText('a.mp3')).toBeInTheDocument()
  })
})
