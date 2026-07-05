import { formatTime } from "../utils/formatTime"
// =============================================================================
// QinPlayer — 底部播放控制条
// =============================================================================
// 职责：显示歌曲信息、播放控制按钮、进度条、音量
// 设计：只读/写 Zustand 状态，不直接操作 AudioEngine（由 useAudioSync 统一驱动）
// =============================================================================

import { useRef, useCallback, useState, useEffect } from 'react'   // React Hooks
import { usePlayerStore, togglePlayMode } from '../stores/playerStore'  // Zustand 状态
import { useUIStore } from '../stores/uiStore'  // UI 状态（导航切换、迷你模式）
import { currentTimeRef } from '../utils/currentTimeRef'  // 共享播放时间 ref
import type { PlayMode } from '../types'  // 播放模式类型
import PlaylistPanel from './PlaylistPanel'
import {
  IconPlay, IconPause, IconPrev, IconNext,
  IconVolumeHigh, IconVolumeLow, IconVolumeMuted,
  IconRepeat, IconRepeatOne, IconShuffle,
  IconList, IconMinimize,
} from './Icons'  // SVG 图标组件

// 播放模式对应的图标组件
const PLAY_MODE_ICON: Record<PlayMode, React.ComponentType<{ width?: number; height?: number }>> = {
  sequential: IconRepeat,
  loop: IconRepeatOne,
  shuffle: IconShuffle,
}

// 播放模式 tooltip 文字
const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  sequential: '顺序播放',
  loop: '单曲循环',
  shuffle: '随机播放',
}

