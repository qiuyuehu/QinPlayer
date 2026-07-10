// =============================================================================
// QinPlayer — 当前歌曲歌词加载 Hook
// =============================================================================
// 职责：读取并解析同名 LRC，以歌曲身份和请求序号隔离异步竞态
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { parseLrc } from '../utils/lrcParser'
import type { LyricLine, Track } from '../types'

interface TrackLyricsData {
  trackId: number | null
  filePath: string | null
  lines: LyricLine[]
}

const EMPTY_LYRICS: LyricLine[] = []

export function useTrackLyrics(track: Track | null): LyricLine[] {
  const trackId = track?.id ?? null
  const filePath = track?.filePath ?? null
  const requestRef = useRef(0)
  const [lyricsData, setLyricsData] = useState<TrackLyricsData>({
    trackId: null,
    filePath: null,
    lines: EMPTY_LYRICS,
  })

  useEffect(() => {
    const requestId = ++requestRef.current
    let active = true

    if (trackId === null || filePath === null) {
      setLyricsData({ trackId: null, filePath: null, lines: EMPTY_LYRICS })
      return () => {
        active = false
        if (requestRef.current === requestId) requestRef.current++
      }
    }

    setLyricsData({ trackId, filePath, lines: EMPTY_LYRICS })
    const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')

    window.electronAPI.invoke('read-lrc-file', lrcPath)
      .then((content: unknown) => {
        if (!active || requestId !== requestRef.current) return
        const lines = typeof content === 'string' && content.length > 0
          ? parseLrc(content)
          : EMPTY_LYRICS
        setLyricsData({ trackId, filePath, lines })
      })
      .catch(() => {
        if (!active || requestId !== requestRef.current) return
        setLyricsData({ trackId, filePath, lines: EMPTY_LYRICS })
      })

    return () => {
      active = false
      if (requestRef.current === requestId) requestRef.current++
    }
  }, [trackId, filePath])

  return lyricsData.trackId === trackId && lyricsData.filePath === filePath
    ? lyricsData.lines
    : EMPTY_LYRICS
}
