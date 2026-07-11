/**
 * Albums 页面接线测试
 * 覆盖默认排序、受控排序状态、数据加载和详情歌曲顺序
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../src/types'

vi.mock('../src/components/SongList', () => ({
  default: ({ tracks }: { tracks: Track[] }) => (
    <div data-testid="song-list-mock">{tracks.map((track) => track.id).join(',')}</div>
  ),
}))

import Albums from '../src/pages/Albums'

function createTrack(
  id: number,
  album: string,
  artist: string,
  title = `歌曲 ${id}`,
): Track {
  return {
    id,
    filePath: `C:\\music\\${id}.mp3`,
    fileName: `${id}.mp3`,
    title,
    artist,
    album,
    duration: 180,
    coverPath: null,
    mtime: 0,
    playCount: 0,
    createdAt: '2026-07-11',
  }
}

const songs: Track[] = [
  createTrack(6, 'Zulu', 'Beta'),
  createTrack(5, 'Zulu', 'Beta'),
  createTrack(4, '', 'Alpha'),
  createTrack(3, 'Alpha', 'Zulu'),
  createTrack(2, 'Beta', 'Alice'),
]

const invokeMock = vi.fn()
const originalInvoke = window.electronAPI.invoke

function cardNames(): string[] {
  return Array.from(document.querySelectorAll('.albums__card-name'))
    .map((element) => element.textContent ?? '')
}

function chooseSortOption(name: '专辑名' | '歌手' | '升序' | '降序'): void {
  fireEvent.click(screen.getByRole('button', { name: /专辑名|歌手/ }))
  fireEvent.click(screen.getByRole('menuitemradio', { name }))
}

describe('Albums', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockImplementation((channel: string) => {
      if (channel === 'songs:getAll') return Promise.resolve(songs)
      return Promise.resolve(null)
    })
    window.electronAPI.invoke = invokeMock
  })

  afterEach(() => {
    window.electronAPI.invoke = originalInvoke
  })

  it('加载后应该默认按专辑名升序展示卡片', async () => {
    render(<Albums />)

    expect(await screen.findByRole('button', { name: '专辑名 · 升序' })).toBeInTheDocument()
    await waitFor(() => {
      expect(cardNames()).toEqual(['Alpha', 'Beta', 'Zulu', '未知专辑'])
    })
  })

  it('选择歌手后应该按代表歌手升序展示卡片', async () => {
    render(<Albums />)
    await waitFor(() => expect(cardNames()).toHaveLength(4))

    chooseSortOption('歌手')

    expect(screen.getByRole('button', { name: '歌手 · 升序' })).toBeInTheDocument()
    expect(cardNames()).toEqual(['Beta', '未知专辑', 'Zulu', 'Alpha'])
  })

  it('切换方向后再切换字段应该保留当前方向', async () => {
    render(<Albums />)
    await waitFor(() => expect(cardNames()).toHaveLength(4))

    chooseSortOption('歌手')
    chooseSortOption('降序')
    expect(screen.getByRole('button', { name: '歌手 · 降序' })).toBeInTheDocument()

    chooseSortOption('专辑名')
    expect(screen.getByRole('button', { name: '专辑名 · 降序' })).toBeInTheDocument()
    expect(cardNames()).toEqual(['Zulu', 'Beta', 'Alpha', '未知专辑'])
  })

  it('切换排序只应该改变 renderer 顺序且数据只加载一次', async () => {
    render(<Albums />)
    await waitFor(() => expect(cardNames()).toHaveLength(4))

    chooseSortOption('歌手')
    chooseSortOption('降序')
    chooseSortOption('专辑名')

    expect(invokeMock.mock.calls.filter(([channel]) => channel === 'songs:getAll')).toHaveLength(1)
  })

  it('进入详情时应该隐藏排序控件并保留分组的源歌曲顺序', async () => {
    render(<Albums />)
    await waitFor(() => expect(cardNames()).toHaveLength(4))
    const zuluName = document.querySelector('.albums__card-name[title="Zulu"]')

    fireEvent.click(zuluName!.closest('.albums__card')!)

    expect(screen.queryByRole('button', { name: /专辑名|歌手/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('song-list-mock')).toHaveTextContent('6,5')
  })

  it('返回网格后应该保留组件内排序状态和卡片顺序', async () => {
    render(<Albums />)
    await waitFor(() => expect(cardNames()).toHaveLength(4))
    chooseSortOption('降序')
    fireEvent.click(document.querySelector('.albums__card-name[title="Zulu"]')!.closest('.albums__card')!)

    fireEvent.click(screen.getByRole('button', { name: '← 返回' }))

    expect(screen.getByRole('button', { name: '专辑名 · 降序' })).toBeInTheDocument()
    expect(cardNames()).toEqual(['Zulu', 'Beta', 'Alpha', '未知专辑'])
  })

  it('专辑总数应该保持只读且来自未排序分组', async () => {
    render(<Albums />)
    const total = await screen.findByText('4 个专辑')

    expect(total.tagName).toBe('SPAN')
    expect(total.closest('button')).toBeNull()
    chooseSortOption('歌手')
    expect(screen.getByText('4 个专辑')).toBeInTheDocument()
  })

  it('歌曲为空时应该显示现有空状态且不抛错', async () => {
    invokeMock.mockResolvedValueOnce([])

    render(<Albums />)

    expect(await screen.findByText('还没有扫描到任何专辑')).toBeInTheDocument()
    expect(screen.getByText('0 个专辑')).toBeInTheDocument()
  })
})
