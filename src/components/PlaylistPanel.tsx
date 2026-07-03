// =============================================================================
// QinPlayer — 播放列表面板
// =============================================================================
// 职责：展示当前播放队列，支持 ESC 关闭、队列播放和自动滚动到当前歌曲
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useUIStore } from '../stores/uiStore'
import { formatTime } from '../utils/formatTime'
import { IconMusic } from './Icons'
import type { Track } from '../types'

interface PlaylistPanelProps {
  onClose: () => void
}

function PlaylistPanel({ onClose }: PlaylistPanelProps) {
  const playlist = usePlayerStore((s) => s.playlist)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const setPlaylist = usePlayerStore((s) => s.setPlaylist)
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const featureFlags = useUIStore((s) => s.featureFlags)
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const [brokenCoverIds, setBrokenCoverIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!currentTrack) return
    itemRefs.current.get(currentTrack.id)?.scrollIntoView?.({
      block: 'nearest',
      behavior: 'smooth'
    })
  }, [currentTrack, playlist])

  const handleClearQueue = useCallback(() => {
    if (!currentTrack) {
      setPlaylist([])
      return
    }

    const currentIndex = playlist.findIndex((track) => track.id === currentTrack.id)
    // ★ 清空队列只删除当前歌曲之后的条目，保留已听过的队列上下文。
    setPlaylist(currentIndex === -1 ? [] : playlist.slice(0, currentIndex + 1))
  }, [currentTrack, playlist, setPlaylist])

  const handleCoverError = useCallback((trackId: number) => {
    setBrokenCoverIds((prev) => {
      const next = new Set(prev)
      next.add(trackId)
      return next
    })
  }, [])

  const handlePlayTrack = useCallback((track: Track) => {
    if (!featureFlags.playback) return

    setCurrentTrack(track)
    setPlaying(true)

    if (featureFlags.recent) {
      void window.electronAPI.invoke('songs:recordPlay', { songId: track.id })
    }
    void window.electronAPI.invoke('songs:updatePlayCount', { songId: track.id })
  }, [featureFlags.playback, featureFlags.recent, setCurrentTrack, setPlaying])

  const setItemRef = useCallback((trackId: number, element: HTMLButtonElement | null) => {
    if (element) {
      itemRefs.current.set(trackId, element)
    } else {
      itemRefs.current.delete(trackId)
    }
  }, [])

  return (
    <aside className="queue-panel" role="dialog" aria-label="播放队列">
      <header className="queue-panel__header">
        <div className="queue-panel__heading">
          <h2 className="queue-panel__title">播放队列</h2>
          <span className="queue-panel__count">{playlist.length} 首</span>
        </div>
        <button className="queue-panel__close" onClick={onClose} title="关闭播放队列">
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
          <button className="queue-panel__clear" onClick={handleClearQueue}>
            清空后续队列
          </button>
        </footer>
      )}
    </aside>
  )
}

export default PlaylistPanel
