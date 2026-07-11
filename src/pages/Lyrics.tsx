import { formatTime } from "../utils/formatTime"
// =============================================================================
// QinPlayer — 歌词界面页面（沉浸式）
// =============================================================================
// 职责：全屏沉浸式歌词展示
// 设计要点：
//   - 隐藏导航栏和播放栏，最大化歌词显示区域
//   - 左侧：大封面 + 歌曲信息 + 播放控制（播放/暂停/上下首/进度条）
//   - 右侧：歌词逐行滚动（GPU 加速）
//   - 进度条用 RAF + ref 直接操作 DOM，不触发 re-render
//   - 歌词面板用 10fps 低频更新（足够歌词滚动，避免高频 re-render）
//   - 按 Esc 返回主界面
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePlayerStore, togglePlayMode } from '../stores/playerStore'
import { useUIStore } from '../stores/uiStore'
import { currentTimeRef } from '../utils/currentTimeRef'
import LyricsPanel from '../components/LyricsPanel'
import { useTrackLyrics } from '../hooks/useTrackLyrics'
import { useDocumentMouseDrag } from '../hooks/useDocumentMouseDrag'
import { useRafLoop } from '../hooks/useRafLoop'
import { findCurrentLyricIndex } from '../utils/lrcParser'
import { extractMainColor } from '../utils/colorExtract'
import type { LyricLine } from '../types'
import {
  IconPlay, IconPause, IconPrev, IconNext,
  IconExpand, IconCompress, IconPin, IconChevronDown,
  IconVolumeHigh, IconVolumeLow, IconVolumeMuted,
  IconRepeat, IconRepeatOne, IconShuffle,
} from '../components/Icons'

