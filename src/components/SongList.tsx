// =============================================================================
// QinPlayer — 歌曲列表组件（可复用 + 虚拟列表）
// =============================================================================
// 职责：渲染歌曲列表，支持点击播放、当前歌曲高亮
// 设计：只操作 Zustand 状态，不直接操作 AudioEngine（由 useAudioSync 统一驱动）
// 复用场景：本地音乐、歌单详情、专辑详情、最近播放、收藏、搜索
// 优化：使用 @tanstack/react-virtual 虚拟列表，3000+ 首歌滚动不掉帧
// =============================================================================

import { useCallback, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { usePlayerStore } from '../stores/playerStore'
import type { Track } from '../types'

// 组件 Props
interface SongListProps {
  tracks: Track[]           // 歌曲列表
  showIndex?: boolean       // 是否显示序号（默认 true）
  showAlbum?: boolean       // 是否显示专辑列（默认 false）
}

// 每行高度（px），与 CSS 中 .song-list__row 的 height 一致
const ROW_HEIGHT = 44

function SongList({ tracks, showIndex = true, showAlbum = false }: SongListProps) {
  // --- Zustand store ---
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setPlaylist = usePlayerStore((s) => s.setPlaylist)
  const setPlaying = usePlayerStore((s) => s.setPlaying)

  // --- 虚拟列表滚动容器 ref ---
  const parentRef = useRef<HTMLDivElement>(null)

  // --- 虚拟列表配置 ---
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,  // 额外渲染 10 行，防止快速滚动白屏
  })

  // --- 点击歌曲播放（只改 Zustand 状态，useAudioSync 会自动驱动 AudioEngine） ---
  const handlePlay = useCallback((track: Track, index: number) => {
    setPlaylist(tracks)
    setCurrentTrack(track)
    setPlaying(true)
  }, [tracks, setCurrentTrack, setPlaylist, setPlaying])

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
        {/* 撑开滚动高度的占位元素 */}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {/* 只渲染可视区域内的行 */}
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const track = tracks[virtualRow.index]
            const isActive = currentTrack?.id === track.id
            return (
              <div
                key={track.id}
                className={`song-list__row ${isActive ? 'song-list__row--active' : ''}`}
                onClick={() => handlePlay(track, virtualRow.index)}
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
    </div>
  )
}

export default SongList
