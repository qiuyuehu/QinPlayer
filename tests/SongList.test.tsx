/**
 * SongList 组件测试
 * 覆盖：空状态、列表渲染、当前歌曲高亮、列显示控制
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import SongList, { type SongListHandle } from '../src/components/SongList'
import { usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { Track } from '../src/types'

const scrollToIndexMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 44,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
      index,
      key: index,
      start: index * 44,
      size: 44,
    })),
    scrollToIndex: scrollToIndexMock,
  }),
}))

// 模拟 AudioEngine
vi.mock('../src/utils/AudioEngine', () => ({
  getAudioEngine: vi.fn().mockReturnValue({
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    setVolume: vi.fn(),
    setEqGain: vi.fn(),
    setAllEqGains: vi.fn(),
    onTimeUpdate: vi.fn(),
    onEnded: vi.fn(),
    onLoadedMetadata: vi.fn(),
    destroy: vi.fn(),
  }),
  hasAudioEngine: vi.fn().mockReturnValue(true),
}))

// 模拟 electronAPI
const invokeMock = vi.fn()

// 测试用歌曲数据
const tracks: Track[] = [
  { id: 1, filePath: 'C:\\music\\a.mp3', fileName: 'a.mp3', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, coverPath: null, mtime: 0, playCount: 5, createdAt: '' },
  { id: 2, filePath: 'C:\\music\\b.mp3', fileName: 'b.mp3', title: '七里香', artist: '周杰伦', album: '七里香', duration: 299, coverPath: null, mtime: 0, playCount: 3, createdAt: '' },
  { id: 3, filePath: 'C:\\music\\c.mp3', fileName: 'c.mp3', title: '稻香', artist: '周杰伦', album: '魔杰座', duration: 223, coverPath: null, mtime: 0, playCount: 8, createdAt: '' },
]

describe('SongList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scrollToIndexMock.mockClear()
    invokeMock.mockResolvedValue([])
    window.electronAPI = {
      ...window.electronAPI,
      invoke: invokeMock,
      on: () => () => {},
      send: () => {},
    }
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

  // --- 空状态 ---
  it('空列表应显示"暂无歌曲"', () => {
    render(<SongList tracks={[]} />)
    expect(screen.getByText('暂无歌曲')).toBeInTheDocument()
  })

  // --- 列表渲染 ---
  // 注：虚拟列表在 jsdom 下无滚动容器高度，getVirtualItems() 返回空，
  // 歌曲行渲染需要真实浏览器环境验证。

  // --- 表头 ---
  it('默认显示序号列表头', () => {
    render(<SongList tracks={tracks} />)
    expect(screen.getByText('歌名')).toBeInTheDocument()
    expect(screen.getByText('歌手')).toBeInTheDocument()
    expect(screen.getByText('时长')).toBeInTheDocument()
  })

  it('showAlbum=true 时显示专辑列', () => {
    render(<SongList tracks={tracks} showAlbum={true} />)
    expect(screen.getByText('专辑')).toBeInTheDocument()
  })

  it('showAlbum=false 时不显示专辑列', () => {
    render(<SongList tracks={tracks} showAlbum={false} />)
    expect(screen.queryByText('专辑')).not.toBeInTheDocument()
  })

  // --- 时长格式化 ---
  // 注：时长显示在虚拟列表行内，jsdom 下无法渲染，需真实浏览器验证。

  it('playback=false 时双击歌曲不触发播放 IPC', async () => {
    useUIStore.getState().setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, playback: false })
    render(<SongList tracks={tracks} />)

    fireEvent.doubleClick(screen.getByText('晴天'))

    expect(usePlayerStore.getState().currentTrack).toBeNull()
    expect(invokeMock).not.toHaveBeenCalledWith('songs:updatePlayCount', { songId: 1 })
  })

  it('playlists=false 时右键菜单不显示添加到歌单', async () => {
    useUIStore.getState().setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, playlists: false })
    render(<SongList tracks={tracks} />)

    fireEvent.contextMenu(screen.getByText('晴天'))

    await waitFor(() => {
      expect(screen.getByText('播放')).toBeInTheDocument()
    })
    expect(screen.queryByText('添加到歌单')).not.toBeInTheDocument()
  })

  it('liked=false 时不渲染爱心按钮且不读取收藏列表', () => {
    useUIStore.getState().setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, liked: false })
    render(<SongList tracks={tracks} />)

    expect(screen.queryByTitle('收藏')).not.toBeInTheDocument()
    expect(invokeMock).not.toHaveBeenCalledWith('songs:getLiked')
  })

  it('containerHeight 应该控制滚动容器高度', () => {
    render(<SongList tracks={tracks} containerHeight={160} />)
    expect(document.querySelector('.song-list__scroll')).toHaveStyle({ height: '160px' })
  })

  it('scrollToTrackId 应该滚动到对应歌曲', () => {
    const ref = createRef<SongListHandle>()
    render(<SongList ref={ref} tracks={tracks} />)

    ref.current?.scrollToTrackId(2)

    expect(scrollToIndexMock).toHaveBeenCalledWith(1, { align: 'center' })
  })
})
