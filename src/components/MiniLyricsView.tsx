// =============================================================================
// QinPlayer — 迷你歌词视图
// =============================================================================
// 职责：在固定迷你壳层中展示当前歌词和下一句，不承担滚动定位
// =============================================================================

import type { LyricLine, Track } from '../types'

interface MiniLyricsViewProps {
  currentTrack: Track | null
  lyrics: LyricLine[]
  currentIndex: number
}

interface MiniLyricLineProps {
  line: LyricLine
  active: boolean
}

function MiniLyricLine({ line, active }: MiniLyricLineProps) {
  return (
    <div className={`mini-lyrics-view__line ${active ? 'mini-lyrics-view__line--active' : ''}`}>
      <span className="mini-lyrics-view__text">{line.text || '♪'}</span>
      {line.translation && (
        <span className="mini-lyrics-view__translation">{line.translation}</span>
      )}
    </div>
  )
}

function MiniLyricsView({ currentTrack, lyrics, currentIndex }: MiniLyricsViewProps) {
  if (!currentTrack) {
    return <div className="mini-lyrics-view mini-lyrics-view--empty">未在播放</div>
  }

  if (lyrics.length === 0) {
    return <div className="mini-lyrics-view" />
  }

  const currentLine = currentIndex >= 0 ? lyrics[currentIndex] : undefined
  const nextLine = currentIndex >= 0 ? lyrics[currentIndex + 1] : lyrics[0]

  return (
    <div className="mini-lyrics-view" aria-label="迷你歌词">
      {currentLine && (
        <MiniLyricLine line={currentLine} active />
      )}
      {nextLine && (
        <MiniLyricLine line={nextLine} active={false} />
      )}
    </div>
  )
}

export default MiniLyricsView
