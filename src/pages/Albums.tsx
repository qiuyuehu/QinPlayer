// =============================================================================
// QinPlayer — 专辑页面
// =============================================================================
// 职责：网格视图展示所有专辑，点击进入专辑歌曲列表
// 数据：从数据库按 album 字段分组，提取封面
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import SongList from '../components/SongList'
import type { Track, Playlist } from '../types'

// 专辑数据结构：按专辑名聚合后的分组信息
interface AlbumGroup {
  name: string        // 专辑名称
  artist: string      // 艺术家名
  coverPath: string | null  // 封面图片路径，可能为 null
  songs: Track[]      // 该专辑下的所有歌曲
}

/**
 * 专辑页面组件
 * 两个视图：专辑网格列表 和 专辑详情（歌曲列表）
 * 组件挂载时一次性加载所有歌曲，在前端按 album 字段分组
 */
function Albums() {
  // 所有专辑分组数据，按歌曲数降序排列
  const [albums, setAlbums] = useState<AlbumGroup[]>([])
  // 当前选中的专辑，为 null 时显示网格，有值时显示详情
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumGroup | null>(null)

  // 加载所有歌曲并按专辑分组，仅在组件挂载时执行一次
  useEffect(() => {
    async function loadAlbums() {
      try {
        // 获取数据库中所有歌曲，需要前端做分组处理
        const songs = await window.electronAPI.invoke('songs:getAll') as Track[]

        // 按专辑名分组：用 Map 存储，key 为专辑名，value 为 AlbumGroup
        const albumMap = new Map<string, AlbumGroup>()
        for (const song of songs) {
          // 无专辑名的歌曲归入"未知专辑"
          const key = song.album || '未知专辑'
          if (!albumMap.has(key)) {
            // 首次遇到该专辑，创建新的分组条目
            albumMap.set(key, {
              name: key,
              artist: song.artist || '未知歌手',
              coverPath: song.coverPath,  // 取第一首歌的封面作为专辑封面
              songs: []
            })
          }
          // 将歌曲追加到对应专辑分组中
          albumMap.get(key)!.songs.push(song)
        }

        // 按歌曲数量降序排列，歌曲多的专辑排在前面
        const sorted = Array.from(albumMap.values())
          .sort((a, b) => b.songs.length - a.songs.length)

        setAlbums(sorted)
      } catch (e) {
        console.error('加载专辑失败:', e)
      }
    }

    loadAlbums()
  }, [])

  // 专辑详情视图：显示专辑信息和歌曲列表
  if (selectedAlbum) {
    return (
      <div className="albums">
        <div className="albums__header">
          {/* 返回按钮：清空选中状态，回到专辑网格视图 */}
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

        {/* 专辑内歌曲列表，showIndex 显示序号 */}
        <SongList tracks={selectedAlbum.songs} showIndex />
      </div>
    )
  }

  // 专辑网格视图：以卡片形式展示所有专辑
  return (
    <div className="albums">
      <div className="albums__header">
        <h2 className="albums__title">专辑</h2>
        <span className="albums__total">{albums.length} 个专辑</span>
      </div>

      {/* 有专辑时渲染网格，否则显示空状态引导 */}
      {albums.length > 0 ? (
        <div className="albums__grid">
          {albums.map((album) => (
            <div
              key={album.name}
              className="albums__card"
              // 点击专辑卡片进入详情视图
              onClick={() => setSelectedAlbum(album)}
            >
              {/* 封面区域：有封面路径时显示图片，否则显示占位图标 */}
              <div className="albums__cover">
                {album.coverPath ? (
                  <img
                    className="albums__cover-img"
                    // 通过 electronAPI 的辅助方法将本地路径转为可用的 URL
                    src={window.electronAPI.getCoverUrl(album.coverPath)}
                    alt={album.name}
                  />
                ) : (
                  <div className="albums__cover-placeholder">💿</div>
                )}
              </div>

              {/* 专辑信息：名称、艺术家、歌曲数 */}
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
