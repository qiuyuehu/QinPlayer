// =============================================================================
// QinPlayer — 歌曲列表组件（可复用 + 虚拟列表 + 右键菜单）
// =============================================================================
// 职责：渲染歌曲列表，支持点击播放、当前歌曲高亮、右键操作
// 设计：只操作 Zustand 状态，不直接操作 AudioEngine（由 useAudioSync 统一驱动）
// 复用场景：本地音乐、歌单详情、专辑详情、最近播放、收藏、搜索
// 优化：使用 @tanstack/react-virtual 虚拟列表，3000+ 首歌滚动不掉帧
// =============================================================================

import { forwardRef, useCallback, useImperativeHandle, useRef, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'     // 虚拟列表：只渲染可视区域的 DOM 节点
import { usePlayerStore } from '../stores/playerStore'        // 全局播放状态（当前歌曲、播放列表、播放状态）
import { useUIStore } from '../stores/uiStore'
import ContextMenu from './ContextMenu'                       // 通用右键菜单组件
import SongInfoDialog from './SongInfoDialog'                 // 歌曲详情弹窗
import { IconPlay, IconList, IconClose, IconFolder, IconInfo, IconStar } from './Icons'
import type { MenuItem } from './ContextMenu'
import type { Track, Playlist } from '../types'

// 组件 Props
export interface SongListHandle {
  scrollToTrackId: (trackId: number) => void
}

interface SongListProps {
  tracks: Track[]           // 歌曲列表
  showIndex?: boolean       // 是否显示序号（默认 true）
  showAlbum?: boolean       // 是否显示专辑列（默认 false）
  playlistId?: number       // 当前歌单 ID（从歌单详情页传入，用于"从歌单移除"）
  onRemoveFromPlaylist?: (songId: number) => void  // 从歌单移除回调
  containerHeight?: number  // 外部容器高度（播放列表面板等半高场景使用）
}

// 每行高度（px），与 CSS 中 .song-list__row 的 height 一致
const ROW_HEIGHT = 44

const SongList = forwardRef<SongListHandle, SongListProps>(function SongList(
  { tracks, showIndex = true, showAlbum = false, playlistId, onRemoveFromPlaylist, containerHeight },
  ref
) {
  // --- Zustand store ---
  // 以下状态由 useAudioSync 统一驱动 AudioEngine，组件只操作 store
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setPlaylist = usePlayerStore((s) => s.setPlaylist)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const featureFlags = useUIStore((s) => s.featureFlags)

  // --- 虚拟列表滚动容器 ref ---
  // 此 ref 挂在滚动容器上，useVirtualizer 通过它读取 scrollTop 和可视高度
  const parentRef = useRef<HTMLDivElement>(null)

  // --- 右键菜单状态 ---
  // 记录右键点击位置和目标歌曲，非 null 时渲染 ContextMenu
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    track: Track
  } | null>(null)

  // --- 歌曲信息弹窗 ---
  // 非 null 时显示歌曲详情弹窗，传递当前右键点击的歌曲
  const [songInfoTrack, setSongInfoTrack] = useState<Track | null>(null)

  // --- 歌单列表（用于"添加到歌单"子菜单）---
  // 从数据库加载所有歌单，构建右键菜单的"添加到歌单"子菜单
  const [playlists, setPlaylists] = useState<Playlist[]>([])

  // --- 收藏歌曲 ID 集合（快速查找）---
  // 用 Set 存储，O(1) 判断某首歌是否已收藏，避免每次遍历数组
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set())
  const [animateInitialRows, setAnimateInitialRows] = useState(true)
  const prevTracksRef = useRef<Track[] | null>(null)

  // 加载歌单列表 + 收藏列表
  // 并行请求两个 IPC 通道，减少加载时间
  useEffect(() => {
    async function loadData() {
      try {
        if (featureFlags.playlists) {
          const list = await window.electronAPI.invoke('playlists:getAll') as Playlist[]
          setPlaylists(list)
        }
        if (featureFlags.liked) {
          const likedSongs = await window.electronAPI.invoke('songs:getLiked') as Track[]
          setLikedIds(new Set(likedSongs.map(s => s.id)))
        }
      } catch {
        // 忽略
      }
    }
    loadData()
  }, [featureFlags.playlists, featureFlags.liked])

  // ★ 只让当前列表首次可见批次做淡入；滚动产生的新虚拟行不重新动画。
  useEffect(() => {
    if (prevTracksRef.current === tracks) return
    prevTracksRef.current = tracks
    setAnimateInitialRows(true)
    const timer = setTimeout(() => setAnimateInitialRows(false), 500)
    return () => clearTimeout(timer)
  }, [tracks])

  // --- 虚拟列表配置 ---
  // overscan: 10 表示上下各多渲染 10 行，滚动时减少白屏闪烁
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  useImperativeHandle(ref, () => ({
    scrollToTrackId: (trackId: number) => {
      const index = tracks.findIndex((track) => track.id === trackId)
      if (index < 0) return
      virtualizer.scrollToIndex(index, { align: 'center' })
    }
  }), [tracks, virtualizer])

  // --- 点击歌曲播放 ---
  // 将整个歌曲列表设为播放队列，再指定当前播放歌曲，立即开始播放
  const handlePlay = useCallback((track: Track) => {
    if (!featureFlags.playback) return

    setPlaylist(tracks)
    setCurrentTrack(track)
    setPlaying(true)
    // 记录播放 —— 同时写入"最近播放"表和更新"播放次数"，两个 IPC 互不依赖
    if (featureFlags.recent) {
      window.electronAPI.invoke('songs:recordPlay', { songId: track.id })
    }
    window.electronAPI.invoke('songs:updatePlayCount', { songId: track.id })
  }, [tracks, featureFlags.playback, featureFlags.recent, setCurrentTrack, setPlaylist, setPlaying])

  const handleAddToQueue = useCallback((track: Track) => {
    const { playlist, currentTrack, setPlaylist: updatePlaylist } = usePlayerStore.getState()
    if (playlist.some((item) => item.id === track.id)) return

    const nextPlaylist = [...playlist]
    if (!currentTrack) {
      nextPlaylist.push(track)
    } else {
      const currentIndex = nextPlaylist.findIndex((item) => item.id === currentTrack.id)
      if (currentIndex === -1) {
        nextPlaylist.push(track)
      } else {
        nextPlaylist.splice(currentIndex + 1, 0, track)
      }
    }

    updatePlaylist(nextPlaylist)
  }, [])

  // --- 切换收藏状态 ---
  // 点击爱心按钮时切换收藏，需要阻止事件冒泡避免触发整行播放
  const toggleLike = useCallback(async (e: React.MouseEvent, track: Track) => {
    e.stopPropagation()  // 关键：阻止冒泡到父元素的 onClick，否则会同时触发播放
    if (!featureFlags.liked) return

    const isLiked = likedIds.has(track.id)
    if (isLiked) {
      await window.electronAPI.invoke('songs:unlike', { songId: track.id })
      setLikedIds(prev => {
        const next = new Set(prev)
        next.delete(track.id)
        return next
      })
    } else {
      await window.electronAPI.invoke('songs:like', { songId: track.id })
      setLikedIds(prev => new Set(prev).add(track.id))
    }
  }, [likedIds, featureFlags.liked])

  // --- 右键菜单 ---
  // 记录鼠标坐标和目标歌曲，传给 ContextMenu 组件定位菜单
  const handleContextMenu = useCallback((e: React.MouseEvent, track: Track) => {
    e.preventDefault()   // 阻止浏览器默认右键菜单
    setContextMenu({ x: e.clientX, y: e.clientY, track })
  }, [])

  // --- 构建菜单项 ---
  // 动态构建菜单：根据是否有歌单决定显示哪些选项
  const getMenuItems = useCallback((track: Track): MenuItem[] => {
    const items: MenuItem[] = []

    if (featureFlags.playback) {
      items.push({
        label: '播放',
        icon: <IconPlay width={14} height={14} />,
        action: () => handlePlay(track)
      }, {
        label: '添加到播放队列',
        icon: <IconList width={14} height={14} />,
        action: () => handleAddToQueue(track)
      })
    }

    if (featureFlags.playlists) {
      items.push({
        label: '添加到歌单',               // 有子菜单的项，hover 时展开歌单列表
        icon: <IconList width={14} height={14} />,
        children: playlists.length > 0     // 空歌单时显示"暂无歌单"占位
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
      })
    }

    // 从歌单移除（仅在歌单详情页显示）
    // 只有从歌单详情页进入时才传入 playlistId，其他页面不显示此选项
    if (featureFlags.playlists && playlistId && onRemoveFromPlaylist) {
      items.push({
        label: '从歌单移除',
        icon: <IconClose width={14} height={14} />,
        action: () => onRemoveFromPlaylist(track.id)
      })
    }

    items.push(
      {
        label: '打开文件所在目录',
        icon: <IconFolder width={14} height={14} />,
        action: () => {
          // 通过最后一个反斜杠截取目录路径（Windows 路径格式）
          const dir = track.filePath.substring(0, track.filePath.lastIndexOf('\\'))
          window.electronAPI.invoke('open-folder', dir)
        }
      },
      {
        label: '歌曲信息',
        icon: <IconInfo width={14} height={14} />,
        action: () => setSongInfoTrack(track)
      }
    )

    return items
  }, [featureFlags.playback, featureFlags.playlists, playlists, playlistId, onRemoveFromPlaylist, handlePlay, handleAddToQueue])

  // --- 格式化时长 ---
  // 将秒数转为 "m:ss" 格式，无效值显示 "--:--" 占位
  const formatDuration = (seconds: number): string => {
    if (!isFinite(seconds) || seconds <= 0) return '--:--'  // 保护：避免 NaN/Infinity 显示
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (tracks.length === 0) {
    return (
      <div className="song-list__empty">
        <p>暂无歌曲</p>    {/* 空列表时的友好提示，避免空白页 */}
      </div>
    )
  }

  return (
    <div className="song-list">
      {/* 表头独立于滚动容器，避免跟随列表内容滚动 */}
      <div className="song-list__header">
        {showIndex && <span className="song-list__col song-list__col--index">&nbsp;</span>}
        <span className="song-list__col song-list__col--title">歌名</span>
        <span className="song-list__col song-list__col--artist">歌手</span>
        {showAlbum && <span className="song-list__col song-list__col--album">专辑</span>}
        <span className="song-list__col song-list__col--duration">时长</span>
        <span className="song-list__col song-list__col--like"></span>
      </div>

      {/* 虚拟滚动容器：只包含数据行，滚动条不再覆盖表头 */}
      <div
        ref={parentRef}
        className="song-list__scroll"
        style={{
          overflow: 'auto',
          height: containerHeight !== undefined ? `${containerHeight}px` : undefined,
        }}
      >
        {/* 此占位 div 的高度等于所有行的总高度，撑出滚动条 */}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {/* 只渲染可视区域内的行（虚拟列表核心），每行通过 translateY 定位到正确位置 */}
          {virtualizer.getVirtualItems().map((virtualRow, visibleIndex) => {
            const track = tracks[virtualRow.index]
            const isActive = currentTrack?.id === track.id  // 当前播放歌曲高亮
            return (
              <div
                key={track.id}
                className={`song-list__row ${isActive ? 'song-list__row--active' : ''} ${animateInitialRows ? 'song-list__row--enter' : ''}`}
                onDoubleClick={() => handlePlay(track)}         // 双击整行触发播放（防误触）
                onContextMenu={(e) => handleContextMenu(e, track)} // 右键打开菜单
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${ROW_HEIGHT}px`,
                  // transform 定位：绝对定位 + translateY 模拟固定行高排列
                  transform: `translateY(${virtualRow.start}px)`,
                  animationDelay: animateInitialRows ? `${Math.min(visibleIndex, 8) * 28}ms` : undefined,
                }}
              >
                {showIndex && (
                  <span className="song-list__col song-list__col--index">
                    {isActive ? '♫' : virtualRow.index + 1}   {/* 播放中显示音符图标，否则显示序号 */}
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
                {featureFlags.liked && (
                  <button
                    className={`song-list__like ${likedIds.has(track.id) ? 'song-list__like--active' : ''}`} // 已收藏时高亮样式
                    onClick={(e) => toggleLike(e, track)}
                    title={likedIds.has(track.id) ? '取消收藏' : '收藏'}  // tooltip 提示当前状态
                  >
                    <IconStar width={14} height={14} filled={likedIds.has(track.id)} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 右键菜单 —— 仅在 contextMenu 非 null 时渲染，关闭时置 null */}
      {contextMenu && (
        <ContextMenu
          items={getMenuItems(contextMenu.track)}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 歌曲信息弹窗 —— 由菜单"歌曲信息"项触发，关闭时置 null */}
      {songInfoTrack && (
        <SongInfoDialog
          track={songInfoTrack}
          onClose={() => setSongInfoTrack(null)}
        />
      )}
    </div>
  )
})

export default SongList
