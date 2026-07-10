// =============================================================================
// QinPlayer — 歌词滚动面板组件
// =============================================================================
// 职责：逐行渲染歌词，自动滚动到当前行，当前行高亮
// 设计要点：
//   - 列表使用 scrollTo 定位，隐藏原生滚动条
//   - 单行使用透明度、颜色和轻微 transform 过渡
//   - 点击歌词行跳转到对应时间
// =============================================================================

import { useLayoutEffect, useRef, useCallback } from 'react'
import type { LyricLine } from '../types'
import type { FeatureFlags } from '../types/ipc'

interface LyricsPanelProps {
  lyrics: LyricLine[]          // 已排序的歌词数组
  currentIndex: number         // 当前歌词行索引（由父组件计算）
  onLineClick?: (time: number) => void  // 点击歌词行回调
  featureFlags?: FeatureFlags
  layoutRevision?: number
}

// LyricsPanel — 歌词滚动面板，逐行高亮 + 点击跳转
function LyricsPanel({
  lyrics,
  currentIndex,
  onLineClick,
  featureFlags,
  layoutRevision = 0,
}: LyricsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const prevIndexRef = useRef(currentIndex)
  const prevLyricsRef = useRef(lyrics)
  const prevLayoutRevisionRef = useRef(layoutRevision)

  // 当前行变化时，平滑滚动到当前行
  useLayoutEffect(() => {
    if (currentIndex < 0 || !containerRef.current) return

    const currentElement = itemRefs.current[currentIndex]
    if (!currentElement) return

    const container = containerRef.current
    const containerHeight = container.clientHeight
    const elementTop = currentElement.offsetTop
    const elementHeight = currentElement.offsetHeight

    // 计算偏移量：让当前行居中，但整体上移 15% 让歌词和封面对齐
    const targetScroll = elementTop - containerHeight * 0.35 + elementHeight / 2

    const isTrackChange = lyrics !== prevLyricsRef.current
    const isLayoutChange = layoutRevision !== prevLayoutRevisionRef.current
    const isJump = isTrackChange
      || isLayoutChange
      || Math.abs(currentIndex - prevIndexRef.current) > 3
      || currentIndex === 0
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    container.scrollTo({
      top: targetScroll,
      behavior: isJump || prefersReducedMotion ? 'auto' : 'smooth',
    })

    prevIndexRef.current = currentIndex
    prevLyricsRef.current = lyrics
    prevLayoutRevisionRef.current = layoutRevision
  }, [currentIndex, lyrics, layoutRevision])

  // 点击歌词行跳转
  const handleLineClick = useCallback((time: number) => {
    if (onLineClick) {
      onLineClick(time)
    }
  }, [onLineClick])

  // 无歌词时显示空白面板
  if (lyrics.length === 0) {
    return (
      <div className="lyrics-panel lyrics-panel--empty" />
    )
  }

  const moreLines = featureFlags?.lyricsMoreLines !== false
  const hasTranslation = lyrics.some((line) => Boolean(line.translation))

  // 双语歌词始终保持 3 行；只有单语歌词受更多行开关控制。
  const showMoreLines = moreLines && !hasTranslation
  const focusStart = showMoreLines ? -1 : 0
  const focusEnd = showMoreLines ? 4 : 2

  return (
    <div
      className="lyrics-panel"
      ref={containerRef}
    >
      {/* 顶部留白（让第一行歌词能滚动到中间） */}
      <div className="lyrics-panel__spacer" />

      {lyrics.map((line, index) => {
        // 计算当前行与激活行的距离（渐进式披露）
        const distance = index - currentIndex

        const isInFocusRange = index >= 0 && distance >= focusStart && distance <= focusEnd
        const isVisible = isInFocusRange
        const opacity = isVisible ? (
          distance === 0 ? 1 :
          Math.abs(distance) === 1 ? 0.5 :
          Math.abs(distance) === 2 ? 0.3 :
          0.15
        ) : 0
        const isActive = index === currentIndex
        const directionClass = distance < 0
          ? 'lyrics-panel__line--past'
          : distance > 0
            ? 'lyrics-panel__line--future'
            : ''

        return (
          <div
            key={`${line.time}-${index}`}
            ref={(el) => { itemRefs.current[index] = el }}
            className={`lyrics-panel__line ${isActive ? 'lyrics-panel__line--active' : ''} ${directionClass}`}
            onClick={() => handleLineClick(line.time)}
            style={{
              opacity,
              pointerEvents: isVisible ? 'auto' : 'none',
            }}
          >
            <div className="lyrics-panel__text">{line.text || '♪'}</div>
            {line.translation && (
              <div className="lyrics-panel__translation">{line.translation}</div>
            )}
          </div>
        )
      })}

      {/* 底部留白 */}
      <div className="lyrics-panel__spacer" />
    </div>
  )
}

export default LyricsPanel
