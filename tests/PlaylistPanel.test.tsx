/**
 * PlaylistPanel 组件测试
 * 覆盖：空队列、ESC 关闭、封面缩略图、清空后续队列
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import PlaylistPanel from '../src/components/PlaylistPanel'
import { usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { Track } from '../src/types'

const trackA: Track = {
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

const trackB: Track = {
  ...trackA,
  id: 2,
  filePath: 'C:\\music\\b.mp3',
  fileName: 'b.mp3',
  title: '七里香',
}

const trackC: Track = {
  ...trackA,
  id: 3,
  filePath: 'C:\\music\\c.mp3',
  fileName: 'c.mp3',
  title: '搁浅',
  coverPath: 'C:\\covers\\c.jpg',
  duration: 244,
}

describe('PlaylistPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.electronAPI = {
      ...window.electronAPI,
      invoke: vi.fn(async () => null),
    }
    useUIStore.setState({
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

  it('空队列时应该显示空状态', () => {
    render(<PlaylistPanel onClose={vi.fn()} />)
    expect(screen.getByText('当前播放队列为空')).toBeInTheDocument()
  })

  it('按 Esc 应先进入退场，根动画结束后只关闭一次', () => {
    const onClose = vi.fn()
    const { container } = render(<PlaylistPanel onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('.queue-panel')).toHaveClass('queue-panel--exit')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.animationEnd(container.querySelector('.queue-panel')!)
    fireEvent.animationEnd(container.querySelector('.queue-panel')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reduced motion 下按 Esc 在微任务内关闭', async () => {
    document.documentElement.setAttribute('data-reduced-motion', 'true')
    const onClose = vi.fn()
    render(<PlaylistPanel onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => Promise.resolve())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('不应该显示历史记录标签页', () => {
    render(<PlaylistPanel onClose={vi.fn()} />)

    expect(screen.queryByText('历史记录')).not.toBeInTheDocument()
  })

  it('清空后续队列时应该保留当前歌曲和之前的歌曲', () => {
    usePlayerStore.setState({
      currentTrack: trackB,
      playlist: [trackA, trackB, trackC],
    })
    render(<PlaylistPanel onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('清空后续队列'))

    expect(usePlayerStore.getState().playlist).toEqual([trackA, trackB])
  })

  it('应该渲染封面缩略图和无封面占位', () => {
    usePlayerStore.setState({
      currentTrack: trackA,
      playlist: [trackA, trackC],
    })
    render(<PlaylistPanel onClose={vi.fn()} />)

    expect(document.querySelector('.queue-panel__cover--placeholder')).toBeInTheDocument()
    expect(document.querySelector('.queue-panel__cover[src]')).toHaveAttribute(
      'src',
      'qinplayer://cover?path=C%3A%5Ccovers%5Cc.jpg'
    )
  })

  it('点击队列歌曲应该切换当前歌曲并记录播放', () => {
    const originalPlaylist = [trackA, trackB]
    usePlayerStore.setState({
      currentTrack: trackA,
      playlist: originalPlaylist,
    })
    render(<PlaylistPanel onClose={vi.fn()} />)

    fireEvent.click(screen.getByTitle('七里香 - 周杰伦'))

    expect(usePlayerStore.getState().currentTrack).toEqual(trackB)
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    expect(usePlayerStore.getState().playlist).toBe(originalPlaylist)
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('songs:recordPlay', { songId: 2 })
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('songs:updatePlayCount', { songId: 2 })
    expect(vi.mocked(window.electronAPI.invoke).mock.calls.filter(
      ([channel]) => channel === 'songs:recordPlay' || channel === 'songs:updatePlayCount',
    )).toHaveLength(2)
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-reduced-motion')
  })
})
