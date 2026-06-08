/**
 * PlayerBar 组件测试
 * TDD 方式：先写测试，再实现
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlayerBar from '../src/components/PlayerBar'

// 模拟 AudioEngine（避免真实的 Web Audio API 调用）
vi.mock('../src/utils/AudioEngine', () => {
  const mockEngine = {
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    setVolume: vi.fn(),
    get currentTime() { return 0 },
    set currentTime(_v: number) {},
    get duration() { return 0 },
    get playing() { return false },
    onTimeUpdate: vi.fn(),
    onEnded: vi.fn(),
    onLoadedMetadata: vi.fn(),
    fadeIn: vi.fn(),
    fadeOut: vi.fn(),
    destroy: vi.fn(),
  }
  return {
    AudioEngine: vi.fn().mockImplementation(() => mockEngine),
    getAudioEngine: vi.fn().mockReturnValue(mockEngine),
  }
})

describe('PlayerBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // 测试 1：基础渲染
  // =========================================================================
  it('应该正常渲染，不崩溃', () => {
    render(<PlayerBar />)
    // 能走到这里就说明没有白屏
    expect(document.querySelector('.player-bar')).toBeInTheDocument()
  })

  // =========================================================================
  // 测试 2：无歌曲时的默认状态
  // =========================================================================
  it('无歌曲时应显示"未在播放"', () => {
    render(<PlayerBar />)
    expect(screen.getByText('未在播放')).toBeInTheDocument()
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  // =========================================================================
  // 测试 3：播放按钮存在
  // =========================================================================
  it('应该有播放/暂停按钮', () => {
    render(<PlayerBar />)
    const playBtn = screen.getByTitle('播放')
    expect(playBtn).toBeInTheDocument()
    expect(playBtn).toBeDisabled() // 无歌曲时应该禁用
  })

  // =========================================================================
  // 测试 4：上一首/下一首按钮存在
  // =========================================================================
  it('应该有上一首和下一首按钮', () => {
    render(<PlayerBar />)
    expect(screen.getByTitle('上一首')).toBeInTheDocument()
    expect(screen.getByTitle('下一首')).toBeInTheDocument()
    expect(screen.getByTitle('上一首')).toBeDisabled()
    expect(screen.getByTitle('下一首')).toBeDisabled()
  })

  // =========================================================================
  // 测试 5：进度条存在
  // =========================================================================
  it('应该有进度条', () => {
    render(<PlayerBar />)
    expect(document.querySelector('.player-bar__progress')).toBeInTheDocument()
  })

  // =========================================================================
  // 测试 6：音量滑块存在
  // =========================================================================
  it('应该有音量滑块', () => {
    render(<PlayerBar />)
    const slider = document.querySelector('.player-bar__volume-slider')
    expect(slider).toBeInTheDocument()
  })

  // =========================================================================
  // 测试 7：播放模式按钮存在
  // =========================================================================
  it('应该有播放模式切换按钮', () => {
    render(<PlayerBar />)
    expect(screen.getByTitle('顺序播放')).toBeInTheDocument()
  })

  // =========================================================================
  // 测试 8：时间显示
  // =========================================================================
  it('应该显示 00:00 的初始时间', () => {
    render(<PlayerBar />)
    const times = screen.getAllByText('00:00')
    expect(times.length).toBeGreaterThanOrEqual(1)
  })
})
