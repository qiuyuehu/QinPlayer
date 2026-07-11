import { formatTime } from '../utils/formatTime'
// =============================================================================
// QinPlayer — 迷你播放器
// =============================================================================
// 职责：在固定 400×150 壳层中编排歌曲、歌词和队列三种视图
// 布局：上方视图内容 + 下方公共控制栏，关闭按钮固定在右上角
// 交互：窗口可拖拽、进度条可拖拽、音量点击静音、视图直接切换
// =============================================================================

import { useRef, useCallback, useState, useEffect } from 'react'
import { usePlayerStore, togglePlayMode } from '../stores/playerStore'
import { useUIStore } from '../stores/uiStore'
import { useTrackLyrics } from '../hooks/useTrackLyrics'
import { useDocumentMouseDrag } from '../hooks/useDocumentMouseDrag'
import { useRafLoop } from '../hooks/useRafLoop'
import { currentTimeRef } from '../utils/currentTimeRef'
import { findCurrentLyricIndex } from '../utils/lrcParser'
import MiniLyricsView from './MiniLyricsView'
import MiniQueueViewContainer from './MiniQueueViewContainer'
import {
  IconPlay, IconPause, IconPrev, IconNext,
  IconVolumeHigh, IconVolumeMuted,
  IconClose, IconExpand, IconMusic, IconLyrics, IconList,
  IconRepeat, IconRepeatOne, IconShuffle,
  IconPin,
} from './Icons'
import type { LyricLine } from '../types'

type MiniView = 'default' | 'lyrics' | 'queue'

