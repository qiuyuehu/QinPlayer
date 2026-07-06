/**
 * PlayerBar 组件测试
 * TDD 方式：先写测试，再实现
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlayerBar from '../src/components/PlayerBar'
import { usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'

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
    useUIStore.setState({
      activeNav: 'local',
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
  })

  // =========================================================================
  // 测试 4：上一首/下一首按钮存在
  // =========================================================================
  it('应该有上一首和下一首按钮', () => {
    render(<PlayerBar />)
    expect(screen.getByTitle('上一首')).toBeInTheDocument()
    expect(screen.getByTitle('下一首')).toBeInTheDocument()
  })

  // =========================================================================
  // 测试 5：进度条存在
  // =========================================================================
  it('应该有进度条', () => {
    render(<PlayerBar />)
    expect(document.querySelector('.player-bar__progress-bar')).toBeInTheDocument()
  })

  // =========================================================================
  // 测试 6：音量滑块折叠
  // =========================================================================
  it('音量滑块应该点击音量按钮后显示，再次点击后收起', async () => {
    const user = userEvent.setup()
    render(<PlayerBar />)

    expect(document.querySelector('.player-bar__volume-bar')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('音量控制'))
    expect(document.querySelector('.player-bar__volume-bar')).toBeInTheDocument()

    await user.click(screen.getByLabelText('音量控制'))
    expect(document.querySelector('.player-bar__volume-bar')).not.toBeInTheDocument()
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
  it('应该显示 0:00 的初始时间', () => {
    render(<PlayerBar />)
    const times = screen.getAllByText('0:00')
    expect(times.length).toBeGreaterThanOrEqual(1)
  })

  it('点击播放列表按钮应该打开和关闭播放列表面板', async () => {
    const user = userEvent.setup()
    render(<PlayerBar />)

    await user.click(screen.getByTitle('播放列表'))
    expect(screen.getByText('当前播放队列为空')).toBeInTheDocument()

    await user.click(screen.getByTitle('播放列表'))
    expect(screen.queryByText('当前播放队列为空')).not.toBeInTheDocument()
  })

  it('queuePanel=false 时应该隐藏播放列表按钮', () => {
    useUIStore.setState({
      featureFlags: { ...DEFAULT_FEATURE_FLAGS, queuePanel: false },
    })

    render(<PlayerBar />)

    expect(screen.queryByTitle('播放列表')).not.toBeInTheDocument()
    expect(screen.queryByText('当前播放队列为空')).not.toBeInTheDocument()
  })
})
