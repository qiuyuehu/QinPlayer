import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../src/stores/playerStore'
import type { Track } from '../src/types'

vi.mock('../src/components/SongList', async () => {
  const { usePlayerStore } = await import('../src/stores/playerStore')
  return {
    default: ({ tracks }: { tracks: Track[] }) => (
      <div data-testid="song-list">
        <span>{tracks.map((track) => track.id).join(',')}</span>
        <button type="button" onDoubleClick={() => {
          usePlayerStore.getState().setPlaylist(tracks)
          usePlayerStore.getState().playTrack(tracks[0])
        }}>播放首曲</button>
      </div>
    ),
  }
})

import Liked from '../src/pages/Liked'

const tracks: Track[] = [
  { id: 1, title: '乙', artist: 'A', playCount: 1, filePath: '1', fileName: '1', album: '', duration: 1, coverPath: null, mtime: 0, createdAt: '2026-07-12' },
  { id: 2, title: '甲', artist: 'B', playCount: 8, filePath: '2', fileName: '2', album: '', duration: 1, coverPath: null, mtime: 0, createdAt: '2026-07-12' },
]
const invoke = vi.fn()
const originalInvoke = window.electronAPI.invoke

describe('Liked 排序', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue(tracks)
    window.electronAPI.invoke = invoke
    usePlayerStore.setState({ playlist: [], currentTrack: null, isPlaying: false })
  })

  afterEach(() => { window.electronAPI.invoke = originalInvoke })

  it('加载中不显示菜单，加载后默认排序并可按播放次数起播', async () => {
    render(<Liked />)
    expect(screen.queryByRole('button', { name: /升序|降序/ })).not.toBeInTheDocument()
    expect(await screen.findByTestId('song-list')).toHaveTextContent('2,1')

    fireEvent.click(screen.getByRole('button', { name: '歌名 · 升序' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '播放次数' }))
    fireEvent.click(screen.getByRole('button', { name: '播放次数 · 升序' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '降序' }))
    fireEvent.doubleClick(screen.getByRole('button', { name: '播放首曲' }))

    expect(usePlayerStore.getState().playlist.map(({ id }) => id)).toEqual([2, 1])
  })

  it('空列表保留现有空状态且不显示无意义菜单', async () => {
    invoke.mockResolvedValue([])
    render(<Liked />)

    expect(await screen.findByText('还没有收藏歌曲')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /升序|降序/ })).not.toBeInTheDocument()
  })
})
