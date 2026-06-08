// =============================================================================
// QinPlayer — 底部播放控制条
// =============================================================================
// 职责：显示歌曲信息、播放控制按钮、进度条、音量、播放模式
// 设计：进度条用 useRef + timeupdate 直接更新 DOM，不走 Zustand（高频更新）
//       音量和播放状态通过 playerStore 管理（低频更新）
// =============================================================================

import { useRef, useState, useEffect, useCallback } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { getAudioEngine } from '../utils/AudioEngine'
import type { PlayMode } from '../types'

// ---------------------------------------------------------------------------
// 播放模式配置
// ---------------------------------------------------------------------------

const PLAY_MODE_ORDER: PlayMode[] = ['sequential', 'loop', 'shuffle']

const PLAY_MODE_ICONS: Record<PlayMode, string> = {
  sequential: '↻',
  loop: '🔁',
  shuffle: '🔀',
}

const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  sequential: '顺序播放',
  loop: '单曲循环',
  shuffle: '随机播放',
}

function getNextPlayMode(current: PlayMode): PlayMode {
  const index = PLAY_MODE_ORDER.indexOf(current)
  return PLAY_MODE_ORDER[(index + 1) % PLAY_MODE_ORDER.length]
}

// ---------------------------------------------------------------------------
// 时间格式化
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// =============================================================================
// PlayerBar 组件
// =============================================================================

