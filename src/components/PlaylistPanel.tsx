// =============================================================================
// QinPlayer — 播放列表面板
// =============================================================================
// 职责：展示当前播放队列，支持遮罩/ESC 关闭，并自动滚动到当前歌曲
// =============================================================================

import { useEffect, useMemo, useRef } from 'react'
import SongList, { type SongListHandle } from './SongList'
import { usePlayerStore } from '../stores/playerStore'

const ROW_HEIGHT = 44
const HEADER_HEIGHT = 52
const EMPTY_HEIGHT = 120

interface PlaylistPanelProps {
  onClose: () => void
}

function PlaylistPanel({ onClose }: PlaylistPanelProps) {
  const playlist = usePlayerStore((s) => s.playlist)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const songListRef = useRef<SongListHandle>(null)

  const panelHeight = useMemo(() => {
    const viewportHeight = typeof window === 'undefined' ? 680 : window.innerHeight
    const contentHeight = playlist.length > 0
      ? HEADER_HEIGHT + playlist.length * ROW_HEIGHT
      : EMPTY_HEIGHT
    return Math.min(contentHeight, viewportHeight * 0.5)
  }, [playlist.length])

  const listHeight = Math.max(ROW_HEIGHT, panelHeight - HEADER_HEIGHT)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!currentTrack) return
    songListRef.current?.scrollToTrackId(currentTrack.id)
  }, [currentTrack, playlist])

  return (
    <div className="playlist-panel__overlay" onClick={onClose}>
      <section
        className="playlist-panel"
        style={{ height: `${panelHeight}px` }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="playlist-panel__header">
          <div>
            <h2 className="playlist-panel__title">播放列表</h2>
            <span className="playlist-panel__count">{playlist.length} 首</span>
          </div>
          <button className="playlist-panel__close" onClick={onClose} title="关闭播放列表">
            ×
          </button>
        </header>

        {playlist.length > 0 ? (
          <SongList
            ref={songListRef}
            tracks={playlist}
            showIndex
            showAlbum={false}
            containerHeight={listHeight}
          />
        ) : (
          <div className="playlist-panel__empty">当前播放队列为空</div>
        )}
      </section>
    </div>
  )
}

export default PlaylistPanel
