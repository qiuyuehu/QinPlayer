import { describe, expect, it } from 'vitest'
import { sortTracks } from '../src/utils/trackSort'
import type { Track } from '../src/types'

function track(id: number, title: string, artist: string, playCount: number): Track {
  return {
    id,
    title,
    artist,
    playCount,
    filePath: `C:\\music\\${id}.mp3`,
    fileName: `${id}.mp3`,
    album: '专辑',
    duration: 180,
    coverPath: null,
    mtime: 0,
    createdAt: '2026-07-12',
  }
}

describe('sortTracks', () => {
  it('按中文拼音、数字和标点排序标题', () => {
    const tracks = [
      track(1, '歌曲 10', '乙', 0),
      track(2, '晴天', '甲', 0),
      track(3, '歌曲-2', '丙', 0),
      track(4, '阿刁', '丁', 0),
    ]

    expect(sortTracks(tracks, 'title', 'asc').map(({ id }) => id)).toEqual([4, 3, 1, 2])
    expect(sortTracks(tracks, 'title', 'desc').map(({ id }) => id)).toEqual([2, 1, 3, 4])
  })

  it('标题和歌手未知值在升降序都固定末尾', () => {
    const tracks = [
      track(1, '', '未知歌手', 0),
      track(2, '有效标题', '', 0),
      track(3, '另一首', '陈奕迅', 0),
    ]

    expect(sortTracks(tracks, 'title', 'asc').at(-1)?.id).toBe(1)
    expect(sortTracks(tracks, 'title', 'desc').at(-1)?.id).toBe(1)
    expect(sortTracks(tracks, 'artist', 'asc').slice(-2).map(({ id }) => id).sort()).toEqual([1, 2])
    expect(sortTracks(tracks, 'artist', 'desc').slice(-2).map(({ id }) => id).sort()).toEqual([1, 2])
  })

  it('播放次数按数值排序且非有限值固定末尾', () => {
    const tracks = [
      track(1, '甲', '甲', Number.NaN),
      track(2, '乙', '乙', 10),
      track(3, '丙', '丙', 0),
      track(4, '丁', '丁', Number.POSITIVE_INFINITY),
    ]

    expect(sortTracks(tracks, 'playCount', 'asc').map(({ id }) => id)).toEqual([3, 2, 4, 1])
    expect(sortTracks(tracks, 'playCount', 'desc').map(({ id }) => id)).toEqual([2, 3, 4, 1])
  })

  it('主键相同时按标题、歌手、id 升序稳定决胜', () => {
    const tracks = [
      track(3, '同名', '乙', 7),
      track(2, '同名', '甲', 7),
      track(1, '同名', '甲', 7),
    ]

    expect(sortTracks(tracks, 'playCount', 'desc').map(({ id }) => id)).toEqual([1, 2, 3])
  })

  it('返回副本且不修改输入数组和对象', () => {
    const tracks = [track(2, '乙', '乙', 2), track(1, '甲', '甲', 1)]
    const snapshot = structuredClone(tracks)
    const result = sortTracks(tracks, 'title', 'asc')

    expect(result).not.toBe(tracks)
    expect(tracks).toEqual(snapshot)
    expect(result[0]).toBe(tracks[1])
  })
})
