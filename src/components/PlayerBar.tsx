// =============================================================================
// QinPlayer — 底部播放控制条
// =============================================================================
// 职责：显示歌曲信息、播放控制按钮、进度条、音量
// 设计：只读/写 Zustand 状态，不直接操作 AudioEngine（由 useAudioSync 统一驱动）
// =============================================================================

import { useRef, useCallback, useState } from 'react'
import { usePlayerStore, togglePlayMode } from '../stores/playerStore'
import type { PlayMode } from '../types'

// 播放模式图标映射
// 用简洁文字 + 符号区分，避免 emoji 在不同系统显示不一致
const PLAY_MODE_ICONS: Record<PlayMode, string> = {
  sequential: '↻',    // 顺序：循环箭头
  loop: '↻₁',         // 单曲循环：循环箭头 + 下标 1
  shuffle: '⤮',       // 随机：交叉箭头
}

// 播放模式 tooltip 文字
const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  sequential: '顺序播放',
  loop: '单曲循环',
  shuffle: '随机播放',
}

function PlayerBar() {
  // --- Zustand store ---
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const playMode = usePlayerStore((s) => s.playMode)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const setPlayMode = usePlayerStore((s) => s.setPlayMode)
  const setSeekTime = usePlayerStore((s) => s.setSeekTime)
  const nextTrack = usePlayerStore((s) => s.nextTrack)
  const prevTrack = usePlayerStore((s) => s.prevTrack)

  // --- 进度条拖拽 ---
  const progressRef = useRef<HTMLDivElement>(null)
  const [dragTime, setDragTime] = useState<number | null>(null)
  const isDraggingRef = useRef(false)

  // --- 音量条拖拽 ---
  const volumeBarRef = useRef<HTMLDivElement>(null)

  // --- 播放/暂停 ---
  const handlePlayPause = useCallback(() => {
    setPlaying(!isPlaying)
  }, [isPlaying, setPlaying])

  // --- 上一首/下一首 ---
  const handlePrev = useCallback(() => {
    prevTrack()
  }, [prevTrack])

  const handleNext = useCallback(() => {
    nextTrack()
  }, [nextTrack])

  // --- 播放模式切换 ---
  const handleToggleMode = useCallback(() => {
    const nextMode = togglePlayMode(playMode)
    setPlayMode(nextMode)
  }, [playMode, setPlayMode])

  // ---------------------------------------------------------------------------
  // 进度条：拖拽交互
  // ---------------------------------------------------------------------------
  const updateDragTime = useCallback((e: MouseEvent) => {
    if (!progressRef.current || duration <= 0) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setDragTime(ratio * duration)
  }, [duration])

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true
    updateDragTime(e as unknown as MouseEvent)

    const handleMouseMove = (ev: MouseEvent) => {
      updateDragTime(ev)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      // 拖拽结束，通过 Zustand 发送 seekTime（useAudioSync 会驱动 AudioEngine）
      const finalTime = usePlayerStore.getState().seekTime
      const currentTimeVal = dragTime ?? currentTime
      setSeekTime(currentTimeVal)
      setDragTime(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [updateDragTime, setSeekTime, dragTime, currentTime])

  // ---------------------------------------------------------------------------
  // 音量：拖拽交互
  // ---------------------------------------------------------------------------
  const updateVolume = useCallback((e: MouseEvent) => {
    if (!volumeBarRef.current) return
    const rect = volumeBarRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setVolume(ratio)
  }, [setVolume])

  const handleVolumeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    updateVolume(e as unknown as MouseEvent)

    const handleMouseMove = (ev: MouseEvent) => {
      updateVolume(ev)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [updateVolume])

  // ---------------------------------------------------------------------------
  // 工具函数
  // ---------------------------------------------------------------------------
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------
  // 拖拽中显示拖拽预览时间，否则显示真实播放时间
  const displayTime = dragTime ?? currentTime
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0

  return (
    <div className="player-bar">
      {/* 左侧：歌曲信息 */}
      <div className="player-bar__info">
        <div className="player-bar__cover">
          {currentTrack?.coverPath && (
            <img src={window.electronAPI.getCoverUrl(currentTrack.coverPath)} alt="封面" />
          )}
        </div>
        <div className="player-bar__meta">
          <span className="player-bar__title">
            {currentTrack ? currentTrack.title : '未在播放'}
          </span>
          <span className="player-bar__artist">
            {currentTrack ? currentTrack.artist : '-'}
          </span>
        </div>
      </div>

      {/* 中间：控制按钮 + 进度条 */}
      <div className="player-bar__controls">
        <div className="player-bar__buttons">
          <button className="player-bar__btn" onClick={handlePrev}>⏮</button>
          <button className="player-bar__btn player-bar__play-btn" onClick={handlePlayPause}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="player-bar__btn" onClick={handleNext}>⏭</button>
        </div>
        <div className="player-bar__progress-row">
          <span className="player-bar__time">{formatTime(displayTime)}</span>
          <div
            className="player-bar__progress-bar"
            ref={progressRef}
            onMouseDown={handleProgressMouseDown}
          >
            <div
              className="player-bar__progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="player-bar__progress-thumb"
              style={{ left: `${progressPercent}%` }}
            />
          </div>
          <span className="player-bar__time">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 右侧：播放模式 + 音量 */}
      <div className="player-bar__extra">
        <button
          className="player-bar__btn"
          onClick={handleToggleMode}
          title={PLAY_MODE_LABELS[playMode]}
        >
          {PLAY_MODE_ICONS[playMode]}
        </button>
        <div className="player-bar__volume-row">
          <span className="player-bar__volume-icon">🔊</span>
          <div
            className="player-bar__volume-bar"
            ref={volumeBarRef}
            onMouseDown={handleVolumeMouseDown}
          >
            <div
              className="player-bar__volume-fill"
              style={{ width: `${volume * 100}%` }}
            />
            <div
              className="player-bar__volume-thumb"
              style={{ left: `${volume * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlayerBar
