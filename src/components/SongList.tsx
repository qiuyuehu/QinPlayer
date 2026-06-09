// =============================================================================
// QinPlayer — 歌曲列表组件（可复用 + 虚拟列表 + 右键菜单）
// =============================================================================
// 职责：渲染歌曲列表，支持点击播放、当前歌曲高亮、右键操作
// 设计：只操作 Zustand 状态，不直接操作 AudioEngine（由 useAudioSync 统一驱动）
// 复用场景：本地音乐、歌单详情、专辑详情、最近播放、收藏、搜索
// 优化：使用 @tanstack/react-virtual 虚拟列表，3000+ 首歌滚动不掉帧
// =============================================================================

import { useCallback, useRef, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { usePlayerStore } from '../stores/playerStore'
import ContextMenu from './ContextMenu'
import SongInfoDialog from './SongInfoDialog'
import type { MenuItem } from './ContextMenu'
import type { Track, Playlist } from '../types'

// 组件 Props
interface SongListProps {
  tracks: Track[]           // 歌曲列表
  showIndex?: boolean       // 是否显示序号（默认 true）
  showAlbum?: boolean       // 是否显示专辑列（默认 false）
  playlistId?: number       // 当前歌单 ID（从歌单详情页传入，用于"从歌单移除"）
  onRemoveFromPlaylist?: (songId: number) => void  // 从歌单移除回调
}

// 每行高度（px），与 CSS 中 .song-list__row 的 height 一致
const ROW_HEIGHT = 44

function SongList({ tracks, showIndex = true, showAlbum = false, playlistId, onRemoveFromPlaylist }: SongListProps) {
  // --- Zustand store ---
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setPlaylist = usePlayerStore((s) => s.setPlaylist)
  const setPlaying = usePlayerStore((s) => s.setPlaying)

  // --- 虚拟列表滚动容器 ref ---
  const parentRef = useRef<HTMLDivElement>(null)

  // --- 右键菜单状态 ---
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    track: Track
  } | null>(null)

  // --- 歌曲信息弹窗 ---
  const [songInfoTrack, setSongInfoTrack] = useState<Track | null>(null)

  // --- 歌单列表（用于"添加到歌单"子菜单）---
  const [playlists, setPlaylists] = useState<Playlist[]>([])

  // 加载歌单列表
  useEffect(() => {
    async function loadPlaylists() {
      try {
        const list = await window.electronAPI.invoke('playlists:getAll') as Playlist[]
        setPlaylists(list)
      } catch {
        // 忽略
      }
    }
    loadPlaylists()
  }, [])

  // --- 虚拟列表配置 ---
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  // --- 点击歌曲播放 ---
  const handlePlay = useCallback((track: Track) => {
    setPlaylist(tracks)
    setCurrentTrack(track)
    setPlaying(true)
  }, [tracks, setCurrentTrack, setPlaylist, setPlaying])

  // --- 右键菜单 ---
  const handleContextMenu = useCallback((e: React.MouseEvent, track: Track) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, track })
  }, [])

  // --- 构建菜单项 ---
  const getMenuItems = useCallback((track: Track): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: '播放',
        icon: '▶',
        action: () => handlePlay(track)
      },
      {
        label: '添加到歌单',
        icon: '📋',
        children: playlists.length > 0
          ? playlists.map(pl => ({
              label: pl.name,
              action: async () => {
                await window.electronAPI.invoke('playlists:addSong', {
                  playlistId: pl.id,
                  songId: track.id
                })
              }
            }))
          : [{ label: '暂无歌单', disabled: true }]
      },
    ]

    // 从歌单移除（仅在歌单详情页显示）
    if (playlistId && onRemoveFromPlaylist) {
      items.push({
        label: '从歌单移除',
        icon: '✕',
        action: () => onRemoveFromPlaylist(track.id)
      })
    }

    items.push(
      {
        label: '打开文件所在目录',
        icon: '📁',
        action: () => {
          // 通过 IPC 打开文件所在目录
          const dir = track.filePath.substring(0, track.filePath.lastIndexOf('\\'))
          window.electronAPI.invoke('open-folder', dir)
        }
      },
      {
        label: '歌曲信息',
        icon: 'ℹ',
        action: () => setSongInfoTrack(track)
      }
    )

    return items
  }, [playlists, playlistId, onRemoveFromPlaylist, handlePlay])

  // --- 格式化时长 ---
  const formatDuration = (seconds: number): string => {
    if (!isFinite(seconds) || seconds <= 0) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (tracks.length === 0) {
    return (
      <div className="song-list__empty">
        <p>暂无歌曲</p>
      </div>
    )
  }

  return (
    <div className="song-list">
      {/* 表头（固定不滚动） */}
      <div className="song-list__header">
        {showIndex && <span className="song-list__col song-list__col--index">#</span>}
        <span className="song-list__col song-list__col--title">歌名</span>
        <span className="song-list__col song-list__col--artist">歌手</span>
        {showAlbum && <span className="song-list__col song-list__col--album">专辑</span>}
        <span className="song-list__col song-list__col--duration">时长</span>
      </div>

      {/* 虚拟滚动容器 */}
      <div
        ref={parentRef}
        className="song-list__scroll"
        style={{ overflow: 'auto' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const track = tracks[virtualRow.index]
            const isActive = currentTrack?.id === track.id
            return (
              <div
                key={track.id}
                className={`song-list__row ${isActive ? 'song-list__row--active' : ''}`}
                onClick={() => handlePlay(track)}
                onContextMenu={(e) => handleContextMenu(e, track)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${ROW_HEIGHT}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {showIndex && (
                  <span className="song-list__col song-list__col--index">
                    {isActive ? '♫' : virtualRow.index + 1}
                  </span>
                )}
                <span className="song-list__col song-list__col--title" title={track.title}>
                  {track.title}
                </span>
                <span className="song-list__col song-list__col--artist" title={track.artist}>
                  {track.artist}
                </span>
                {showAlbum && (
                  <span className="song-list__col song-list__col--album" title={track.album}>
                    {track.album}
                  </span>
                )}
                <span className="song-list__col song-list__col--duration">
                  {formatDuration(track.duration)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          items={getMenuItems(contextMenu.track)}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 歌曲信息弹窗 */}
      {songInfoTrack && (
        <SongInfoDialog
          track={songInfoTrack}
          onClose={() => setSongInfoTrack(null)}
        />
      )}
    </div>
  )
}

export default SongList
