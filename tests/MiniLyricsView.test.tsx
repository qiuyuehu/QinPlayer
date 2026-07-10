/**
 * MiniLyricsView 测试
 * 覆盖空状态、当前/下一句、双语和首尾边界
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MiniLyricsView from '../src/components/MiniLyricsView'
import type { LyricLine, Track } from '../src/types'

const track: Track = {
  id: 1,
  filePath: 'C:\\music\\lyrics.mp3',
  fileName: 'lyrics.mp3',
  title: '歌词测试歌曲',
  artist: '测试歌手',
  album: '测试专辑',
  duration: 180,
  coverPath: null,
  mtime: 0,
  playCount: 0,
  createdAt: '2026-07-10',
}

const lyrics: LyricLine[] = [
  { time: 1, text: '第一句', translation: 'First line' },
  { time: 2, text: '第二句', translation: 'Second line' },
  { time: 3, text: '第三句' },
]

describe('MiniLyricsView', () => {
  it('没有当前歌曲时应该显示未在播放', () => {
    render(<MiniLyricsView currentTrack={null} lyrics={[]} currentIndex={-1} />)

    expect(screen.getByText('未在播放')).toBeInTheDocument()
  })

  it('当前歌曲没有歌词时应该保持内容区空白', () => {
    const { container } = render(
      <MiniLyricsView currentTrack={track} lyrics={[]} currentIndex={-1} />,
    )

    expect(container.querySelector('.mini-lyrics-view')).toBeEmptyDOMElement()
    expect(screen.queryByText('暂无歌词')).not.toBeInTheDocument()
  })

  it('存在当前索引时应该显示当前句和下一句', () => {
    const { container } = render(
      <MiniLyricsView currentTrack={track} lyrics={lyrics} currentIndex={0} />,
    )

    expect(screen.getByText('第一句').closest('.mini-lyrics-view__line')).toHaveClass(
      'mini-lyrics-view__line--active',
    )
    expect(screen.getByText('第二句')).toBeInTheDocument()
    expect(container.querySelectorAll('.mini-lyrics-view__line')).toHaveLength(2)
  })

  it('歌词尚未开始时应该只显示第一句且不高亮', () => {
    const { container } = render(
      <MiniLyricsView currentTrack={track} lyrics={lyrics} currentIndex={-1} />,
    )

    expect(screen.getByText('第一句')).toBeInTheDocument()
    expect(screen.queryByText('第二句')).not.toBeInTheDocument()
    expect(container.querySelector('.mini-lyrics-view__line--active')).not.toBeInTheDocument()
  })

  it('双语歌词应该保留原文和翻译结构', () => {
    const { container } = render(
      <MiniLyricsView currentTrack={track} lyrics={lyrics} currentIndex={0} />,
    )

    expect(screen.getByText('第一句')).toHaveClass('mini-lyrics-view__text')
    expect(screen.getByText('First line')).toHaveClass('mini-lyrics-view__translation')
    expect(container.querySelector('.mini-lyrics-view__line')).toBeInTheDocument()
  })

  it('播放最后一句时应该只渲染当前句且不访问越界内容', () => {
    const { container } = render(
      <MiniLyricsView currentTrack={track} lyrics={lyrics} currentIndex={2} />,
    )

    expect(screen.getByText('第三句')).toBeInTheDocument()
    expect(container.querySelectorAll('.mini-lyrics-view__line')).toHaveLength(1)
  })
})
