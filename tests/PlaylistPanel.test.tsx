/**
 * PlaylistPanel 组件测试
 * 覆盖：空队列、遮罩关闭、ESC 关闭
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PlaylistPanel from '../src/components/PlaylistPanel'
import { usePlayerStore } from '../src/stores/playerStore'

describe('PlaylistPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('点击遮罩应该关闭面板', () => {
    const onClose = vi.fn()
    render(<PlaylistPanel onClose={onClose} />)

    fireEvent.click(document.querySelector('.playlist-panel__overlay')!)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('按 Esc 应该关闭面板', () => {
    const onClose = vi.fn()
    render(<PlaylistPanel onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
