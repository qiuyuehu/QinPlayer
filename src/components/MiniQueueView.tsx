// =============================================================================
// QinPlayer — 迷你播放队列视图
// =============================================================================
// 职责：紧凑展示播放队列、定位当前歌曲并把点击意图交给上层
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatTime } from '../utils/formatTime'
import { IconMusic } from './Icons'
import type { Track } from '../types'

interface MiniQueueViewProps {
  tracks: Track[]
  currentTrackId: number | null
  onPlay: (track: Track) => void
}

function MiniQueueView({ tracks, currentTrackId, onPlay }: MiniQueueViewProps) {
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const [brokenCoverIds, setBrokenCoverIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (currentTrackId === null) return
    itemRefs.current.get(currentTrackId)?.scrollIntoView?.({
      block: 'nearest',
      behavior: 'auto',
    })
  }, [currentTrackId, tracks])

  const setItemRef = useCallback((trackId: number, element: HTMLButtonElement | null) => {
    if (element) {
      itemRefs.current.set(trackId, element)
    } else {
      itemRefs.current.delete(trackId)
    }
  }, [])

  const handleCoverError = useCallback((trackId: number) => {
    setBrokenCoverIds((current) => {
      const next = new Set(current)
      next.add(trackId)
      return next
    })
  }, [])

  if (tracks.length === 0) {
    return <div className="mini-queue-view mini-queue-view--empty">当前播放队列为空</div>
  }

  return (
    <div className="mini-queue-view" role="list" aria-label="迷你播放队列">
      {tracks.map((track) => {
        const isCurrent = track.id === currentTrackId
        const hasCover = Boolean(track.coverPath) && !brokenCoverIds.has(track.id)

        return (
          <button
            key={track.id}
            ref={(element) => setItemRef(track.id, element)}
            type="button"
            className={`mini-queue-view__item ${isCurrent ? 'mini-queue-view__item--active' : ''}`}
            aria-current={isCurrent ? 'true' : undefined}
            aria-label={`${track.title} - ${track.artist}`}
            onClick={() => onPlay(track)}
          >
            {hasCover ? (
              <img
                className="mini-queue-view__cover"
                src={window.electronAPI.getCoverUrl(track.coverPath!)}
                alt={`${track.title} 封面`}
                onError={() => handleCoverError(track.id)}
              />
            ) : (
              <span className="mini-queue-view__cover mini-queue-view__cover--placeholder" aria-hidden="true">
                <IconMusic width={16} height={16} />
              </span>
            )}
            <span className="mini-queue-view__info">
              <span className="mini-queue-view__title">{track.title || track.fileName}</span>
              <span className="mini-queue-view__artist">{track.artist || '未知歌手'}</span>
            </span>
            <span className="mini-queue-view__duration">{formatTime(track.duration)}</span>
          </button>
        )
      })}
    </div>
  )
}

export default MiniQueueView
