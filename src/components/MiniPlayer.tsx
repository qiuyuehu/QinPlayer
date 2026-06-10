// =============================================================================
// QinPlayer — 迷你播放器
// =============================================================================
// 职责：紧凑的迷你控制窗口（350×150）
// 布局：封面 + 歌曲信息 + 进度条 + 控制按钮
// 交互：可拖拽、进度条可拖拽、音量点击静音
// =============================================================================

import { useRef, useCallback, useState } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useUIStore } from '../stores/uiStore'

function MiniPlayer() {
  // --- 播放状态 ---
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const setSeekTime = usePlayerStore((s) => s.setSeekTime)
  const nextTrack = usePlayerStore((s) => s.nextTrack)
  const prevTrack = usePlayerStore((s) => s.prevTrack)

  // --- UI 状态 ---
  const setActiveNav = useUIStore((s) => s.setActiveNav)
  const setMiniMode = useUIStore((s) => s.setMiniMode)

  // --- 进度条拖拽 ---
  const progressRef = useRef<HTMLDivElement>(null)
  const [dragTime, setDragTime] = useState<number | null>(null)
  const isDraggingRef = useRef(false)
  const dragTimeRef = useRef<number | null>(null)

  // --- 音量状态（点击静音/取消静音） ---
  const [isMuted, setIsMuted] = useState(false)
  const prevVolumeRef = useRef(1)  // 静音前的音量

  // ---------------------------------------------------------------------------
  // 关闭迷你模式 → 返回主页面
  // ---------------------------------------------------------------------------
  const handleClose = useCallback(() => {
    setMiniMode(false)
    setActiveNav('local')
  }, [setMiniMode, setActiveNav])

  // ---------------------------------------------------------------------------
  // 展开 → 恢复主窗口
  // ---------------------------------------------------------------------------
  const handleExpand = useCallback(() => {
    setMiniMode(false)
  }, [setMiniMode])

  // ---------------------------------------------------------------------------
  // 播放/暂停
  // ---------------------------------------------------------------------------
  const handlePlayPause = useCallback(() => {
    setPlaying(!isPlaying)
  }, [isPlaying, setPlaying])

  // ---------------------------------------------------------------------------
  // 音量：点击静音/取消静音
  // ---------------------------------------------------------------------------
  const handleVolumeClick = useCallback(() => {
    if (isMuted) {
      // 取消静音：恢复之前的音量
      setVolume(prevVolumeRef.current)
      setIsMuted(false)
    } else {
      // 静音：保存当前音量，设为 0
      prevVolumeRef.current = volume
      setVolume(0)
      setIsMuted(true)
    }
  }, [isMuted, volume, setVolume])

  // ---------------------------------------------------------------------------
  // 进度条拖拽逻辑
  // ---------------------------------------------------------------------------
  const updateDragTime = useCallback((e: MouseEvent) => {
    if (!progressRef.current || duration <= 0) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = ratio * duration
    setDragTime(time)
    dragTimeRef.current = time
  }, [duration])

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true
    updateDragTime(e as unknown as MouseEvent)

    const handleMouseMove = (ev: MouseEvent) => {
      updateDragTime(ev)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      const seekTo = dragTimeRef.current
      if (seekTo !== null) {
        setSeekTime(seekTo)
      }
      setDragTime(null)
      dragTimeRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [updateDragTime, setSeekTime])

  // ---------------------------------------------------------------------------
  // 格式化时间
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
  const displayTime = dragTime ?? currentTime
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0

  // 封面 URL
  const coverUrl = currentTrack?.coverPath
    ? window.electronAPI.getCoverUrl(currentTrack.coverPath)
    : null

  return (
    <div className="mini-player">
      {/* 顶部：封面 + 歌曲信息 */}
      <div className="mini-player__header">
        <div className="mini-player__cover">
          {coverUrl ? (
            <img src={coverUrl} alt="封面" />
          ) : (
            <div className="mini-player__cover-placeholder">
              <span>♪</span>
            </div>
          )}
        </div>

        <div className="mini-player__info">
          <div className="mini-player__title">
            {currentTrack ? currentTrack.title : '未在播放'}
          </div>
          <div className="mini-player__artist">
            {currentTrack ? `${currentTrack.artist} — ${currentTrack.album}` : '-'}
          </div>
        </div>

        {/* 关闭按钮 */}
        <button
          className="mini-player__close-btn"
          onClick={handleClose}
          title="关闭"
        >
          ×
        </button>
      </div>

      {/* 中间：进度条 */}
      <div className="mini-player__progress-row">
        <span className="mini-player__time">{formatTime(displayTime)}</span>
        <div
          className="mini-player__progress-bar"
          ref={progressRef}
          onMouseDown={handleProgressMouseDown}
        >
          <div
            className="mini-player__progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="mini-player__progress-thumb"
            style={{ left: `${progressPercent}%` }}
          />
        </div>
        <span className="mini-player__time">{formatTime(duration)}</span>
      </div>

      {/* 底部：控制按钮 */}
      <div className="mini-player__controls">
        {/* 音量图标（点击静音/取消静音） */}
        <button
          className="mini-player__btn"
          onClick={handleVolumeClick}
          title={isMuted ? '取消静音' : '静音'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>

        {/* 上一首 */}
        <button className="mini-player__btn" onClick={prevTrack} title="上一首">
          ⏮
        </button>

        {/* 播放/暂停 */}
        <button
          className="mini-player__btn mini-player__btn--play"
          onClick={handlePlayPause}
          title={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* 下一首 */}
        <button className="mini-player__btn" onClick={nextTrack} title="下一首">
          ⏭
        </button>

        {/* 展开按钮 */}
        <button
          className="mini-player__btn"
          onClick={handleExpand}
          title="展开"
        >
          ⤢
        </button>
      </div>
    </div>
  )
}

export default MiniPlayer
