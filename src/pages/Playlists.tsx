// =============================================================================
// QinPlayer — 歌单页面
// =============================================================================
// 职责：歌单列表 + 新建歌单 + 进入歌单详情
// 设计：歌单列表和歌单详情在同一组件内切换（不用额外路由）
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import SongList from '../components/SongList'
import CreatePlaylistDialog from '../components/CreatePlaylistDialog'
import type { Track, Playlist } from '../types'

function Playlists() {
  // --- 状态 ---
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null)
  const [songs, setSongs] = useState<Track[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [sortBy, setSortBy] = useState<'added' | 'playCount'>('added')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // --- 加载歌单列表 ---
  const loadPlaylists = useCallback(async () => {
    try {
      const list = await window.electronAPI.invoke('playlists:getAll') as Playlist[]
      setPlaylists(list)
    } catch (e) {
      console.error('加载歌单失败:', e)
    }
  }, [])

  useEffect(() => {
    loadPlaylists()
  }, [loadPlaylists])

  // --- 加载歌单内歌曲 ---
  const loadPlaylistSongs = useCallback(async (playlistId: number) => {
    try {
      const trackList = await window.electronAPI.invoke('playlists:getSongs', {
        id: playlistId,
        sortBy,
        order: sortOrder
      }) as Track[]
      setSongs(trackList)
    } catch (e) {
      console.error('加载歌单歌曲失败:', e)
    }
  }, [sortBy, sortOrder])

  useEffect(() => {
    if (selectedPlaylist) {
      loadPlaylistSongs(selectedPlaylist.id)
    }
  }, [selectedPlaylist, loadPlaylistSongs])

  // --- 创建歌单 ---
  const handleCreate = useCallback(async (name: string) => {
    await window.electronAPI.invoke('playlists:create', { name })
    setShowCreateDialog(false)
    loadPlaylists()
  }, [loadPlaylists])

  // --- 删除歌单 ---
  const handleDelete = useCallback(async (id: number) => {
    await window.electronAPI.invoke('playlists:delete', { id })
    setSelectedPlaylist(null)
    loadPlaylists()
  }, [loadPlaylists])

  // --- 歌单详情视图 ---
  if (selectedPlaylist) {
    return (
      <div className="playlists">
        {/* 返回按钮 + 歌单信息 */}
        <div className="playlists__header">
          <button
            className="playlists__back-btn"
            onClick={() => setSelectedPlaylist(null)}
          >
            ← 返回
          </button>
          <h2 className="playlists__title">{selectedPlaylist.name}</h2>
          <span className="playlists__count">{songs.length} 首</span>
        </div>

        {/* 排序控制 */}
        <div className="playlists__sort">
          <button
            className={`playlists__sort-btn ${sortBy === 'added' ? 'playlists__sort-btn--active' : ''}`}
            onClick={() => setSortBy('added')}
          >
            添加顺序
          </button>
          <button
            className={`playlists__sort-btn ${sortBy === 'playCount' ? 'playlists__sort-btn--active' : ''}`}
            onClick={() => setSortBy('playCount')}
          >
            播放次数
          </button>
          <button
            className="playlists__sort-btn"
            onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? '↑ 升序' : '↓ 降序'}
          </button>
        </div>

        {/* 歌曲列表 */}
        {songs.length > 0 ? (
          <SongList tracks={songs} showIndex />
        ) : (
          <div className="playlists__empty">
            <p>歌单里还没有歌曲</p>
            <p>在歌曲列表右键添加到歌单</p>
          </div>
        )}
      </div>
    )
  }

  // --- 歌单列表视图 ---
  return (
    <div className="playlists">
      <div className="playlists__header">
        <h2 className="playlists__title">歌单</h2>
        <button
          className="playlists__create-btn"
          onClick={() => setShowCreateDialog(true)}
        >
          + 新建歌单
        </button>
      </div>

      {/* 歌单网格 */}
      {playlists.length > 0 ? (
        <div className="playlists__grid">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className="playlists__card"
              onClick={() => setSelectedPlaylist(pl)}
            >
              <div className="playlists__card-icon">📋</div>
              <div className="playlists__card-name">{pl.name}</div>
              <div className="playlists__card-count">{pl.songCount || 0} 首</div>
              <button
                className="playlists__card-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(pl.id)
                }}
                title="删除歌单"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="playlists__empty">
          <p>还没有创建歌单</p>
          <p>点击上方"新建歌单"开始</p>
        </div>
      )}

      {/* 新建歌单弹窗 */}
      {showCreateDialog && (
        <CreatePlaylistDialog
          onConfirm={handleCreate}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  )
}

export default Playlists
