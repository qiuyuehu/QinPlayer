/**
 * Playlists 页面测试
 * 覆盖：歌单封面渲染与无封面占位图
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Playlists from '../src/pages/Playlists'
import type { Playlist } from '../src/types'

const playlists: Playlist[] = [
  {
    id: 1,
    name: '有封面歌单',
    createdAt: '',
    songCount: 2,
    coverPath: 'C:\\covers\\a.jpg',
  },
  {
    id: 2,
    name: '无封面歌单',
    createdAt: '',
    songCount: 0,
    coverPath: null,
  },
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
  })

  it('应该渲染第一首歌封面', async () => {
    render(<Playlists />)

    const cover = await screen.findByAltText('有封面歌单')
    expect(cover).toHaveAttribute('src', 'qinplayer://cover?path=C%3A%5Ccovers%5Ca.jpg')
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
})