function MiniPlayer() {
  // --- 播放状态 ---
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const lyricOffset = usePlayerStore((s) => s.lyricOffset)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const setSeekTime = usePlayerStore((s) => s.setSeekTime)
  const nextTrack = usePlayerStore((s) => s.nextTrack)
  const prevTrack = usePlayerStore((s) => s.prevTrack)
  const playMode = usePlayerStore((s) => s.playMode)
  const setPlayMode = usePlayerStore((s) => s.setPlayMode)

  // --- UI 状态 ---
  const isMiniMode = useUIStore((s) => s.isMiniMode)
  const setActiveNav = useUIStore((s) => s.setActiveNav)
  const setMiniMode = useUIStore((s) => s.setMiniMode)
  const featureFlags = useUIStore((s) => s.featureFlags)
  const [miniView, setMiniView] = useState<MiniView>('default')

  // Hook 必须无条件调用；功能关闭时传 null，避免后台读取歌词。
  const lyricsEnabled = featureFlags.playback
    && featureFlags.miniMode
    && featureFlags.lyrics
    && isMiniMode
  const lyrics = useTrackLyrics(lyricsEnabled ? currentTrack : null)
  const [lyricsCurrentIndex, setLyricsCurrentIndex] = useState(-1)
  const lyricsRef = useRef<LyricLine[]>(lyrics)
  const lastLyricsIndexRef = useRef(-1)
  const lyricOffsetRef = useRef(lyricOffset)
  const miniViewRef = useRef<MiniView>(miniView)

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

  // --- 音量状态（点击静音/取消静音） ---
  const [isMuted, setIsMuted] = useState(false)
  const prevVolumeRef = useRef(1)

  // --- 置顶状态 ---
  const [isPinned, setIsPinned] = useState(false)

  useEffect(() => {
    lyricsRef.current = lyrics
    lastLyricsIndexRef.current = -1
    if (lyrics.length === 0) setLyricsCurrentIndex(-1)
  }, [lyrics])

  useEffect(() => {
    lyricOffsetRef.current = lyricOffset
  }, [lyricOffset])

  useEffect(() => {
    miniViewRef.current = miniView
  }, [miniView])

  useEffect(() => {
    lastLyricsIndexRef.current = -1
    setLyricsCurrentIndex(-1)
  }, [currentTrack?.id, currentTrack?.filePath])

  // 当前视图入口被关闭时，立即回退到歌曲视图。
  useEffect(() => {
    if (miniView === 'lyrics' && !featureFlags.lyrics) {
      setMiniView('default')
    } else if (miniView === 'queue' && !featureFlags.queuePanel) {
      setMiniView('default')
    }
  }, [miniView, featureFlags.lyrics, featureFlags.queuePanel])

  // ---------------------------------------------------------------------------
  // 关闭迷你模式 → 返回本地音乐页
  // ---------------------------------------------------------------------------
  const handleClose = useCallback(() => {
    if (isPinned) window.electronAPI.setAlwaysOnTop(false)
    setIsPinned(false)
    setMiniMode(false)
    setActiveNav('local')
  }, [setMiniMode, setActiveNav, isPinned])

  // ---------------------------------------------------------------------------
  // 展开 → 恢复主窗口并保留当前导航
  // ---------------------------------------------------------------------------
  const handleExpand = useCallback(() => {
    if (isPinned) window.electronAPI.setAlwaysOnTop(false)
    setIsPinned(false)
    setMiniMode(false)
  }, [setMiniMode, isPinned])

  // --- 播放方式（内联常量，与 PlayerBar 保持一致） ---
  const PLAY_MODE_ICON = {
    sequential: IconRepeat,
    loop: IconRepeatOne,
    shuffle: IconShuffle,
  } as const

  const PLAY_MODE_LABELS = {
    sequential: '顺序播放',
    loop: '单曲循环',
    shuffle: '随机播放',
  } as const

  const handleToggleMode = useCallback(() => {
    setPlayMode(togglePlayMode(playMode))
  }, [playMode, setPlayMode])

  const handlePlayPause = useCallback(() => {
    setPlaying(!isPlaying)
  }, [isPlaying, setPlaying])

  const handleVolumeClick = useCallback(() => {
    if (isMuted) {
      setVolume(prevVolumeRef.current)
      setIsMuted(false)
    } else {
      prevVolumeRef.current = volume
      setVolume(0)
      setIsMuted(true)
    }
  }, [isMuted, volume, setVolume])

  // ---------------------------------------------------------------------------
  // 置顶切换
  // ---------------------------------------------------------------------------
  const togglePinned = useCallback(() => {
    setIsPinned(prev => {
      const next = !prev
      window.electronAPI.setAlwaysOnTop(next)
      return next
    })
  }, [])

  // ---------------------------------------------------------------------------
  // 进度条拖拽逻辑
  // ---------------------------------------------------------------------------
  const updatePlaybackView = useCallback((time: number) => {
    const pct = duration > 0 ? (time / duration) * 100 : 0
    if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`
    if (progressThumbRef.current) progressThumbRef.current.style.left = `${pct}%`
    if (currentTimeTextRef.current) currentTimeTextRef.current.textContent = formatTime(time)

    if (miniViewRef.current === 'lyrics') {
      const index = findCurrentLyricIndex(
        lyricsRef.current,
        time + lyricOffsetRef.current,
      )
      if (index !== lastLyricsIndexRef.current) {
        lastLyricsIndexRef.current = index
        setLyricsCurrentIndex(index)
      }
    }
  }, [duration])

  const updateDragTime = useCallback((event: MouseEvent) => {
    if (!progressRef.current || duration <= 0) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    dragTimeRef.current = ratio * duration
  }, [duration])

  const resetProgressDrag = useCallback(() => {
    isDraggingRef.current = false
    dragTimeRef.current = null
    setIsProgressDragging(false)
  }, [])

  const handleProgressMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    resetProgressDrag()
    cancelDocumentMouseDrag()
    isDraggingRef.current = true
    setIsProgressDragging(true)
    updateDragTime(event as unknown as MouseEvent)

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

  useEffect(() => {
    if (featureFlags.playback && featureFlags.miniMode && isMiniMode) return
    resetProgressDrag()
    cancelDocumentMouseDrag()
  }, [
    cancelDocumentMouseDrag,
    featureFlags.miniMode,
    featureFlags.playback,
    isMiniMode,
    resetProgressDrag,
  ])

  // 一个按需 RAF 同时维护默认视图进度和歌词视图索引。
  const renderPlaybackFrame = useCallback(() => {
    const time = isDraggingRef.current
      ? (dragTimeRef.current ?? 0)
      : currentTimeRef.current
    updatePlaybackView(time)
  }, [updatePlaybackView])

  const miniPlayerVisible = featureFlags.playback && featureFlags.miniMode && isMiniMode
  useRafLoop(miniPlayerVisible && (isPlaying || isProgressDragging), renderPlaybackFrame)

  useEffect(() => {
    if (!miniPlayerVisible || isPlaying || isProgressDragging) return
    renderPlaybackFrame()
  }, [currentTrack?.id, duration, lyricOffset, lyrics, miniPlayerVisible, miniView, isPlaying, isProgressDragging, renderPlaybackFrame])

  if (!featureFlags.playback || !featureFlags.miniMode || !isMiniMode) return null

  const ModeIcon = PLAY_MODE_ICON[playMode]
  const coverUrl = currentTrack?.coverPath
    ? window.electronAPI.getCoverUrl(currentTrack.coverPath)
    : null

  const defaultView = (
    <div className="mini-player__default-view">
      <div className="mini-player__header">
        <div className="mini-player__cover">
          {coverUrl ? (
            <img src={coverUrl} alt={`${currentTrack?.title ?? '歌曲'} 封面`} />
          ) : (
            <div className="mini-player__cover-placeholder" aria-hidden="true">
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
      </div>

      <div className="mini-player__progress-row">
        <span className="mini-player__time" ref={currentTimeTextRef}>0:00</span>
        <div
          className="mini-player__progress-bar"
          ref={progressRef}
          onMouseDown={handleProgressMouseDown}
        >
          <div className="mini-player__progress-fill" ref={progressFillRef} />
          <div className="mini-player__progress-thumb" ref={progressThumbRef} />
        </div>
        <span className="mini-player__time">{formatTime(duration)}</span>
      </div>
    </div>
  )

  return (
    <div className="mini-player">
      <button
        type="button"
        className="mini-player__close-btn"
        onClick={handleClose}
        aria-label="关闭"
        title="关闭"
      >
        <IconClose width={14} height={14} />
      </button>

      <div className="mini-player__content">
        {miniView === 'lyrics' && featureFlags.lyrics ? (
          <MiniLyricsView
            currentTrack={currentTrack}
            lyrics={lyrics}
            currentIndex={lyricsCurrentIndex}
          />
        ) : miniView === 'queue' && featureFlags.queuePanel ? (
          <MiniQueueViewContainer />
        ) : defaultView}
      </div>

      <div className="mini-player__toolbar mini-player__controls">
        <button
          type="button"
          className="mini-player__btn"
          onClick={handleVolumeClick}
          aria-label={isMuted ? '取消静音' : '静音'}
          title={isMuted ? '取消静音' : '静音'}
        >
          {isMuted
            ? <IconVolumeMuted width={14} height={14} />
            : <IconVolumeHigh width={14} height={14} />
          }
        </button>

        <button type="button" className="mini-player__btn" onClick={prevTrack} title="上一首">
          <IconPrev width={16} height={16} />
        </button>

        <button
          type="button"
          className="mini-player__btn mini-player__btn--play"
          onClick={handlePlayPause}
          title={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying
            ? <IconPause width={18} height={18} />
            : <IconPlay width={18} height={18} />
          }
        </button>

        <button type="button" className="mini-player__btn" onClick={nextTrack} title="下一首">
          <IconNext width={16} height={16} />
        </button>

        <div className="mini-player__view-switcher" role="group" aria-label="迷你播放器视图">
          <button
            type="button"
            className={`mini-player__view-btn ${miniView === 'default' ? 'mini-player__view-btn--active' : ''}`}
            onClick={() => setMiniView('default')}
            aria-label="歌曲视图"
            aria-pressed={miniView === 'default'}
            title="歌曲"
          >
            <IconMusic width={14} height={14} />
          </button>
          {featureFlags.lyrics && (
            <button
              type="button"
              className={`mini-player__view-btn ${miniView === 'lyrics' ? 'mini-player__view-btn--active' : ''}`}
              onClick={() => setMiniView('lyrics')}
              aria-label="歌词视图"
              aria-pressed={miniView === 'lyrics'}
              title="歌词"
            >
              <IconLyrics width={14} height={14} />
            </button>
          )}
          {featureFlags.queuePanel && (
            <button
              type="button"
              className={`mini-player__view-btn ${miniView === 'queue' ? 'mini-player__view-btn--active' : ''}`}
              onClick={() => setMiniView('queue')}
              aria-label="队列视图"
              aria-pressed={miniView === 'queue'}
              title="队列"
            >
              <IconList width={14} height={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`mini-player__btn ${isPinned ? 'mini-player__btn--pinned' : ''}`}
          onClick={togglePinned}
          aria-label={isPinned ? '取消置顶' : '置顶'}
          title={isPinned ? '取消置顶' : '置顶'}
        >
          <IconPin width={14} height={14} />
        </button>

        <button
          type="button"
          className="mini-player__btn"
          onClick={handleExpand}
          aria-label="展开"
          title="展开"
        >
          <IconExpand width={14} height={14} />
        </button>

        <button
          type="button"
          className="mini-player__btn mini-player__btn--mode"
          onClick={handleToggleMode}
          aria-label={PLAY_MODE_LABELS[playMode]}
          title={PLAY_MODE_LABELS[playMode]}
        >
          <ModeIcon width={14} height={14} />
        </button>
      </div>
    </div>
  )
}

export default MiniPlayer
