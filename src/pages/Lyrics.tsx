// =============================================================================
// QinPlayer — 歌词界面页面（沉浸式）
// =============================================================================
// 职责：全屏沉浸式歌词展示
// 设计要点：
//   - 隐藏导航栏和播放栏，最大化歌词显示区域
//   - 左侧：大封面 + 歌曲信息 + 播放控制（播放/暂停/上下首/进度条）
//   - 右侧：歌词逐行滚动（GPU 加速）
//   - 按 Esc 返回主界面
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { useUIStore } from '../stores/uiStore'
import LyricsPanel from '../components/LyricsPanel'
import { parseLrc } from '../utils/lrcParser'
import { extractMainColor } from '../utils/colorExtract'
import type { LyricLine } from '../types'

function Lyrics() {
  // --- 播放状态 ---
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const setPlaying = usePlayerStore((s) => s.setPlaying)
  const setSeekTime = usePlayerStore((s) => s.setSeekTime)
  const nextTrack = usePlayerStore((s) => s.nextTrack)
  const prevTrack = usePlayerStore((s) => s.prevTrack)

  // --- 导航状态 ---
  const setActiveNav = useUIStore((s) => s.setActiveNav)

  // --- 歌词状态 ---
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [bgColor, setBgColor] = useState('')

  // --- 进度条拖拽 ---
  const progressRef = useRef<HTMLDivElement>(null)
  const [dragTime, setDragTime] = useState<number | null>(null)
  const isDraggingRef = useRef(false)
  const dragTimeRef = useRef<number | null>(null)

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

  // 进度条
  const displayTime = dragTime ?? currentTime
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0

  return (
    <div
      className="lyrics-page lyrics-page--immersive"
      style={bgColor ? { background: bgColor } : undefined}
    >
      {/* 顶部拖拽区域 */}
      <div className="lyrics-page__drag-area" />

      {/* 右上角菜单按钮（点击回到主页面） */}
      <button
        className="lyrics-page__back-btn"
        onClick={() => setActiveNav('local')}
        title="返回"
      >
        ☰
      </button>

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
            <button className="lyrics-page__btn" onClick={prevTrack}>⏮</button>
            <button
              className="lyrics-page__btn lyrics-page__btn--play"
              onClick={() => setPlaying(!isPlaying)}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="lyrics-page__btn" onClick={nextTrack}>⏭</button>
          </div>

          {/* 小进度条 */}
          <div className="lyrics-page__progress-row">
            <span className="lyrics-page__time">{formatTime(displayTime)}</span>
            <div
              className="lyrics-page__progress-bar"
              ref={progressRef}
              onMouseDown={handleProgressMouseDown}
            >
              <div
                className="lyrics-page__progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
              <div
                className="lyrics-page__progress-thumb"
                style={{ left: `${progressPercent}%` }}
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
          currentTime={currentTime}
          offset={0}
          onLineClick={(time) => setSeekTime(time)}
        />
      </div>
    </div>
  )
}

export default Lyrics
