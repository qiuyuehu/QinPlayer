// =============================================================================
// QinPlayer — 底部播放控制条
// =============================================================================
// 职责：显示歌曲信息、播放控制按钮、进度条、音量
// 设计：只读/写 Zustand 状态，不直接操作 AudioEngine（由 useAudioSync 统一驱动）
// =============================================================================

import { useRef, useCallback, useState } from 'react'   // React Hooks
import { usePlayerStore, togglePlayMode } from '../stores/playerStore'  // Zustand 状态
import { useUIStore } from '../stores/uiStore'  // UI 状态（导航切换、迷你模式）
import type { PlayMode } from '../types'  // 播放模式类型

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
  // --- Zustand store（通过 useAudioSync hook 统一驱动 AudioEngine） ---
  // 播放状态：isPlaying 控制播放/暂停，currentTrack 当前歌曲
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

  // 导航切换（点击封面打开歌词页面）和迷你模式
  const setActiveNav = useUIStore((s) => s.setActiveNav)
  const setMiniMode = useUIStore((s) => s.setMiniMode)

  // --- 进度条拖拽（三阶段：mousedown → mousemove → mouseup） ---
  // mousedown 时注册 mousemove/mouseup 全局事件，mouseup 时移除
  const progressRef = useRef<HTMLDivElement>(null)
  const [dragTime, setDragTime] = useState<number | null>(null)  // 拖拽中的预览时间
  const isDraggingRef = useRef(false)  // 是否正在拖拽（ref 避免闭包问题）
  const dragTimeRef = useRef<number | null>(null)  // 最新拖拽时间（mouseup 回调读取）

  // --- 音量条拖拽（与进度条同理，但不需要 ref，因为没有延迟回调） ---
  // 拖拽音量条 → 实时更新 volume 状态 → useAudioSync 立即驱动 AudioEngine
  const volumeBarRef = useRef<HTMLDivElement>(null)

  // --- 播放/暂停切换（只改状态，useAudioSync 会驱动 AudioEngine） ---
  // 切换 isPlaying 状态 → useAudioSync 检测到变化 → 调用 engine.play()/pause()
  const handlePlayPause = useCallback(() => {
    setPlaying(!isPlaying)  // 取反：播放→暂停，暂停→播放
  }, [isPlaying, setPlaying])

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
    setDragTime(time)
    dragTimeRef.current = time  // 同步更新 ref
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
      setDragTime(null)
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

  /** 格式化秒数为 mm:ss（用于进度条两侧时间显示） */
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ---------------------------------------------------------------------------
  // 渲染（三栏布局：左侧歌曲信息 | 中间控制+进度 | 右侧模式+音量）
  // ---------------------------------------------------------------------------
  // 拖拽中显示拖拽预览时间，否则显示真实播放时间
  const displayTime = dragTime ?? currentTime
  // 进度百分比：拖拽中用预览时间，否则用真实播放时间
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0

  return (
    <div className="player-bar">
      {/* 左侧：封面缩略图 + 歌名 + 歌手 */}
      <div className="player-bar__info">
        <div
          className="player-bar__cover player-bar__cover--clickable"
          onClick={() => setActiveNav('lyrics')}
          title="查看歌词"
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

      {/* 右侧：播放模式切换 + 音量滑块 */}
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
        {/* 汉堡菜单按钮：点击进入歌词界面 */}
        <button
          className="player-bar__btn player-bar__btn--menu"
          onClick={() => setActiveNav('lyrics')}
          title="歌词"
        >
          ☰
        </button>
        {/* 迷你模式按钮 */}
        <button
          className="player-bar__btn player-bar__btn--mini"
          onClick={() => setMiniMode(true)}
          title="迷你模式"
        >
          ⊟
        </button>
      </div>
    </div>
  )
}

export default PlayerBar
