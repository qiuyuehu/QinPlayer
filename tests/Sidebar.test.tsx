/**
 * Sidebar 组件测试 — Feature Flag 导航过滤
 * 覆盖：flag 关闭时导航项不存在、搜索框隐藏
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Sidebar from '../src/components/Sidebar'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { FeatureFlags } from '../src/types/ipc'

// 模拟 electronAPI
window.electronAPI = {
  ...window.electronAPI,
  invoke: async () => null,
  on: () => () => {},
  send: () => {},
}

// 模拟 AudioEngine
vi.mock('../src/utils/AudioEngine', () => ({
  getAudioEngine: vi.fn().mockReturnValue({
    load: vi.fn(), play: vi.fn(), pause: vi.fn(), setVolume: vi.fn(),
    setEqGain: vi.fn(), setAllEqGains: vi.fn(),
    onTimeUpdate: vi.fn(), onEnded: vi.fn(), onLoadedMetadata: vi.fn(), destroy: vi.fn(),
  }),
  hasAudioEngine: vi.fn().mockReturnValue(true),
}))

function setFlags(flags: Partial<FeatureFlags>) {
  useUIStore.setState({
    featureFlags: { ...DEFAULT_FEATURE_FLAGS, ...flags },
  })
}

describe('Sidebar — Feature Flag 导航过滤', () => {
  beforeEach(() => {
    // 重置 uiStore
    useUIStore.setState({
      activeNav: 'local',
      featureFlags: { ...DEFAULT_FEATURE_FLAGS },
      sidebarCollapsed: false,
      searchQuery: '',
    })
    vi.clearAllMocks()
  })

  it('全部开启时应显示所有导航项', () => {
    render(<Sidebar />)
    expect(screen.getByText('最近播放')).toBeInTheDocument()
    expect(screen.getByText('本地音乐')).toBeInTheDocument()
    expect(screen.getByText('专辑')).toBeInTheDocument()
    expect(screen.getByText('歌单')).toBeInTheDocument()
    expect(screen.getByText('我喜欢的')).toBeInTheDocument()
    expect(screen.getByText('设置')).toBeInTheDocument()
  })

  it('recent=false 时应隐藏"最近播放"', () => {
    setFlags({ recent: false })
    render(<Sidebar />)
    expect(screen.queryByText('最近播放')).not.toBeInTheDocument()
    expect(screen.getByText('本地音乐')).toBeInTheDocument()
  })

  it('albums=false 时应隐藏"专辑"', () => {
    setFlags({ albums: false })
    render(<Sidebar />)
    expect(screen.queryByText('专辑')).not.toBeInTheDocument()
  })

  it('playlists=false 时应隐藏"歌单"', () => {
    setFlags({ playlists: false })
    render(<Sidebar />)
    expect(screen.queryByText('歌单')).not.toBeInTheDocument()
  })

  it('liked=false 时应隐藏"我喜欢的"', () => {
    setFlags({ liked: false })
    render(<Sidebar />)
    expect(screen.queryByText('我喜欢的')).not.toBeInTheDocument()
  })

  it('settings=false 时应隐藏"设置"', () => {
    setFlags({ settings: false })
    render(<Sidebar />)
    expect(screen.queryByText('设置')).not.toBeInTheDocument()
  })

  it('search=false 时应隐藏搜索框', () => {
    setFlags({ search: false })
    render(<Sidebar />)
    expect(screen.queryByPlaceholderText('搜索歌曲...')).not.toBeInTheDocument()
  })

  it('search=true 时应显示搜索框', () => {
    render(<Sidebar />)
    expect(screen.getByPlaceholderText('搜索歌曲...')).toBeInTheDocument()
  })

  it('全部关闭时只剩"本地音乐"', () => {
    setFlags({
      recent: false, albums: false, playlists: false,
      liked: false, settings: false, search: false,
    })
    render(<Sidebar />)
    expect(screen.getByText('本地音乐')).toBeInTheDocument()
    expect(screen.queryByText('最近播放')).not.toBeInTheDocument()
    expect(screen.queryByText('专辑')).not.toBeInTheDocument()
    expect(screen.queryByText('歌单')).not.toBeInTheDocument()
    expect(screen.queryByText('我喜欢的')).not.toBeInTheDocument()
    expect(screen.queryByText('设置')).not.toBeInTheDocument()
  })
})
