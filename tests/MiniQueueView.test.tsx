/**
 * MiniQueueView 测试
 * 覆盖空队列、行信息、当前项、点击、定位和封面降级
 */
import { fireEvent, render, screen } from '@testing-library/react'
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
})
