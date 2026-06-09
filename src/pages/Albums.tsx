// =============================================================================
// QinPlayer — 专辑页面
// =============================================================================
// 职责：网格视图展示所有专辑，点击进入专辑歌曲列表
// 数据：从数据库按 album 字段分组，提取封面
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import SongList from '../components/SongList'
import type { Track, Playlist } from '../types'

// 专辑数据结构
interface AlbumGroup {
  name: string
  artist: string
  coverPath: string | null
  songs: Track[]
}

function Albums() {
  const [albums, setAlbums] = useState<AlbumGroup[]>([])
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumGroup | null>(null)

  // 加载所有歌曲并按专辑分组
  useEffect(() => {
    async function loadAlbums() {
      try {
        const songs = await window.electronAPI.invoke('songs:getAll') as Track[]

        // 按专辑名分组
        const albumMap = new Map<string, AlbumGroup>()
        for (const song of songs) {
          const key = song.album || '未知专辑'
          if (!albumMap.has(key)) {
            albumMap.set(key, {
              name: key,
              artist: song.artist || '未知歌手',
              coverPath: song.coverPath,
              songs: []
            })
          }
          albumMap.get(key)!.songs.push(song)
        }

        // 按歌曲数量降序排列
        const sorted = Array.from(albumMap.values())
          .sort((a, b) => b.songs.length - a.songs.length)

        setAlbums(sorted)
      } catch (e) {
        console.error('加载专辑失败:', e)
      }
    }

    loadAlbums()
  }, [])

  // 专辑详情视图
  if (selectedAlbum) {
    return (
      <div className="albums">
        <div className="albums__header">
          <button
            className="albums__back-btn"
            onClick={() => setSelectedAlbum(null)}
          >
            ← 返回
          </button>
          <div className="albums__detail-info">
            <h2 className="albums__title">{selectedAlbum.name}</h2>
            <span className="albums__artist">{selectedAlbum.artist}</span>
            <span className="albums__count">{selectedAlbum.songs.length} 首</span>
          </div>
        </div>

        <SongList tracks={selectedAlbum.songs} showIndex />
      </div>
    )
  }

  // 专辑网格视图
  return (
    <div className="albums">
      <div className="albums__header">
        <h2 className="albums__title">专辑</h2>
        <span className="albums__total">{albums.length} 个专辑</span>
      </div>

      {albums.length > 0 ? (
        <div className="albums__grid">
          {albums.map((album) => (
            <div
              key={album.name}
              className="albums__card"
              onClick={() => setSelectedAlbum(album)}
            >
              {/* 封面 */}
              <div className="albums__cover">
                {album.coverPath ? (
                  <img
                    className="albums__cover-img"
                    src={window.electronAPI.getCoverUrl(album.coverPath)}
                    alt={album.name}
                  />
                ) : (
                  <div className="albums__cover-placeholder">💿</div>
                )}
              </div>

              {/* 信息 */}
              <div className="albums__card-name" title={album.name}>{album.name}</div>
              <div className="albums__card-artist" title={album.artist}>{album.artist}</div>
              <div className="albums__card-count">{album.songs.length} 首</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="albums__empty">
          <p>还没有扫描到任何专辑</p>
          <p>先在"本地音乐"中扫描音乐文件夹</p>
        </div>
      )}
    </div>
  )
}

export default Albums