// Lyrics — 歌词全屏界面，左右分屏（封面+控制 / 歌词滚动）+ 全屏切换
function Lyrics() {
  // --- 播放状态 ---
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const duration = usePlayerStore((s) => s.duration)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const playMode = usePlayerStore((s) => s.playMode)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const setPlayMode = usePlayerStore((s) => s.setPlayMode)
  const setSeekTime = usePlayerStore((s) => s.setSeekTime)
  const nextTrack = usePlayerStore((s) => s.nextTrack)
  const prevTrack = usePlayerStore((s) => s.prevTrack)
  const lyricOffset = usePlayerStore((s) => s.lyricOffset)

  // --- 导航状态 ---
  const setActiveNav = useUIStore((s) => s.setActiveNav)
  const activeNav = useUIStore((s) => s.activeNav)
  const previousNav = useUIStore((s) => s.previousNav)
  const featureFlags = useUIStore((s) => s.featureFlags)

  // --- 歌词状态 ---
  const lyrics = useTrackLyrics(currentTrack)
  const [bgColor, setBgColor] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  // --- 进度条拖拽 ---
  const progressRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragTimeRef = useRef<number | null>(null)
  const [isProgressDragging, setIsProgressDragging] = useState(false)
  const { startDocumentMouseDrag, cancelDocumentMouseDrag } = useDocumentMouseDrag()

  // --- 进度条 DOM 元素 ref（RAF 直接操作，不触发 re-render） ---
  const progressFillRef = useRef<HTMLDivElement>(null)
  const progressThumbRef = useRef<HTMLDivElement>(null)
  const currentTimeTextRef = useRef<HTMLSpanElement>(null)
  const volumeRowRef = useRef<HTMLDivElement>(null)
  const volumeBarRef = useRef<HTMLDivElement>(null)
  const [showVolume, setShowVolume] = useState(false)

  // --- 歌词面板用的 currentIndex（只在行索引变化时才更新，避免高频 re-render） ---
  const [lyricsCurrentIndex, setLyricsCurrentIndex] = useState(-1)
  const lyricsRef = useRef<LyricLine[]>([])
  const lastLyricsIndexRef = useRef(-1)
  const colorRequestRef = useRef(0)
  const lyricOffsetRef = useRef(0)

  // 同步 lyrics 和 lyricOffset 到 ref（供 RAF 使用）
  useEffect(() => {
    lyricsRef.current = lyrics
    lastLyricsIndexRef.current = -1
    if (lyrics.length === 0) setLyricsCurrentIndex(-1)
  }, [lyrics])
  useEffect(() => {
    lastLyricsIndexRef.current = -1
    setLyricsCurrentIndex(-1)
  }, [currentTrack?.id, currentTrack?.filePath])
  useEffect(() => { lyricOffsetRef.current = lyricOffset }, [lyricOffset])

  // ---------------------------------------------------------------------------
  // 按 Esc 返回主界面
  // ---------------------------------------------------------------------------
  const leaveLyrics = useCallback(() => {
    window.electronAPI.setAlwaysOnTop(false)
    setIsPinned(false)
    // 恢复进入歌词前的页面，兜底 'local'
    setActiveNav(previousNav || 'local')
  }, [setActiveNav, previousNav])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        leaveLyrics()  // 返回本地音乐页面
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [leaveLyrics])

  // 歌词页置顶只在当前页面有效，离开页面时自动取消。
  useEffect(() => {
    return () => {
      window.electronAPI.setAlwaysOnTop(false)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // 全屏切换
  // ---------------------------------------------------------------------------
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  const togglePinned = useCallback(() => {
    setIsPinned(prev => {
      const next = !prev
      window.electronAPI.setAlwaysOnTop(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!showVolume) return

    const handleClickOutside = (e: MouseEvent) => {
      if (volumeRowRef.current && !volumeRowRef.current.contains(e.target as Node)) {
        setShowVolume(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showVolume])

  // 监听全屏状态变化（F11 / Esc 退出时同步状态）
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  // ---------------------------------------------------------------------------
  // 切歌时提取封面主色；歌词读取由 useTrackLyrics 统一负责。
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const requestId = ++colorRequestRef.current
    let active = true

    if (!currentTrack) {
      setBgColor('')
      return () => {
        active = false
        if (colorRequestRef.current === requestId) colorRequestRef.current++
      }
    }

    // 提取封面主色作为背景（⚠️ 暗礁 2：50x50 Canvas 采样）
    if (currentTrack.coverPath) {
      const coverUrl = window.electronAPI.getCoverUrl(currentTrack.coverPath)
      extractMainColor(coverUrl).then((color) => {
        if (!active || requestId !== colorRequestRef.current) return
        setBgColor(color)
      })
    } else {
      setBgColor('')
    }

    return () => {
      active = false
      if (colorRequestRef.current === requestId) colorRequestRef.current++
    }
  }, [currentTrack?.id, currentTrack?.coverPath])

  // ---------------------------------------------------------------------------
  // 进度条拖拽逻辑
  // ---------------------------------------------------------------------------
  const updatePlaybackView = useCallback((time: number) => {
    const pct = duration > 0 ? (time / duration) * 100 : 0
    if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`
    if (progressThumbRef.current) progressThumbRef.current.style.left = `${pct}%`
    if (currentTimeTextRef.current) currentTimeTextRef.current.textContent = formatTime(time)

    const index = findCurrentLyricIndex(lyricsRef.current, time + lyricOffsetRef.current)
    if (index !== lastLyricsIndexRef.current) {
      lastLyricsIndexRef.current = index
      setLyricsCurrentIndex(index)
    }
  }, [duration])

  const updateDragTime = useCallback((e: MouseEvent) => {
    if (!progressRef.current || duration <= 0) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = ratio * duration
    dragTimeRef.current = time
  }, [duration])

  const resetProgressDrag = useCallback(() => {
    isDraggingRef.current = false
    dragTimeRef.current = null
    setIsProgressDragging(false)
  }, [])

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    resetProgressDrag()
    cancelDocumentMouseDrag()
    isDraggingRef.current = true
    setIsProgressDragging(true)
    updateDragTime(e as unknown as MouseEvent)

    startDocumentMouseDrag({
      onMove: updateDragTime,
      onEnd: () => {
        isDraggingRef.current = false
        setIsProgressDragging(false)
        const seekTo = dragTimeRef.current
        if (seekTo !== null) {
          updatePlaybackView(seekTo)
          setSeekTime(seekTo)
        }
        dragTimeRef.current = null
      },
    })
  }, [cancelDocumentMouseDrag, resetProgressDrag, setSeekTime, startDocumentMouseDrag, updateDragTime, updatePlaybackView])

  const updateVolume = useCallback((e: MouseEvent) => {
    if (!volumeBarRef.current) return
    const rect = volumeBarRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
    setVolume(ratio)
  }, [setVolume])

  const handleVolumeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    resetProgressDrag()
    cancelDocumentMouseDrag()
    updateVolume(e.nativeEvent)

    startDocumentMouseDrag({
      onMove: updateVolume,
      onEnd: () => {},
    })
  }, [cancelDocumentMouseDrag, resetProgressDrag, startDocumentMouseDrag, updateVolume])

  useEffect(() => {
    if (featureFlags.playback && featureFlags.lyrics && activeNav === 'lyrics') return
    resetProgressDrag()
    cancelDocumentMouseDrag()
    setShowVolume(false)
  }, [
    activeNav,
    cancelDocumentMouseDrag,
    featureFlags.lyrics,
    featureFlags.playback,
    resetProgressDrag,
  ])

  const handleVolumeBtnClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setShowVolume((visible) => !visible)
  }, [])

  const handleToggleMode = useCallback(() => {
    setPlayMode(togglePlayMode(playMode))
  }, [playMode, setPlayMode])

  const handleLyricLineClick = useCallback((time: number) => {
    updatePlaybackView(time)
    setSeekTime(time)
  }, [setSeekTime, updatePlaybackView])

  // ---------------------------------------------------------------------------
  // 格式化时间
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // RAF 只在播放或拖拽时运行，歌词索引变化时才 re-render。
  // ---------------------------------------------------------------------------
  const renderPlaybackFrame = useCallback(() => {
    const time = isDraggingRef.current
      ? (dragTimeRef.current ?? 0)
      : currentTimeRef.current
    updatePlaybackView(time)
  }, [updatePlaybackView])

  const lyricsVisible = featureFlags.playback
    && featureFlags.lyrics
    && activeNav === 'lyrics'
    && currentTrack !== null
  useRafLoop(lyricsVisible && (isPlaying || isProgressDragging), renderPlaybackFrame)

  useEffect(() => {
    if (!lyricsVisible || isPlaying || isProgressDragging) return
    renderPlaybackFrame()
  }, [currentTrack?.id, duration, lyricOffset, lyrics, lyricsVisible, isPlaying, isProgressDragging, renderPlaybackFrame])

  // ---------------------------------------------------------------------------
  // 无歌曲时显示空状态
  // ---------------------------------------------------------------------------
  if (!currentTrack) {
    return (
      <div className="lyrics-page lyrics-page--empty">
        <p>未在播放</p>
      </div>
    )
  }

  // 获取封面 URL
  const coverUrl = currentTrack.coverPath
    ? window.electronAPI.getCoverUrl(currentTrack.coverPath)
    : null

  // 进度条由 RAF 循环直接操作 DOM，不依赖 React state
  const VolumeIcon = volume === 0 ? IconVolumeMuted : volume < 0.5 ? IconVolumeLow : IconVolumeHigh
  const ModeIcon = playMode === 'loop' ? IconRepeatOne : playMode === 'shuffle' ? IconShuffle : IconRepeat
  const modeTitle = playMode === 'loop' ? '单曲循环' : playMode === 'shuffle' ? '随机播放' : '顺序播放'

  return (
    <div
      className="lyrics-page lyrics-page--immersive"
      style={bgColor ? { background: bgColor } : undefined}
    >
      {/* 顶部拖拽区域 */}
      <div className="lyrics-page__drag-area" />

      {/* 右上角按钮：置顶 + 全屏 + 返回 */}
      <div className="lyrics-page__top-actions">
        <button
          className={`lyrics-page__action-btn ${isPinned ? 'lyrics-page__action-btn--active' : ''}`}
          onClick={togglePinned}
          title={isPinned ? '取消置顶' : '置顶'}
        >
          <IconPin width={16} height={16} />
        </button>
        <button
          className="lyrics-page__action-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          {isFullscreen
            ? <IconCompress width={16} height={16} />
            : <IconExpand width={16} height={16} />
          }
        </button>
        <button
          className="lyrics-page__back-btn"
          onClick={leaveLyrics}
          title="返回"
        >
          <IconChevronDown width={18} height={18} />
        </button>
      </div>

      {/* 左侧：封面 + 歌曲信息 + 播放控制 */}
      <div className="lyrics-page__left">
        {/* 封面 */}
        <div className="lyrics-page__cover">
          {coverUrl ? (
            <img src={coverUrl} alt="封面" className="lyrics-page__cover-img" />
          ) : (
            <div className="lyrics-page__cover-placeholder">
              <span>♪</span>
            </div>
          )}
        </div>

        {/* 歌曲信息 */}
        <div className="lyrics-page__info">
          <h2 className="lyrics-page__title">{currentTrack.title || currentTrack.fileName}</h2>
          <p className="lyrics-page__artist">{currentTrack.artist || '未知歌手'}</p>
          {currentTrack.album && (
            <p className="lyrics-page__album">{currentTrack.album}</p>
          )}
        </div>

        {/* 播放控制 */}
        <div className="lyrics-page__controls">
          {/* 小进度条 */}
          <div className="lyrics-page__progress-row">
            <span className="lyrics-page__time" ref={currentTimeTextRef}>0:00</span>
            <div
              className="lyrics-page__progress-bar"
              ref={progressRef}
              onMouseDown={handleProgressMouseDown}
            >
              <div
                className="lyrics-page__progress-fill"
                ref={progressFillRef}
              />
              <div
                className="lyrics-page__progress-thumb"
                ref={progressThumbRef}
              />
            </div>
            <span className="lyrics-page__time">{formatTime(duration)}</span>
          </div>

          <div className="lyrics-page__buttons">
            <button
              className="lyrics-page__btn lyrics-page__mode-btn"
              onClick={handleToggleMode}
              title={modeTitle}
            >
              <ModeIcon width={24} height={24} />
            </button>
            <div className="lyrics-page__transport-buttons">
              <button className="lyrics-page__btn" onClick={prevTrack} title="上一首">
                <IconPrev width={24} height={24} />
              </button>
              <button
                className="lyrics-page__btn"
                onClick={() => setPlaying(!isPlaying)}
                title={isPlaying ? '暂停' : '播放'}
              >
                {isPlaying
                  ? <IconPause width={32} height={32} />
                  : <IconPlay width={32} height={32} />
                }
              </button>
              <button className="lyrics-page__btn" onClick={nextTrack} title="下一首">
                <IconNext width={24} height={24} />
              </button>
            </div>
            <div className="lyrics-page__volume-wrapper" ref={volumeRowRef}>
              <button
                className="lyrics-page__btn"
                onClick={handleVolumeBtnClick}
                title="音量"
                aria-label="音量控制"
                aria-expanded={showVolume}
              >
                <VolumeIcon width={24} height={24} />
              </button>
              {showVolume && (
                <div className="lyrics-page__volume-popup">
                  <div
                    className="lyrics-page__volume-bar"
                    ref={volumeBarRef}
                    onMouseDown={handleVolumeMouseDown}
                  >
                    <div
                      className="lyrics-page__volume-fill"
                      style={{ height: `${volume * 100}%` }}
                    />
                    <div
                      className="lyrics-page__volume-thumb"
                      style={{ bottom: `${volume * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：歌词滚动面板 */}
      <div className="lyrics-page__right">
        <LyricsPanel
          key={currentTrack?.id ?? 'no-track'}
          lyrics={lyrics}
          currentIndex={lyricsCurrentIndex}
          onLineClick={handleLyricLineClick}
          featureFlags={featureFlags}
          layoutRevision={isFullscreen ? 1 : 0}
        />
      </div>
    </div>
  )
}

export default Lyrics