// PlayerBar — 底部播放控制条，播放/暂停/上下首/进度条/音量/播放模式
function PlayerBar() {
  // --- Zustand store（通过 useAudioSync hook 统一驱动 AudioEngine） ---
  // 播放状态：isPlaying 控制播放/暂停，currentTrack 当前歌曲
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const playMode = usePlayerStore((s) => s.playMode)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const setPlayMode = usePlayerStore((s) => s.setPlayMode)
  const setSeekTime = usePlayerStore((s) => s.setSeekTime)
  const nextTrack = usePlayerStore((s) => s.nextTrack)
  const prevTrack = usePlayerStore((s) => s.prevTrack)

  // 导航切换（点击封面打开歌词页面）和迷你模式
  const setActiveNav = useUIStore((s) => s.setActiveNav)
  const setMiniMode = useUIStore((s) => s.setMiniMode)
  const featureFlags = useUIStore((s) => s.featureFlags)

  // --- 进度条拖拽（三阶段：mousedown → mousemove → mouseup） ---
  // mousedown 时注册 mousemove/mouseup 全局事件，mouseup 时移除
  const progressRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)  // 是否正在拖拽（ref 避免闭包问题）
  const dragTimeRef = useRef<number | null>(null)  // 拖拽中的预览时间（RAF 直接读取）

  // --- 进度条 DOM 元素 ref（RAF 直接操作，不触发 re-render） ---
  const progressFillRef = useRef<HTMLDivElement>(null)
  const progressThumbRef = useRef<HTMLDivElement>(null)
  const currentTimeTextRef = useRef<HTMLSpanElement>(null)

  // --- 音量条拖拽（与进度条同理，但不需要 ref，因为没有延迟回调） ---
  // 拖拽音量条 → 实时更新 volume 状态 → useAudioSync 立即驱动 AudioEngine
  const volumeBarRef = useRef<HTMLDivElement>(null)
  const [volumeHover, setVolumeHover] = useState(false)  // 音量条 hover 状态（显示气泡）
  const [showPlaylistPanel, setShowPlaylistPanel] = useState(false)

  // --- 播放/暂停切换（只改状态，useAudioSync 会驱动 AudioEngine） ---
  // 切换 isPlaying 状态 → useAudioSync 检测到变化 → 调用 engine.play()/pause()
  const handlePlayPause = useCallback(() => {
    setPlaying(!isPlaying)  // 取反：播放→暂停，暂停→播放
  }, [isPlaying, setPlaying])

  // --- 播放按钮脉冲动画（切换时触发 scale 动画） ---
  const [playPulse, setPlayPulse] = useState(false)
  const prevPlayingRef = useRef(isPlaying)

  useEffect(() => {
    if (prevPlayingRef.current !== isPlaying) {
      prevPlayingRef.current = isPlaying
      setPlayPulse(true)
      const timer = setTimeout(() => setPlayPulse(false), 200)
      return () => clearTimeout(timer)
    }
  }, [isPlaying])

  // --- 上一首/下一首（切歌逻辑在 playerStore.nextTrack/prevTrack） ---
  // 切歌后 playerStore 自动更新 currentTrack → useAudioSync 检测到变化 → 加载新歌曲
  const handlePrev = useCallback(() => {
    prevTrack()  // playerStore 内部处理顺序/随机/循环模式
  }, [prevTrack])

  const handleNext = useCallback(() => {
    nextTrack()
  }, [nextTrack])

  // --- 播放模式切换（顺序 → 单曲循环 → 随机，三态循环） ---
  const handleToggleMode = useCallback(() => {
    const nextMode = togglePlayMode(playMode)  // 按顺序取下一个模式
    setPlayMode(nextMode)
  }, [playMode, setPlayMode])

  // ------------------------------------------------------------------
  // 进度条：拖拽交互（mousedown 注册事件，mousemove 更新预览，mouseup 发送 seek）
  // ------------------------------------------------------------------
  // 用 ref 存储最新拖拽时间，避免 mouseup 闭包捕获旧值
  const updateDragTime = useCallback((e: MouseEvent) => {
    if (!progressRef.current || duration <= 0) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = ratio * duration
    dragTimeRef.current = time  // RAF 循环直接读取，不触发 re-render
  }, [duration])

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true
    updateDragTime(e as unknown as MouseEvent)

    const handleMouseMove = (ev: MouseEvent) => {
      updateDragTime(ev)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      // 从 ref 读取最新拖拽时间（闭包里的 dragTime 是旧值）
      const seekTo = dragTimeRef.current
      if (seekTo !== null) {
        setSeekTime(seekTo)
      }
      dragTimeRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [updateDragTime, setSeekTime])

  // ------------------------------------------------------------------
  // 音量：拖拽交互（与进度条同理，但不需要 ref，因为没有延迟回调）
  // ------------------------------------------------------------------
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


  // ---------------------------------------------------------------------------
  // RAF 循环：直接操作进度条 DOM，不触发 React re-render
  // ---------------------------------------------------------------------------
  // 播放时每帧更新进度条位置和时间文字，拖拽时显示拖拽预览时间
  useEffect(() => {
    let rafId: number
    const update = () => {
      // 拖拽中用拖拽时间，否则用共享 ref 的播放时间
      const time = isDraggingRef.current
        ? (dragTimeRef.current ?? 0)
        : currentTimeRef.current
      const pct = duration > 0 ? (time / duration) * 100 : 0

      // 直接操作 DOM，不触发 re-render
      if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`
      if (progressThumbRef.current) progressThumbRef.current.style.left = `${pct}%`
      if (currentTimeTextRef.current) currentTimeTextRef.current.textContent = formatTime(time)

      rafId = requestAnimationFrame(update)
    }
    rafId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafId)
  }, [duration])

  // ---------------------------------------------------------------------------
  // 渲染（三栏布局：左侧歌曲信息 | 中间控制+进度 | 右侧模式+音量）
  // ---------------------------------------------------------------------------
  // 进度条由 RAF 循环直接操作 DOM，不依赖 React state

  // 音量图标：根据音量大小选择
  const VolumeIcon = volume === 0 ? IconVolumeMuted : volume < 0.5 ? IconVolumeLow : IconVolumeHigh
  // 播放模式图标
  const ModeIcon = PLAY_MODE_ICON[playMode]

  if (!featureFlags.playback) return null

  return (
    <>
    <div className="player-bar">
      {/* 左侧：封面缩略图 + 歌名 + 歌手 */}
      <div className="player-bar__info">
        <div
          className="player-bar__cover player-bar__cover--clickable"
          onClick={() => {
            if (featureFlags.lyrics) setActiveNav('lyrics')
          }}
          title={featureFlags.lyrics ? '查看歌词' : undefined}
        >
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

      {/* 中间：上一首/播放/下一首 + 进度条（可拖拽） */}
      <div className="player-bar__controls">
        <div className="player-bar__buttons">
          <button className="player-bar__btn" onClick={handlePrev} title="上一首">
            <IconPrev width={22} height={22} />
          </button>
          <button
            className={`player-bar__btn player-bar__play-btn ${playPulse ? 'player-bar__play-btn--pulse' : ''}`}
            onClick={handlePlayPause}
            title={isPlaying ? '暂停' : '播放'}
          >
            <span className={`player-bar__play-icon ${isPlaying ? 'player-bar__play-icon--hidden' : ''}`}>
              <IconPlay width={22} height={22} />
            </span>
            <span className={`player-bar__play-icon ${isPlaying ? '' : 'player-bar__play-icon--hidden'}`}>
              <IconPause width={22} height={22} />
            </span>
          </button>
          <button className="player-bar__btn" onClick={handleNext} title="下一首">
            <IconNext width={22} height={22} />
          </button>
        </div>
        <div className="player-bar__progress-row">
          <span className="player-bar__time" ref={currentTimeTextRef}>0:00</span>
          <div
            className="player-bar__progress-bar"
            ref={progressRef}
            onMouseDown={handleProgressMouseDown}
          >
            <div
              className="player-bar__progress-fill"
              ref={progressFillRef}
            />
            <div
              className="player-bar__progress-thumb"
              ref={progressThumbRef}
            />
          </div>
          <span className="player-bar__time">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 右侧：播放模式切换 + 音量滑块 */}
      <div className="player-bar__extra">
        <button
          className="player-bar__btn"
          onClick={handleToggleMode}
          title={PLAY_MODE_LABELS[playMode]}
        >
          <ModeIcon width={18} height={18} />
        </button>
        <div className="player-bar__volume-row">
          <span className="player-bar__volume-icon">
            <VolumeIcon width={18} height={18} />
          </span>
          <div
            className="player-bar__volume-bar"
            ref={volumeBarRef}
            onMouseDown={handleVolumeMouseDown}
            onMouseEnter={() => setVolumeHover(true)}
            onMouseLeave={() => setVolumeHover(false)}
          >
            <div
              className="player-bar__volume-fill"
              style={{ width: `${volume * 100}%` }}
            />
            <div
              className="player-bar__volume-thumb"
              style={{ left: `${volume * 100}%` }}
            />
            {/* 音量数值气泡（hover 时显示） */}
            {volumeHover && (
              <div
                className="player-bar__volume-tooltip"
                style={{ left: `${volume * 100}%` }}
              >
                {Math.round(volume * 100)}
              </div>
            )}
          </div>
        </div>
        {/* 迷你模式按钮 */}
        {featureFlags.miniMode && featureFlags.tray && (
          <button
            className="player-bar__btn player-bar__btn--mini"
            onClick={() => setMiniMode(true)}
            title="迷你模式"
          >
            <IconMinimize width={18} height={18} />
          </button>
        )}
        {/* 播放列表按钮：打开当前播放队列面板 */}
        {featureFlags.queuePanel && (
          <button
            className="player-bar__btn player-bar__btn--queue"
            onClick={() => setShowPlaylistPanel((visible) => !visible)}
            title="播放列表"
          >
            <IconList width={18} height={18} />
          </button>
        )}
      </div>
    </div>
    {showPlaylistPanel && featureFlags.queuePanel && (
      <PlaylistPanel onClose={() => setShowPlaylistPanel(false)} />
    )}
    </>
  )
}

export default PlayerBar
