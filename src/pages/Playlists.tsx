// =============================================================================
// QinPlayer — 歌单页面
// =============================================================================
// 职责：歌单列表 + 新建歌单 + 进入歌单详情
// 设计：歌单列表和歌单详情在同一组件内切换（不用额外路由）
// =============================================================================

import { useState, useEffect, useCallback, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import SongList from '../components/SongList'
import CreatePlaylistDialog from '../components/CreatePlaylistDialog'
import ContextMenu, { type MenuItem } from '../components/ContextMenu'
import { IconList, IconClose } from '../components/Icons'
import type { Track, Playlist } from '../types'

/**
 * 歌单页面组件
 * 包含两个视图：歌单列表网格 和 歌单详情（歌曲列表）
 * 通过 selectedPlaylist 状态在两个视图间切换，无需额外路由
 */
function Playlists() {
  // --- 状态 ---
  // 所有歌单列表
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  // 当前选中的歌单，为 null 时显示列表视图，有值时显示详情视图
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null)
  // 当前歌单内的歌曲列表
  const [songs, setSongs] = useState<Track[]>([])
  // 是否显示新建歌单弹窗
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    playlist: Playlist
  } | null>(null)
  const [editingPlaylistId, setEditingPlaylistId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const skipRenameBlurRef = useRef(false)
  const renameSubmittingRef = useRef(false)
  // 歌单内歌曲排序字段：added（添加时间）或 playCount（播放次数）
  const [sortBy, setSortBy] = useState<'added' | 'playCount'>('added')
  // 排序方向：asc 升序 / desc 降序
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // --- 加载歌单列表 ---
  // useCallback 包裹以避免每次渲染创建新函数，保持 useEffect 依赖稳定
  const loadPlaylists = useCallback(async () => {
    try {
      // 调用 IPC 获取所有歌单数据
      const list = await window.electronAPI.invoke('playlists:getAll') as Playlist[]
      setPlaylists(list)
    } catch (e) {
      console.error('加载歌单失败:', e)
    }
  }, [])

  // 组件挂载时加载歌单列表
  useEffect(() => {
    loadPlaylists()
  }, [loadPlaylists])

  // --- 加载歌单内歌曲 ---
  // 依赖 sortBy 和 sortOrder，排序方式变化时自动重新加载
  const loadPlaylistSongs = useCallback(async (playlistId: number) => {
    try {
      // 按当前排序方式获取歌单内歌曲
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

  // 选中歌单或排序方式变化时重新加载歌曲列表
  useEffect(() => {
    if (selectedPlaylist) {
      loadPlaylistSongs(selectedPlaylist.id)
    }
  }, [selectedPlaylist, loadPlaylistSongs])

  // --- 创建歌单 ---
  // 接收新歌单名称，调用 IPC 创建后刷新列表
  const handleCreate = useCallback(async (name: string) => {
    await window.electronAPI.invoke('playlists:create', { name })
    // 创建成功后关闭弹窗并刷新歌单列表
    setShowCreateDialog(false)
    loadPlaylists()
  }, [loadPlaylists])

  // --- 删除歌单 ---
  // 通过 ID 删除歌单，删除后清空选中状态并刷新列表
  const handleDelete = useCallback(async (id: number) => {
    await window.electronAPI.invoke('playlists:delete', { id })
    // 如果删除的是当前选中的歌单，回到列表视图
    setSelectedPlaylist(null)
    loadPlaylists()
  }, [loadPlaylists])

  const handleCardContextMenu = useCallback((event: MouseEvent<HTMLDivElement>, playlist: Playlist) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, playlist })
  }, [])

  const handleStartRename = useCallback((playlist: Playlist) => {
    skipRenameBlurRef.current = false
    renameSubmittingRef.current = false
    setEditingPlaylistId(playlist.id)
    setEditingName(playlist.name)
    setContextMenu(null)
  }, [])

  const handleCancelRename = useCallback(() => {
    skipRenameBlurRef.current = true
    setEditingPlaylistId(null)
    setEditingName('')
  }, [])

  const handleConfirmRename = useCallback(async () => {
    if (renameSubmittingRef.current) return
    renameSubmittingRef.current = true

    const playlistId = editingPlaylistId
    const trimmedName = editingName.trim()
    const originalName = playlists.find((playlist) => playlist.id === playlistId)?.name

    try {
      if (playlistId && trimmedName && trimmedName !== originalName) {
        await window.electronAPI.invoke('playlists:rename', {
          id: playlistId,
          name: trimmedName
        })
        loadPlaylists()
      }
    } finally {
      setEditingPlaylistId(null)
      setEditingName('')
    }
  }, [editingPlaylistId, editingName, playlists, loadPlaylists])

  const handleRenameBlur = useCallback(() => {
    if (skipRenameBlurRef.current) {
      skipRenameBlurRef.current = false
      return
    }
    void handleConfirmRename()
  }, [handleConfirmRename])

  const handleRenameKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void handleConfirmRename()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      handleCancelRename()
    }
  }, [handleConfirmRename, handleCancelRename])

  // --- 歌单详情视图 ---
  // 当有选中歌单时，渲染详情视图（包含返回按钮、排序控制和歌曲列表）
  if (selectedPlaylist) {
    return (
      <div className="playlists">
        {/* 返回按钮 + 歌单信息头部 */}
        <div className="playlists__header">
          {/* 点击返回按钮清空选中状态，回到歌单列表视图 */}
          <button
            className="playlists__back-btn"
            onClick={() => setSelectedPlaylist(null)}
          >
            ← 返回
          </button>
          <h2 className="playlists__title">{selectedPlaylist.name}</h2>
          <span className="playlists__count">{songs.length} 首</span>
        </div>

        {/* 排序控制栏：切换排序字段和升降序 */}
        <div className="playlists__sort">
          {/* 按添加时间排序按钮 */}
          <button
            className={`playlists__sort-btn ${sortBy === 'added' ? 'playlists__sort-btn--active' : ''}`}
            onClick={() => setSortBy('added')}
          >
            添加顺序
          </button>
          {/* 按播放次数排序按钮 */}
          <button
            className={`playlists__sort-btn ${sortBy === 'playCount' ? 'playlists__sort-btn--active' : ''}`}
            onClick={() => setSortBy('playCount')}
          >
            播放次数
          </button>
          {/* 切换升序/降序 */}
          <button
            className="playlists__sort-btn"
            onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? '↑ 升序' : '↓ 降序'}
          </button>
        </div>

        {/* 歌曲列表或空状态提示 */}
        {songs.length > 0 ? (
          <SongList
            tracks={songs}
            showIndex
            playlistId={selectedPlaylist.id}
            // 从歌单移除歌曲的回调：调用 IPC 删除后重新加载列表
            onRemoveFromPlaylist={async (songId) => {
              await window.electronAPI.invoke('playlists:removeSong', {
                playlistId: selectedPlaylist.id,
                songId
              })
              // 移除后重新加载确保列表一致
              loadPlaylistSongs(selectedPlaylist.id)
            }}
          />
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
  // 默认视图：展示所有歌单的网格卡片
  return (
    <div className="playlists">
      <div className="playlists__header">
        <h2 className="playlists__title">歌单</h2>
        {/* 新建歌单按钮：点击弹出创建对话框 */}
        <button
          className="playlists__create-btn"
          onClick={() => setShowCreateDialog(true)}
        >
          + 新建歌单
        </button>
      </div>

      {/* 歌单网格：有歌单时渲染卡片列表，否则显示空状态 */}
      {playlists.length > 0 ? (
        <div className="playlists__grid">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className="playlists__card"
              // 点击卡片进入该歌单详情视图
              onClick={() => {
                if (editingPlaylistId !== pl.id) setSelectedPlaylist(pl)
              }}
              onContextMenu={(event) => handleCardContextMenu(event, pl)}
            >
              <div className="playlists__card-cover">
                {pl.coverPath ? (
                  <img
                    className="playlists__card-cover-img"
                    src={window.electronAPI.getCoverUrl(pl.coverPath)}
                    alt={pl.name}
                  />
                ) : (
                  <div className="playlists__card-cover-placeholder">
                    <IconList width={32} height={32} />
                  </div>
                )}
              </div>
              {editingPlaylistId === pl.id ? (
                <input
                  className="playlists__rename-input"
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={handleRenameBlur}
                  onClick={(event) => event.stopPropagation()}
                  autoFocus
                />
              ) : (
                <div className="playlists__card-name">{pl.name}</div>
              )}
              <div className="playlists__card-count">{pl.songCount || 0} 首</div>
              {/* 删除按钮：stopPropagation 防止触发卡片的点击事件（进入详情） */}
              <button
                className="playlists__card-delete"
                onClick={(e) => {
                  e.stopPropagation()  // 阻止事件冒泡，避免误触进入歌单详情
                  handleDelete(pl.id)
                }}
                title="删除歌单"
              >
                <IconClose width={11} height={11} />
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

      {/* 新建歌单弹窗：条件渲染，showCreateDialog 为 true 时显示 */}
      {showCreateDialog && (
        <CreatePlaylistDialog
          onConfirm={handleCreate}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: '重命名',
              action: () => handleStartRename(contextMenu.playlist)
            },
            {
              label: '删除',
              action: () => {
                void handleDelete(contextMenu.playlist.id)
              }
            }
          ] satisfies MenuItem[]}
        />
      )}
    </div>
  )
}

export default Playlists
