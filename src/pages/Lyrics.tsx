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
import { usePlayerStore } from '../stores/playerStore'
import { useUIStore } from '../stores/uiStore'
import { currentTimeRef } from '../utils/currentTimeRef'
import LyricsPanel from '../components/LyricsPanel'
import { parseLrc } from '../utils/lrcParser'
import { extractMainColor } from '../utils/colorExtract'
import type { LyricLine } from '../types'
import { IconPlay, IconPause, IconPrev, IconNext, IconBack, IconExpand, IconCompress } from '../components/Icons'

// Lyrics — 歌词全屏界面，左右分屏（封面+控制 / 歌词滚动）+ 全屏切换
function Lyrics() {
  // --- 播放状态 ---
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const duration = usePlayerStore((s) => s.duration)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setSeekTime = usePlayerStore((s) => s.setSeekTime)
  const nextTrack = usePlayerStore((s) => s.nextTrack)
  const prevTrack = usePlayerStore((s) => s.prevTrack)
  const lyricOffset = usePlayerStore((s) => s.lyricOffset)

  // --- 导航状态 ---
  const setActiveNav = useUIStore((s) => s.setActiveNav)

  // --- 歌词状态 ---
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [bgColor, setBgColor] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // --- 进度条拖拽 ---
  const progressRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragTimeRef = useRef<number | null>(null)

  // --- 进度条 DOM 元素 ref（RAF 直接操作，不触发 re-render） ---
  const progressFillRef = useRef<HTMLDivElement>(null)
  const progressThumbRef = useRef<HTMLDivElement>(null)
  const currentTimeTextRef = useRef<HTMLSpanElement>(null)

  // --- 歌词面板用的 currentIndex（只在行索引变化时才更新，避免高频 re-render） ---
  const [lyricsCurrentIndex, setLyricsCurrentIndex] = useState(-1)
  const lyricsRef = useRef<LyricLine[]>([])
  const lyricOffsetRef = useRef(0)

  // 同步 lyrics 和 lyricOffset 到 ref（供 RAF 使用）
  useEffect(() => { lyricsRef.current = lyrics }, [lyrics])
  useEffect(() => { lyricOffsetRef.current = lyricOffset }, [lyricOffset])

  // ---------------------------------------------------------------------------
  // 按 Esc 返回主界面
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveNav('local')  // 返回本地音乐页面
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveNav])

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

  // 监听全屏状态变化（F11 / Esc 退出时同步状态）
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  // ---------------------------------------------------------------------------
  // 切歌时加载 .lrc 文件
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!currentTrack) {
      setLyrics([])
      return
    }

    // .lrc 文件路径：与音频文件同目录同名
    const audioPath = currentTrack.filePath
    const lrcPath = audioPath.replace(/\.[^.]+$/, '.lrc')

    // 通过 IPC 读取 .lrc 文件内容
    window.electronAPI.invoke('read-lrc-file', lrcPath)
      .then((content: string | null) => {
        if (content) {
          const parsed = parseLrc(content)
          setLyrics(parsed)
          console.log('[Lyrics] 歌词加载成功，共', parsed.length, '行')
        } else {
          setLyrics([])
        }
      })
      .catch(() => {
        setLyrics([])
      })

    // 提取封面主色作为背景（⚠️ 暗礁 2：50x50 Canvas 采样）
    if (currentTrack.coverPath) {
      const coverUrl = window.electronAPI.getCoverUrl(currentTrack.coverPath)
      extractMainColor(coverUrl).then((color) => {
        setBgColor(color)
      })
    } else {
      setBgColor('')
    }
  }, [currentTrack])

  // ---------------------------------------------------------------------------
  // 进度条拖拽逻辑
  // ---------------------------------------------------------------------------
  const updateDragTime = useCallback((e: MouseEvent) => {
    if (!progressRef.current || duration <= 0) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = ratio * duration
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

  // ---------------------------------------------------------------------------
  // RAF 循环：进度条 DOM 直接操作 + 歌词索引变化时才 re-render
  // ---------------------------------------------------------------------------
  // 进度条每帧更新（60fps），歌词只在行索引变化时触发一次 re-render
  useEffect(() => {
    let rafId: number
    let lastLyricsIndex = -1

    const update = () => {
      const time = isDraggingRef.current
        ? (dragTimeRef.current ?? 0)
        : currentTimeRef.current
      const pct = duration > 0 ? (time / duration) * 100 : 0

      // 进度条：每帧直接操作 DOM
      if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`
      if (progressThumbRef.current) progressThumbRef.current.style.left = `${pct}%`
      if (currentTimeTextRef.current) currentTimeTextRef.current.textContent = formatTime(time)

      // 歌词索引：只在行索引变化时才 setState（避免每 100ms re-render）
      const currentLyrics = lyricsRef.current
      const offset = lyricOffsetRef.current
      if (currentLyrics.length > 0) {
        const adjustedTime = time + offset
        // 二分查找当前行索引
        let left = 0, right = currentLyrics.length - 1, result = -1
        while (left <= right) {
          const mid = Math.floor((left + right) / 2)
          if (currentLyrics[mid].time <= adjustedTime) {
            result = mid
            left = mid + 1
          } else {
            right = mid - 1
          }
        }
        if (result !== lastLyricsIndex) {
          lastLyricsIndex = result
          setLyricsCurrentIndex(result)
        }
      }

      rafId = requestAnimationFrame(update)
    }
    rafId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafId)
  }, [duration])

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

  return (
    <div
      className="lyrics-page lyrics-page--immersive"
      style={bgColor ? { background: bgColor } : undefined}
    >
      {/* 顶部拖拽区域 */}
      <div className="lyrics-page__drag-area" />

      {/* 右上角按钮：全屏 + 返回 */}
      <div className="lyrics-page__top-actions">
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
          onClick={() => setActiveNav('local')}
          title="返回"
        >
          <IconBack width={18} height={18} />
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
          <div className="lyrics-page__buttons">
            <button className="lyrics-page__btn" onClick={prevTrack} title="上一首">
              <IconPrev width={18} height={18} />
            </button>
            <button
              className="lyrics-page__btn"
              onClick={() => setPlaying(!isPlaying)}
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying
                ? <IconPause width={18} height={18} />
                : <IconPlay width={18} height={18} />
              }
            </button>
            <button className="lyrics-page__btn" onClick={nextTrack} title="下一首">
              <IconNext width={18} height={18} />
            </button>
          </div>

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
        </div>
      </div>

      {/* 右侧：歌词滚动面板 */}
      <div className="lyrics-page__right">
        <LyricsPanel
          lyrics={lyrics}
          currentIndex={lyricsCurrentIndex}
          onLineClick={(time) => setSeekTime(time)}
        />
      </div>
    </div>
  )
}

export default Lyrics
