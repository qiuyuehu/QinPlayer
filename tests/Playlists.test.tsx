/**
 * Playlists 页面测试
 * 覆盖：歌单封面渲染与无封面占位图
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
  beforeEach(() => {
    vi.clearAllMocks()
    window.electronAPI = {
      ...window.electronAPI,
      invoke: vi.fn(async (channel: string) => {
        if (channel === 'playlists:getAll') return playlists
        return null
      }),
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
})
