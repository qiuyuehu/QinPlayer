// =============================================================================
// QinPlayer — 播放列表面板
// =============================================================================
// 职责：展示当前播放队列，支持 ESC 关闭、队列播放和自动滚动到当前歌曲
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { formatTime } from '../utils/formatTime'
import { IconMusic } from './Icons'
import type { Track } from '../types'
import { useExitTransition } from '../hooks/useExitTransition'

interface PlaylistPanelProps {
  onClose: () => void
}

function PlaylistPanel({ onClose }: PlaylistPanelProps) {
  const playlist = usePlayerStore((s) => s.playlist)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const setPlaylist = usePlayerStore((s) => s.setPlaylist)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const [brokenCoverIds, setBrokenCoverIds] = useState<Set<number>>(new Set())
  const { isExiting, requestExit, handleAnimationEnd } = useExitTransition(onClose, 300)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestExit()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [requestExit])

  useEffect(() => {
    if (!currentTrack) return
    itemRefs.current.get(currentTrack.id)?.scrollIntoView?.({
      block: 'nearest',
      behavior: 'smooth'
    })
  }, [currentTrack, playlist])

  const handleClearQueue = useCallback(() => {
    if (isExiting) return
    if (!currentTrack) {
      setPlaylist([])
      return
    }

    const currentIndex = playlist.findIndex((track) => track.id === currentTrack.id)
    // ★ 清空队列只删除当前歌曲之后的条目，保留已听过的队列上下文。
    setPlaylist(currentIndex === -1 ? [] : playlist.slice(0, currentIndex + 1))
  }, [currentTrack, isExiting, playlist, setPlaylist])

  const handleCoverError = useCallback((trackId: number) => {
    setBrokenCoverIds((prev) => {
      const next = new Set(prev)
      next.add(trackId)
      return next
    })
  }, [])

  const handlePlayTrack = useCallback((track: Track) => {
    if (isExiting) return
    playTrack(track)
  }, [isExiting, playTrack])

  const setItemRef = useCallback((trackId: number, element: HTMLButtonElement | null) => {
    if (element) {
      itemRefs.current.set(trackId, element)
    } else {
      itemRefs.current.delete(trackId)
    }
  }, [])

  return (
    <aside
      className={`queue-panel ${isExiting ? 'queue-panel--exit' : ''}`}
      role="dialog"
      aria-label="播放队列"
      onAnimationEnd={handleAnimationEnd}
    >
      <header className="queue-panel__header">
        <div className="queue-panel__heading">
          <h2 className="queue-panel__title">播放队列</h2>
          <span className="queue-panel__count">{playlist.length} 首</span>
        </div>
        <button className="queue-panel__close" onClick={requestExit} disabled={isExiting} title="关闭播放队列">
          ×
        </button>
      </header>

      <div className="queue-panel__content">
        {playlist.length > 0 ? (
          <div className="queue-panel__list">
            {playlist.map((track) => {
              const hasCover = track.coverPath && !brokenCoverIds.has(track.id)

              return (
                <button
                  key={track.id}
                  ref={(element) => setItemRef(track.id, element)}
                  className={`queue-panel__item ${currentTrack?.id === track.id ? 'queue-panel__item--active' : ''}`}
                  onClick={() => handlePlayTrack(track)}
                  disabled={isExiting}
                  title={`${track.title} - ${track.artist}`}
                >
                  {hasCover ? (
                    <img
                      className="queue-panel__cover"
                      src={window.electronAPI.getCoverUrl(track.coverPath)}
                      alt=""
                      onError={() => handleCoverError(track.id)}
                    />
                  ) : (
                    <span className="queue-panel__cover queue-panel__cover--placeholder">
                      <IconMusic width={18} height={18} />
                    </span>
                  )}
                  <span className="queue-panel__info">
                    <span className="queue-panel__track-title">{track.title}</span>
                    <span className="queue-panel__artist">{track.artist}</span>
                  </span>
                  <span className="queue-panel__duration">{formatTime(track.duration)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="queue-panel__empty">当前播放队列为空</div>
        )}
      </div>

      {playlist.length > 0 && (
        <footer className="queue-panel__footer">
          <button className="queue-panel__clear" onClick={handleClearQueue} disabled={isExiting}>
            清空后续队列
          </button>
          <button className="queue-panel__back" onClick={requestExit} disabled={isExiting} title="返回">
            返回
          </button>
        </footer>
      )}
    </aside>
  )
}

export default PlaylistPanel
