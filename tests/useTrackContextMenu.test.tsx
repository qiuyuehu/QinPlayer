import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTrackContextMenu } from '../src/hooks/useTrackContextMenu'
import type { MenuItem } from '../src/components/ContextMenu'
import type { Playlist, Track } from '../src/types'

const track: Track = {
  id: 7,
  filePath: 'C:\\music\\seven.mp3',
  fileName: 'seven.mp3',
  title: '第七首',
  artist: '测试歌手',
  album: '测试专辑',
  duration: 210,
  coverPath: null,
  mtime: 0,
  playCount: 0,
  createdAt: '2026-07-13',
}

const playlist: Playlist = { id: 3, name: '收藏集', createdAt: '2026-07-13', coverPath: null }

function createOptions(overrides: Partial<Parameters<typeof useTrackContextMenu>[0]> = {}) {
  return {
    onPlay: vi.fn(),
    onInsertNext: vi.fn(),
    onRemoveFromPriorityQueue: vi.fn(),
    canInsertNext: vi.fn(() => true),
    playbackEnabled: true,
    playlistsEnabled: false,
    ...overrides,
  }
}

function getItem(items: MenuItem[], label: string): MenuItem {
  const item = items.find((candidate) => candidate.label === label)
  if (!item) throw new Error(`缺少菜单项：${label}`)
  return item
}

describe('useTrackContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.electronAPI = {
      ...window.electronAPI,
      invoke: vi.fn(async () => null),
    }
  })

  it('source 与 priority 应该生成各自的播放队列动作', () => {
    const options = createOptions()
    const { result } = renderHook(() => useTrackContextMenu(options))

    const sourceItems = result.current.getItems(track, 'source')
    const priorityItems = result.current.getItems(track, 'priority')
    expect(sourceItems.map((item) => item.label)).toContain('下一首播放')
    expect(sourceItems.map((item) => item.label)).not.toContain('从接下来移除')
    expect(priorityItems.map((item) => item.label)).toContain('从接下来移除')
    expect(priorityItems.map((item) => item.label)).not.toContain('下一首播放')

    act(() => getItem(sourceItems, '下一首播放').action?.())
    act(() => getItem(priorityItems, '从接下来移除').action?.())
    expect(options.onInsertNext).toHaveBeenCalledWith(track)
    expect(options.onRemoveFromPriorityQueue).toHaveBeenCalledWith(track.id)
  })

  it('宿主 predicate 应该只控制下一首播放的 disabled', () => {
    const options = createOptions({ canInsertNext: vi.fn(() => false) })
    const { result } = renderHook(() => useTrackContextMenu(options))

    expect(getItem(result.current.getItems(track, 'source'), '下一首播放').disabled).toBe(true)
    expect(getItem(result.current.getItems(track, 'source'), '播放').disabled).toBeUndefined()
  })

  it('打开菜单时应该保存目标并按需懒加载歌单', async () => {
    vi.mocked(window.electronAPI.invoke).mockResolvedValueOnce([playlist])
    const options = createOptions({ playlistsEnabled: true })
    const { result } = renderHook(() => useTrackContextMenu(options))
    const event = { preventDefault: vi.fn(), clientX: 18, clientY: 29 } as unknown as React.MouseEvent

    act(() => result.current.open(event, track, 'source'))

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(result.current.target).toMatchObject({ x: 18, y: 29, track, kind: 'source' })
    await waitFor(() => {
      expect(getItem(result.current.getItems(track, 'source'), '添加到歌单').children?.[0].label).toBe('收藏集')
    })
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('playlists:getAll')
  })

  it('关闭 playlists flag 时不应该读取歌单', () => {
    const options = createOptions({ playlistsEnabled: false })
    const { result } = renderHook(() => useTrackContextMenu(options))
    const event = { preventDefault: vi.fn(), clientX: 1, clientY: 2 } as unknown as React.MouseEvent

    act(() => result.current.open(event, track))

    expect(window.electronAPI.invoke).not.toHaveBeenCalledWith('playlists:getAll')
    expect(result.current.getItems(track, 'source').map((item) => item.label)).not.toContain('添加到歌单')
  })

  it('扩展项应该位于歌单动作之后、文件动作之前', () => {
    const extraAction = vi.fn()
    const options = createOptions({
      playlistsEnabled: true,
      getExtraItems: () => [{ label: '宿主扩展', action: extraAction }],
    })
    const { result } = renderHook(() => useTrackContextMenu(options))

    const labels = result.current.getItems(track, 'source').map((item) => item.label)
    expect(labels.indexOf('添加到歌单')).toBeLessThan(labels.indexOf('宿主扩展'))
    expect(labels.indexOf('宿主扩展')).toBeLessThan(labels.indexOf('打开文件所在目录'))
    act(() => getItem(result.current.getItems(track, 'source'), '宿主扩展').action?.())
    expect(extraAction).toHaveBeenCalledTimes(1)
  })

  it('播放、打开目录和歌曲信息应该路由到对应目标', () => {
    const options = createOptions()
    const { result } = renderHook(() => useTrackContextMenu(options))
    const items = result.current.getItems(track, 'source')

    act(() => getItem(items, '播放').action?.())
    act(() => getItem(items, '打开文件所在目录').action?.())
    act(() => getItem(items, '歌曲信息').action?.())

    expect(options.onPlay).toHaveBeenCalledWith(track)
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('open-file-location', track.filePath)
    expect(result.current.songInfoTrack).toEqual(track)
    act(() => result.current.closeSongInfo())
    expect(result.current.songInfoTrack).toBeNull()
  })

  it('playback flag 关闭时应该隐藏全部播放相关动作', () => {
    const options = createOptions({ playbackEnabled: false })
    const { result } = renderHook(() => useTrackContextMenu(options))

    expect(result.current.getItems(track, 'source').map((item) => item.label)).toEqual([
      '打开文件所在目录',
      '歌曲信息',
    ])
  })
})