function PlayerBar() {
  // --- Zustand 状态 ---
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const volume = usePlayerStore((s) => s.volume)
  const playMode = usePlayerStore((s) => s.playMode)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const setPlayMode = usePlayerStore((s) => s.setPlayMode)
  const nextTrack = usePlayerStore((s) => s.nextTrack)
  const prevTrack = usePlayerStore((s) => s.prevTrack)

  // --- DOM refs ---
  const progressRef = useRef<HTMLDivElement>(null)
  const currentTimeRef = useRef<HTMLSpanElement>(null)
  const progressFillRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  // --- 本地状态 ---
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [prevVolume, setPrevVolume] = useState(0.8)

  // --- AudioEngine 单例（用 ref 避免重复创建）---
  const engineRef = useRef<ReturnType<typeof getAudioEngine> | null>(null)

  /** 懒初始化 AudioEngine */
  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = getAudioEngine()
    }
    return engineRef.current
  }, [])

  // ---------------------------------------------------------------------------
  // 注册 AudioEngine 回调（只执行一次）
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const engine = getEngine()

    // 播放进度更新
    engine.onTimeUpdate((currentTime, totalDuration) => {
      if (isDragging.current) return
      if (currentTimeRef.current) {
        currentTimeRef.current.textContent = formatTime(currentTime)
      }
      if (progressFillRef.current && totalDuration > 0) {
        progressFillRef.current.style.width = `${(currentTime / totalDuration) * 100}%`
      }
    })

    // 元数据加载完成
    engine.onLoadedMetadata((totalDuration) => {
      setDuration(totalDuration)
    })

    // 播放结束 → 自动切歌
    engine.onEnded(() => {
      const mode = usePlayerStore.getState().playMode
      if (mode === 'loop') {
        engine.currentTime = 0
        engine.play()
      } else {
        usePlayerStore.getState().nextTrack()
      }
    })
  }, [getEngine])

  // ---------------------------------------------------------------------------
  // currentTrack 变化 → 加载并播放
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!currentTrack) return
    const engine = getEngine()

    const url = window.electronAPI.getAudioUrl(currentTrack.filePath)
    engine.load(url)
    engine.play().then(() => setPlaying(true)).catch(() => setPlaying(false))

    // 重置进度条
    if (progressFillRef.current) progressFillRef.current.style.width = '0%'
    if (currentTimeRef.current) currentTimeRef.current.textContent = '00:00'
    setDuration(0)
  }, [currentTrack, getEngine, setPlaying])

  // ---------------------------------------------------------------------------
  // 音量同步
  // ---------------------------------------------------------------------------

  useEffect(() => {
    getEngine().setVolume(volume)
  }, [volume, getEngine])

  // ---------------------------------------------------------------------------
  // 播放/暂停
  // ---------------------------------------------------------------------------

  const handlePlayPause = useCallback(() => {
    if (!currentTrack) return
    const engine = getEngine()
    if (isPlaying) {
      engine.pause()
      setPlaying(false)
    } else {
      engine.play().then(() => setPlaying(true))
    }
  }, [currentTrack, isPlaying, getEngine, setPlaying])

  // ---------------------------------------------------------------------------
  // 进度条拖拽
  // ---------------------------------------------------------------------------

  const handleProgressMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (duration <= 0) return
      const engine = getEngine()
      const rect = progressRef.current!.getBoundingClientRect()
      isDragging.current = true

      const seek = (clientX: number) => {
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
        const pct = x / rect.width
        if (progressFillRef.current) progressFillRef.current.style.width = `${pct * 100}%`
        if (currentTimeRef.current) currentTimeRef.current.textContent = formatTime(pct * duration)
        return pct * duration
      }

      seek(e.clientX)

      const onMove = (ev: MouseEvent) => seek(ev.clientX)
      const onUp = (ev: MouseEvent) => {
        engine.currentTime = seek(ev.clientX)
        isDragging.current = false
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [duration, getEngine],
  )

  // ---------------------------------------------------------------------------
  // 音量
  // ---------------------------------------------------------------------------

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const vol = parseFloat(e.target.value)
      setVolume(vol)
      if (vol > 0) setIsMuted(false)
    },
    [setVolume],
  )

  const handleMuteToggle = useCallback(() => {
    if (isMuted) {
      setVolume(prevVolume)
      setIsMuted(false)
    } else {
      setPrevVolume(volume)
      setVolume(0)
      setIsMuted(true)
    }
  }, [isMuted, volume, prevVolume, setVolume])

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------

  return (
    <div className="player-bar">
      {/* 左侧：歌曲信息 */}
      <div className="player-bar__info">
        <div className="player-bar__cover">
          {currentTrack?.coverPath ? (
            <img
              src={window.electronAPI.getAudioUrl(currentTrack.coverPath)}
              alt="封面"
              className="player-bar__cover-img"
            />
          ) : null}
        </div>
        <div className="player-bar__meta">
          <span className="player-bar__title">{currentTrack?.title || '未在播放'}</span>
          <span className="player-bar__artist">{currentTrack?.artist || '-'}</span>
        </div>
      </div>

      {/* 中间：控制按钮 + 进度条 */}
      <div className="player-bar__controls">
        <div className="player-bar__buttons">
          <button
            className="player-bar__btn player-bar__btn--skip"
            onClick={prevTrack}
            disabled={!currentTrack}
            title="上一首"
          >
            ⏮
          </button>
          <button
            className="player-bar__btn player-bar__btn--play"
            onClick={handlePlayPause}
            disabled={!currentTrack}
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            className="player-bar__btn player-bar__btn--skip"
            onClick={nextTrack}
            disabled={!currentTrack}
            title="下一首"
          >
            ⏭
          </button>
        </div>

        <div className="player-bar__progress-row">
          <span className="player-bar__time" ref={currentTimeRef}>00:00</span>
          <div
            className="player-bar__progress"
            ref={progressRef}
            onMouseDown={handleProgressMouseDown}
          >
            <div className="player-bar__progress-fill" ref={progressFillRef} />
            <div className="player-bar__progress-thumb" />
          </div>
          <span className="player-bar__time">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 右侧：播放模式 + 音量 */}
      <div className="player-bar__extra">
        <button
          className="player-bar__btn player-bar__btn--mode"
          onClick={() => setPlayMode(getNextPlayMode(playMode))}
          title={PLAY_MODE_LABELS[playMode]}
        >
          {PLAY_MODE_ICONS[playMode]}
        </button>
        <button
          className="player-bar__btn player-bar__btn--volume-icon"
          onClick={handleMuteToggle}
          title={isMuted ? '取消静音' : '静音'}
        >
          {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
        </button>
        <input
          type="range"
          className="player-bar__volume-slider"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={handleVolumeChange}
          title={`音量 ${Math.round(volume * 100)}%`}
        />
      </div>
    </div>
  )
}

export default PlayerBar
