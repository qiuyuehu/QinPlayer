import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

import LocalMusic from '../src/pages/LocalMusic'

function track(id: number, title: string, artist: string, playCount: number): Track {
  return { id, title, artist, playCount, filePath: `${id}.mp3`, fileName: `${id}.mp3`, album: '', duration: 1, coverPath: null, mtime: 0, createdAt: '2026-07-12' }
}

const tracks = [track(1, 'Zulu', '乙', 2), track(2, 'Alpha', '甲', 9), track(3, 'Beta', '丙', 5)]
const invoke = vi.fn()
const listeners = new Map<string, (...args: unknown[]) => void>()
const originalApi = window.electronAPI

describe('LocalMusic 排序', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockImplementation((channel: string) => channel === 'songs:getAll' ? Promise.resolve(tracks) : Promise.resolve(null))
    listeners.clear()
    window.electronAPI = {
      ...originalApi,
      invoke,
      on: (channel, callback) => {
        listeners.set(channel, callback)
        return () => listeners.delete(channel)
      },
    }
    usePlayerStore.setState({ playlist: [], currentTrack: null, isPlaying: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    window.electronAPI = originalApi
  })

  it('默认按歌名升序，切换播放次数后起播队列使用当前排序', async () => {
    render(<LocalMusic />)
    expect(await screen.findByTestId('song-list')).toHaveTextContent('2,3,1')

    fireEvent.click(screen.getByRole('button', { name: '歌名 · 升序' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '播放次数' }))
    fireEvent.click(screen.getByRole('button', { name: '播放次数 · 升序' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '降序' }))
    expect(screen.getByTestId('song-list')).toHaveTextContent('2,3,1')

    fireEvent.doubleClick(screen.getByRole('button', { name: '播放首曲' }))
    expect(usePlayerStore.getState().playlist.map(({ id }) => id)).toEqual([2, 3, 1])
  })

  it('扫描增量更新后保留排序状态', async () => {
    render(<LocalMusic />)
    await screen.findByTestId('song-list')
    fireEvent.click(screen.getByRole('button', { name: '歌名 · 升序' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '歌手' }))

    const persisted = track(4, 'A', '阿', 0)
    invoke.mockImplementation((channel: string) => (
      channel === 'songs:getAll' ? Promise.resolve([...tracks, persisted]) : Promise.resolve(null)
    ))
    const { id: _id, playCount: _playCount, createdAt: _createdAt, ...scanResult } = persisted
    act(() => listeners.get('scan:song-found')?.(scanResult))
    await waitFor(() => expect(screen.getByTestId('song-list')).toHaveTextContent('4,3,2,1'))
    expect(screen.getByRole('button', { name: '歌手 · 升序' })).toBeInTheDocument()
  })

  it('同一批 scan:song-found 事件应该合并为一次曲库刷新', async () => {
    render(<LocalMusic />)
    await screen.findByTestId('song-list')
    invoke.mockClear()
    vi.useFakeTimers()

    const scanResult = {
      filePath: '4.mp3', fileName: '4.mp3', title: 'A', artist: '阿', album: '',
      duration: 1, coverPath: null, mtime: 0,
    }
    act(() => {
      listeners.get('scan:song-found')?.(scanResult)
      listeners.get('scan:song-found')?.({ ...scanResult, filePath: '5.mp3', fileName: '5.mp3' })
      listeners.get('scan:song-found')?.({ ...scanResult, filePath: '6.mp3', fileName: '6.mp3' })
    })

    expect(invoke).not.toHaveBeenCalledWith('songs:getAll')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(invoke.mock.calls.filter(([channel]) => channel === 'songs:getAll')).toHaveLength(1)
    vi.useRealTimers()
  })

  it('scan:song-found 后立即失败也应该刷新已入库歌曲', async () => {
    render(<LocalMusic />)
    await screen.findByTestId('song-list')
    invoke.mockClear()
    vi.useFakeTimers()

    const scanResult = {
      filePath: '4.mp3', fileName: '4.mp3', title: 'A', artist: '阿', album: '',
      duration: 1, coverPath: null, mtime: 0,
    }
    act(() => {
      listeners.get('scan:song-found')?.(scanResult)
      listeners.get('scan:error')?.({ message: '扫描中止' })
    })

    expect(invoke.mock.calls.filter(([channel]) => channel === 'songs:getAll')).toHaveLength(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(invoke.mock.calls.filter(([channel]) => channel === 'songs:getAll')).toHaveLength(1)
    vi.useRealTimers()
  })

  it('选择文件夹行为保持不变', async () => {
    invoke.mockImplementation((channel: string) => {
      if (channel === 'songs:getAll') return Promise.resolve(tracks)
      if (channel === 'select-folder') return Promise.resolve('C:\\music')
      if (channel === 'scan-folder') return Promise.resolve({ success: true })
      return Promise.resolve(null)
    })
    render(<LocalMusic />)
    fireEvent.click(await screen.findByRole('button', { name: '选择文件夹' }))

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('scan-folder', 'C:\\music'))
  })
})
