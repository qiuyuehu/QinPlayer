/**
 * Playlists 页面测试
 * 覆盖：歌单封面渲染与无封面占位图
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Playlists from '../src/pages/Playlists'
import { usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { Playlist, Track } from '../src/types'
const playlists: Playlist[] = [
  {
    id: 1,
    name: '有封面歌单',
    createdAt: '',
    songCount: 2,
    coverPath: 'C:\\covers\\a.jpg',
    coverSongId: 10,
    coverMtime: 123,
  },
  {
    id: 2,
    name: '无封面歌单',
    createdAt: '',
    songCount: 0,
    coverPath: null,
    coverSongId: null,
    coverMtime: null,
  },
]

const playlistTracks: Track[] = [
  { id: 10, title: '第一首', artist: '歌手', playCount: 0, filePath: '10', fileName: '10', album: '', duration: 120, coverPath: null, mtime: 0, createdAt: '2026-07-13' },
  { id: 11, title: '第二首', artist: '歌手', playCount: 0, filePath: '11', fileName: '11', album: '', duration: 120, coverPath: null, mtime: 0, createdAt: '2026-07-13' },
]

describe('Playlists', () => {
  let invokeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    invokeMock = vi.fn(async (channel: string) => {
      if (channel === 'playlists:getAll') return playlists
      if (channel === 'playlists:getSongs') return []
      return null
    })
    window.electronAPI = {
      ...window.electronAPI,
      invoke: invokeMock,
    }
    act(() => {
      useUIStore.setState({ featureFlags: { ...DEFAULT_FEATURE_FLAGS } })
      usePlayerStore.setState({ playlist: [], currentTrack: null, isPlaying: false })
    })
  })

  it('应该渲染第一首歌封面', async () => {
    render(<Playlists />)

    const cover = await screen.findByAltText('有封面歌单')
    expect(cover).toHaveAttribute('src', 'qinplayer://cover?id=10&v=123')
  })

  it('无封面时应该显示歌单卡片和歌曲数量', async () => {
    render(<Playlists />)

    await waitFor(() => {
      expect(screen.getByText('无封面歌单')).toBeInTheDocument()
    })
    expect(screen.getByText('0 首')).toBeInTheDocument()
  })

  it('应该通过右键菜单和 Enter 重命名歌单', async () => {
    render(<Playlists />)

    const playlistName = await screen.findByText('无封面歌单')
    fireEvent.contextMenu(playlistName.closest('.playlists__card')!)
    fireEvent.click(screen.getByText('重命名'))

    const input = screen.getByDisplayValue('无封面歌单')
    fireEvent.change(input, { target: { value: '新名字' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('playlists:rename', {
        id: 2,
        name: '新名字',
      })
    })
  })

  it('应该通过失焦确认重命名歌单', async () => {
    render(<Playlists />)

    const playlistName = await screen.findByText('无封面歌单')
    fireEvent.contextMenu(playlistName.closest('.playlists__card')!)
    fireEvent.click(screen.getByText('重命名'))

    const input = screen.getByDisplayValue('无封面歌单')
    fireEvent.change(input, { target: { value: '失焦改名' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('playlists:rename', {
        id: 2,
        name: '失焦改名',
      })
    })
  })

  it('应该通过 Esc 取消重命名歌单', async () => {
    render(<Playlists />)

    const playlistName = await screen.findByText('无封面歌单')
    fireEvent.contextMenu(playlistName.closest('.playlists__card')!)
    fireEvent.click(screen.getByText('重命名'))

    const input = screen.getByDisplayValue('无封面歌单')
    fireEvent.change(input, { target: { value: '取消改名' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByDisplayValue('取消改名')).not.toBeInTheDocument()
    })
    expect(invokeMock).not.toHaveBeenCalledWith('playlists:rename', expect.anything())
  })

  it('从歌单详情返回列表时应重新加载歌单数据（封面刷新）', async () => {
    render(<Playlists />)

    // 等待初始加载完成
    await screen.findByText('有封面歌单')

    // 记录初始调用次数
    const initialCallCount = invokeMock.mock.calls.filter(
      (call: string[]) => call[0] === 'playlists:getAll'
    ).length

    // 点击卡片进入详情
    const card = screen.getByText('有封面歌单').closest('.playlists__card')!
    fireEvent.click(card)

    // 确认进入详情视图
    await waitFor(() => {
      expect(screen.getByText('← 返回')).toBeInTheDocument()
    })

    // 点击返回按钮
    fireEvent.click(screen.getByText('← 返回'))

    // 验证 playlists:getAll 被再次调用
    await waitFor(() => {
      const totalCalls = invokeMock.mock.calls.filter(
        (call: string[]) => call[0] === 'playlists:getAll'
      ).length
      expect(totalCalls).toBe(initialCallCount + 1)
    })
  })

  it('播放全部应该按当前加载顺序设置播放列表并只播放首曲', async () => {
    invokeMock.mockImplementation(async (channel: string) => {
      if (channel === 'playlists:getAll') return playlists
      if (channel === 'playlists:getSongs') return playlistTracks
      return null
    })
    render(<Playlists />)

    fireEvent.click(await screen.findByText('有封面歌单'))
    const playAll = await screen.findByRole('button', { name: '播放全部' })
    expect(playAll).toBeEnabled()
    fireEvent.click(playAll)

    expect(usePlayerStore.getState().playlist).toEqual(playlistTracks)
    expect(usePlayerStore.getState().currentTrack).toEqual(playlistTracks[0])
    expect(invokeMock.mock.calls.filter(([channel]) => channel === 'songs:recordPlay' || channel === 'songs:updatePlayCount')).toHaveLength(2)
  })

  it('默认排序应该保持既有 added wire payload', async () => {
    render(<Playlists />)

    fireEvent.click(await screen.findByText('有封面歌单'))
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('playlists:getSongs', {
        id: 1,
        sortBy: 'added',
        order: 'desc',
      })
    })
  })

  it('播放全部应该位于排序栏末尾，并保留既有禁用条件', async () => {
    invokeMock.mockImplementation(async (channel: string) => {
      if (channel === 'playlists:getAll') return playlists
      if (channel === 'playlists:getSongs') return playlistTracks
      return null
    })
    render(<Playlists />)

    fireEvent.click(await screen.findByText('有封面歌单'))
    const playAll = await screen.findByRole('button', { name: '播放全部' })
    const sort = playAll.closest('.playlists__sort')
    expect(sort).toBeInTheDocument()
    expect(sort?.lastElementChild).toBe(playAll)
    expect(playAll).toHaveClass('playlists__sort-btn', 'playlists__play-all')
    expect(playAll.closest('.playlists__header--detail')).toBeNull()
  })

  it('加载中、空列表和 playback 关闭时播放全部应该禁用', async () => {
    let resolveSongs!: (tracks: Track[]) => void
    const pendingSongs = new Promise<Track[]>((resolvePromise) => { resolveSongs = resolvePromise })
    invokeMock.mockImplementation(async (channel: string) => {
      if (channel === 'playlists:getAll') return playlists
      if (channel === 'playlists:getSongs') return pendingSongs
      return null
    })
    render(<Playlists />)

    fireEvent.click(await screen.findByText('有封面歌单'))
    expect(await screen.findByRole('button', { name: '播放全部' })).toBeDisabled()
    resolveSongs([])
    await waitFor(() => expect(screen.getByRole('button', { name: '播放全部' })).toBeDisabled())

    act(() => {
      useUIStore.setState({ featureFlags: { ...DEFAULT_FEATURE_FLAGS, playback: false } })
    })
    expect(screen.getByRole('button', { name: '播放全部' })).toBeDisabled()
  })

  it('旧歌单请求不应该覆盖最新歌单歌曲或 loading', async () => {
    let resolveFirst!: (tracks: Track[]) => void
    let resolveSecond!: (tracks: Track[]) => void
    const first = new Promise<Track[]>((resolvePromise) => { resolveFirst = resolvePromise })
    const second = new Promise<Track[]>((resolvePromise) => { resolveSecond = resolvePromise })
    let requestCount = 0
    invokeMock.mockImplementation(async (channel: string) => {
      if (channel === 'playlists:getAll') return playlists
      if (channel === 'playlists:getSongs') return requestCount++ === 0 ? first : second
      return null
    })
    render(<Playlists />)

    fireEvent.click(await screen.findByText('有封面歌单'))
    fireEvent.click(screen.getByText('← 返回'))
    fireEvent.click(await screen.findByText('无封面歌单'))
    resolveSecond([playlistTracks[1]])
    const playAll = await screen.findByRole('button', { name: '播放全部' })
    expect(playAll).toBeEnabled()

    resolveFirst([playlistTracks[0]])
    await waitFor(() => expect(screen.getByRole('button', { name: '播放全部' })).toBeEnabled())
    fireEvent.click(playAll)
    expect(usePlayerStore.getState().playlist).toEqual([playlistTracks[1]])
  })
})
