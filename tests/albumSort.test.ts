/**
 * 专辑排序纯函数测试
 * 覆盖本地化顺序、未知项、次级排序和输入不可变性
 */
import { describe, expect, it } from 'vitest'
import { sortAlbums } from '../src/utils/albumSort'
import type { Album, Track } from '../src/types'

function createTrack(id: number, album: string, artist: string): Track {
  return {
    id,
    filePath: `C:\\music\\${id}.mp3`,
    fileName: `${id}.mp3`,
    title: `歌曲 ${id}`,
    artist,
    album,
    duration: 180,
    coverPath: null,
    mtime: 0,
    playCount: 0,
    createdAt: '2026-07-11',
  }
}

function createAlbum(name: string, artist: string, ids: number[] = [1]): Album {
  return {
    name,
    artist,
    coverPath: null,
    songs: ids.map((id) => createTrack(id, name, artist)),
  }
}

function names(albums: Album[]): string[] {
  return albums.map((album) => album.name)
}

describe('sortAlbums', () => {
  it('按专辑名升序时应该使用中文拼音顺序', () => {
    const albums = [
      createAlbum('上海', '歌手三'),
      createAlbum('北京', '歌手二'),
      createAlbum('阿尔法', '歌手一'),
    ]

    expect(names(sortAlbums(albums, 'name', 'asc'))).toEqual(['阿尔法', '北京', '上海'])
  })

  it('按专辑名降序时应该反转所有已知值', () => {
    const albums = [
      createAlbum('Alpha', 'A'),
      createAlbum('Charlie', 'C'),
      createAlbum('Bravo', 'B'),
    ]

    expect(names(sortAlbums(albums, 'name', 'desc'))).toEqual(['Charlie', 'Bravo', 'Alpha'])
  })

  it('按歌手排序时应该以歌手为主字段并以专辑名为次字段', () => {
    const albums = [
      createAlbum('Zeta', 'Alice'),
      createAlbum('Beta', 'Bob'),
      createAlbum('Alpha', 'Alice'),
    ]

    expect(names(sortAlbums(albums, 'artist', 'asc'))).toEqual(['Alpha', 'Zeta', 'Beta'])
  })

  it.each(['asc', 'desc'] as const)(
    '按专辑名 %s 排序时未知专辑和空白专辑都应该位于末尾',
    (order) => {
      const albums = [
        createAlbum('未知专辑', '歌手 B'),
        createAlbum('Beta', '歌手 C'),
        createAlbum('   ', '歌手 A'),
        createAlbum('Alpha', '歌手 D'),
      ]

      const result = sortAlbums(albums, 'name', order)
      expect(result.slice(-2).map((album) => album.name)).toEqual(
        expect.arrayContaining(['未知专辑', '   ']),
      )
      expect(result.slice(0, 2).map((album) => album.name)).not.toContain('未知专辑')
    },
  )

  it.each(['asc', 'desc'] as const)(
    '按歌手 %s 排序时未知歌手和空白歌手都应该位于末尾',
    (order) => {
      const albums = [
        createAlbum('专辑 B', '未知歌手'),
        createAlbum('专辑 C', 'Bob'),
        createAlbum('专辑 A', '  '),
        createAlbum('专辑 D', 'Alice'),
      ]

      const result = sortAlbums(albums, 'artist', order)
      expect(result.slice(-2).map((album) => album.artist)).toEqual(
        expect.arrayContaining(['未知歌手', '  ']),
      )
      expect(result.slice(0, 2).map((album) => album.artist)).not.toContain('未知歌手')
    },
  )

  it('未选中字段未知时不应该强制整张专辑排到末尾', () => {
    const albums = [
      createAlbum('已知专辑', 'Zulu'),
      createAlbum('未知专辑', 'Alpha'),
    ]

    expect(names(sortAlbums(albums, 'artist', 'asc'))).toEqual(['未知专辑', '已知专辑'])
  })

  it('专辑名中的数字应该按自然数字顺序排列', () => {
    const albums = [
      createAlbum('Album 10', 'A'),
      createAlbum('Album 2', 'B'),
    ]

    expect(names(sortAlbums(albums, 'name', 'asc'))).toEqual(['Album 2', 'Album 10'])
  })

  it('比较时应该忽略大小写差异和首尾空格', () => {
    const albums = [
      createAlbum('  bravo  ', 'B'),
      createAlbum('Charlie', 'C'),
      createAlbum('alpha', 'A'),
    ]

    expect(names(sortAlbums(albums, 'name', 'asc'))).toEqual(['alpha', '  bravo  ', 'Charlie'])
  })

  it('主字段相同时应该使用次字段形成稳定的业务顺序', () => {
    const albums = [
      createAlbum('同名专辑', 'Zulu'),
      createAlbum('同名专辑', 'Alpha'),
    ]

    expect(sortAlbums(albums, 'name', 'asc').map((album) => album.artist)).toEqual([
      'Alpha',
      'Zulu',
    ])
  })

  it('不应该修改输入数组、歌曲数组引用或歌曲内部顺序', () => {
    const first = createAlbum('Beta', 'B', [2, 1])
    const second = createAlbum('Alpha', 'A', [4, 3])
    const albums = [first, second]
    const sourceOrder = [...albums]
    const firstSongs = first.songs
    const secondSongs = second.songs

    const result = sortAlbums(albums, 'name', 'asc')

    expect(albums).toEqual(sourceOrder)
    expect(result).not.toBe(albums)
    expect(first.songs).toBe(firstSongs)
    expect(second.songs).toBe(secondSongs)
    expect(first.songs.map((song) => song.id)).toEqual([2, 1])
    expect(second.songs.map((song) => song.id)).toEqual([4, 3])
  })
})
