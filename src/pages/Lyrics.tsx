// =============================================================================
// QinPlayer — 歌词界面页面
// =============================================================================
// 职责：左右分屏展示歌词
// 设计要点：
//   - 左侧（40%）：大封面 + 歌名 + 歌手 + 专辑 + 偏移量控制
//   - 右侧（60%）：歌词逐行滚动面板（GPU 加速）
//   - 切歌时自动加载同目录同名 .lrc 文件
//   - 歌词时间轴偏移设置（±0.5s），兼容不准的 LRC 文件
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import LyricsPanel from '../components/LyricsPanel'
import { parseLrc } from '../utils/lrcParser'
import type { LyricLine } from '../types'

function Lyrics() {
  // --- 播放状态 ---
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const setSeekTime = usePlayerStore((s) => s.setSeekTime)

  // --- 歌词状态 ---
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [lyricOffset, setLyricOffset] = useState(0)

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
          console.log('[Lyrics] 未找到歌词文件:', lrcPath)
        }
      })
      .catch(() => {
        setLyrics([])
      })

    // 从数据库恢复偏移量
    window.electronAPI.invoke('settings:get', { key: 'lyricOffset' })
      .then((val: string | null) => {
        if (val) {
          const offset = parseFloat(val)
          if (!isNaN(offset)) setLyricOffset(offset)
        }
      })
      .catch(() => {})
  }, [currentTrack])

  // ---------------------------------------------------------------------------
  // 偏移量调整
  // ---------------------------------------------------------------------------
  const handleOffsetChange = useCallback(async (delta: number) => {
    const newOffset = lyricOffset + delta
    setLyricOffset(newOffset)
    await window.electronAPI.invoke('settings:set', { key: 'lyricOffset', value: String(newOffset) })
  }, [lyricOffset])

  // ---------------------------------------------------------------------------
  // 点击歌词行跳转
  // ---------------------------------------------------------------------------
  const handleLineClick = useCallback((time: number) => {
    setSeekTime(time)
  }, [setSeekTime])

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

  return (
    <div className="lyrics-page">
      {/* 左侧：封面 + 歌曲信息 */}
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

        {/* 偏移量控制（±0.5s） */}
        <div className="lyrics-page__offset">
          <button
            className="lyrics-page__offset-btn"
            onClick={() => handleOffsetChange(-0.5)}
          >
            -0.5s
          </button>
          <span className="lyrics-page__offset-label">
            偏移: {lyricOffset >= 0 ? '+' : ''}{lyricOffset.toFixed(1)}s
          </span>
          <button
            className="lyrics-page__offset-btn"
            onClick={() => handleOffsetChange(0.5)}
          >
            +0.5s
          </button>
        </div>
      </div>

      {/* 右侧：歌词滚动面板 */}
      <div className="lyrics-page__right">
        <LyricsPanel
          lyrics={lyrics}
          currentTime={currentTime}
          offset={lyricOffset}
          onLineClick={handleLineClick}
        />
      </div>
    </div>
  )
}

export default Lyrics
