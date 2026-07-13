// =============================================================================
// QinPlayer — 播放列表面板
// =============================================================================
// 职责：展示当前播放队列，支持 ESC 关闭、队列播放和自动滚动到当前歌曲
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { formatTime } from '../utils/formatTime'
import { IconClose, IconMusic } from './Icons'
import type { Track } from '../types'
import { useExitTransition } from '../hooks/useExitTransition'
import { useTrackContextMenu } from '../hooks/useTrackContextMenu'
import ContextMenu from './ContextMenu'
import SongInfoDialog from './SongInfoDialog'
import { useUIStore } from '../stores/uiStore'

interface PlaylistPanelProps {
  onClose: () => void
}

function PlaylistPanel({ onClose }: PlaylistPanelProps) {
  const playlist = usePlayerStore((s) => s.playlist)
  const priorityQueue = usePlayerStore((s) => s.priorityQueue)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const clearUpcoming = usePlayerStore((s) => s.clearUpcoming)
  const removeFromPriorityQueue = usePlayerStore((s) => s.removeFromPriorityQueue)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const addToPriorityQueue = usePlayerStore((s) => s.addToPriorityQueue)
  const featureFlags = useUIStore((s) => s.featureFlags)
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
  }, [currentTrack, playlist, priorityQueue])

  const handleClearQueue = useCallback(() => {
    if (isExiting) return
    clearUpcoming()
  }, [clearUpcoming, isExiting])

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
  const trackMenu = useTrackContextMenu({
    onPlay: handlePlayTrack,
    onAddToPriorityQueue: addToPriorityQueue,
    onRemoveFromPriorityQueue: removeFromPriorityQueue,
    canAddToPriorityQueue: (track) => currentTrack?.id !== track.id && !priorityQueue.some((item) => item.id === track.id),
    playbackEnabled: !isExiting,
    playlistsEnabled: featureFlags.playlists,
  })

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
        {playlist.length + priorityQueue.length > 0 ? (
          <div className="queue-panel__list">
            {priorityQueue.length > 0 && <div className="queue-panel__section">接下来 {priorityQueue.length} 首</div>}
            {priorityQueue.map((track) => (
              <div key={`priority:${track.id}`} className="queue-panel__item" onContextMenu={(event) => !isExiting && trackMenu.open(event, track, 'priority')}>
                <button type="button" className="queue-panel__item-main" onClick={() => handlePlayTrack(track)} disabled={isExiting}>{track.title} - {track.artist}</button>
                <button type="button" className="queue-panel__remove" title="从接下来移除" disabled={isExiting} onClick={() => removeFromPriorityQueue(track.id)}><IconClose width={14} height={14} /></button>
              </div>
            ))}
            {playlist.length > 0 && <div className="queue-panel__section">播放列表 {playlist.length} 首</div>}
            {playlist.map((track) => {
              const hasCover = track.coverPath && !brokenCoverIds.has(track.id)

              return (
                <button
                  key={track.id}
                  ref={(element) => setItemRef(track.id, element)}
                  className={`queue-panel__item ${currentTrack?.id === track.id ? 'queue-panel__item--active' : ''}`}
                  onClick={() => handlePlayTrack(track)}
                  onContextMenu={(event) => !isExiting && trackMenu.open(event, track, 'source')}
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

      {playlist.length + priorityQueue.length > 0 && (
        <footer className="queue-panel__footer">
          <button className="queue-panel__clear" onClick={handleClearQueue} disabled={isExiting}>
            清空后续队列
          </button>
          <button className="queue-panel__back" onClick={requestExit} disabled={isExiting} title="返回">
            返回
          </button>
        </footer>
      )}
      {trackMenu.target && <ContextMenu items={trackMenu.getItems(trackMenu.target.track, trackMenu.target.kind)} x={trackMenu.target.x} y={trackMenu.target.y} onClose={trackMenu.close} />}
      {trackMenu.songInfoTrack && <SongInfoDialog track={trackMenu.songInfoTrack} onClose={trackMenu.closeSongInfo} />}
    </aside>
  )
}

export default PlaylistPanel
