import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../src/stores/playerStore'
import type { Track } from '../src/types'

vi.mock('../src/components/SongList', async () => {
  const { usePlayerStore } = await import('../src/stores/playerStore')
  return {
    default: ({
      tracks,
      onLikedChange,
    }: {
      tracks: Track[]
      onLikedChange?: (track: Track, liked: boolean) => void
    }) => (
      <div data-testid="song-list">
        <span data-testid="track-ids">{tracks.map((track) => track.id).join(',')}</span>
        <button type="button" onDoubleClick={() => {
          usePlayerStore.getState().setPlaylist(tracks)
          usePlayerStore.getState().playTrack(tracks[0])
        }}>播放首曲</button>
        {tracks.map((track) => (
          <button key={track.id} type="button" onClick={async () => {
            try {
              await window.electronAPI.invoke('songs:unlike', { songId: track.id })
              onLikedChange?.(track, false)
            } catch {
              // SongList 失败时不会通知页面。
            }
          }}>取消收藏 {track.id}</button>
        ))}
        <button type="button" onClick={() => tracks[0] && onLikedChange?.(tracks[0], true)}>通知收藏</button>
        <button type="button" onClick={() => onLikedChange?.({ ...tracks[0], id: 999 }, false)}>通知其他歌曲取消</button>
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

  it('空列表应该使用星标空状态且不显示无意义菜单', async () => {
    invoke.mockResolvedValue([])
    render(<Liked />)

    expect(await screen.findByText('还没有收藏歌曲')).toBeInTheDocument()
    expect(screen.getByText('点击歌曲旁的星标收藏')).toBeInTheDocument()
    expect(document.querySelector('.liked-page__empty-icon')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('❤️')
    expect(screen.queryByRole('button', { name: /升序|降序/ })).not.toBeInTheDocument()
  })

  it('取消当前歌曲收藏后立即移除该行且播放状态不变', async () => {
    usePlayerStore.setState({ playlist: tracks, currentTrack: tracks[0], isPlaying: true })
    render(<Liked />)
    expect(await screen.findByTestId('song-list')).toHaveTextContent('2,1')

    fireEvent.click(screen.getByRole('button', { name: '取消收藏 1' }))

    await waitFor(() => expect(screen.getByTestId('track-ids')).toHaveTextContent(/^2$/))
    expect(usePlayerStore.getState().playlist).toEqual(tracks)
    expect(usePlayerStore.getState().currentTrack).toEqual(tracks[0])
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })

  it('移除最后一首后显示现有空状态并隐藏排序菜单', async () => {
    invoke.mockResolvedValue([tracks[0]])
    render(<Liked />)
    expect(await screen.findByTestId('song-list')).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('button', { name: '取消收藏 1' }))

    expect(await screen.findByText('还没有收藏歌曲')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /升序|降序/ })).not.toBeInTheDocument()
  })

  it('liked=true 或其他歌曲 ID 的通知不删除当前列表', async () => {
    render(<Liked />)
    expect(await screen.findByTestId('song-list')).toHaveTextContent('2,1')

    fireEvent.click(screen.getByRole('button', { name: '通知收藏' }))
    fireEvent.click(screen.getByRole('button', { name: '通知其他歌曲取消' }))

    expect(screen.getByTestId('track-ids')).toHaveTextContent(/^2,1$/)
  })

  it('取消收藏 IPC 失败时保留原行', async () => {
    invoke.mockImplementation((channel: string) => (
      channel === 'songs:getLiked' ? Promise.resolve(tracks) : Promise.reject(new Error('database failed'))
    ))
    render(<Liked />)
    expect(await screen.findByTestId('song-list')).toHaveTextContent('2,1')

    fireEvent.click(screen.getByRole('button', { name: '取消收藏 1' }))

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('songs:unlike', { songId: 1 }))
    expect(screen.getByTestId('track-ids')).toHaveTextContent(/^2,1$/)
  })
})
