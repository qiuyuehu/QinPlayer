// =============================================================================
// QinPlayer — 歌词滚动面板组件
// =============================================================================
// 职责：逐行渲染歌词，自动滚动到当前行，当前行高亮放大
// 设计要点：
//   - 使用 scrollTop 滚动 + 透明滚动条
//   - 当前行高亮：scale(1.1) + 颜色变化
//   - 点击歌词行跳转到对应时间
// =============================================================================

import { useEffect, useRef, useCallback } from 'react'
import type { WheelEvent } from 'react'
import type { LyricLine } from '../types'
import type { FeatureFlags } from '../types/ipc'

interface LyricsPanelProps {
  lyrics: LyricLine[]          // 已排序的歌词数组
  currentIndex: number         // 当前歌词行索引（由父组件计算）
  onLineClick?: (time: number) => void  // 点击歌词行回调
  featureFlags?: FeatureFlags
}

// LyricsPanel — 歌词滚动面板，逐行高亮 + 点击跳转
function LyricsPanel({ lyrics, currentIndex, onLineClick, featureFlags }: LyricsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const prevIndexRef = useRef(currentIndex)
  const prevLyricsRef = useRef(lyrics)
  const userScrollingRef = useRef(false)
  const scrollTimerRef = useRef<number>(0)
  const autoScrollingRef = useRef(false)
  const autoScrollTimerRef = useRef<number>(0)

  // 标记用户手动滚动，暂停自动滚动 3 秒。
  const markUserScrolling = useCallback(() => {
    userScrollingRef.current = true
    clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = window.setTimeout(() => {
      userScrollingRef.current = false
    }, 3000)
  }, [])

  const handleUserScroll = markUserScrolling

  const handleScroll = useCallback(() => {
    if (autoScrollingRef.current) return
    markUserScrolling()
  }, [markUserScrolling])

  useEffect(() => {
    return () => {
      clearTimeout(scrollTimerRef.current)
      clearTimeout(autoScrollTimerRef.current)
    }
  }, [])

  // 当前行变化时，平滑滚动到当前行
  useEffect(() => {
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
    const isJump = isTrackChange || Math.abs(currentIndex - prevIndexRef.current) > 3 || currentIndex === 0

    if (isJump) {
      userScrollingRef.current = false
      clearTimeout(scrollTimerRef.current)
      clearTimeout(autoScrollTimerRef.current)
      autoScrollingRef.current = true
      container.scrollTo({ top: targetScroll, behavior: 'auto' })
      autoScrollingRef.current = false
    } else if (!userScrollingRef.current) {
      autoScrollingRef.current = true
      container.scrollTo({ top: targetScroll, behavior: 'smooth' })
      const scrollDistance = Math.abs(targetScroll - container.scrollTop)
      const animDuration = Math.max(500, scrollDistance * 0.4)
      clearTimeout(autoScrollTimerRef.current)
      autoScrollTimerRef.current = window.setTimeout(() => {
        autoScrollingRef.current = false
      }, animDuration)
    }

    prevIndexRef.current = currentIndex
    prevLyricsRef.current = lyrics
  }, [currentIndex, lyrics])

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
  const scrollbarEnabled = featureFlags?.lyricsScrollbar !== false
  const handleWheel = scrollbarEnabled
    ? handleUserScroll
    : (e: WheelEvent) => e.preventDefault()

  return (
    <div
      className={`lyrics-panel ${scrollbarEnabled ? 'lyrics-panel--scrollbar' : ''}`}
      ref={containerRef}
      onWheel={handleWheel}
      onScroll={scrollbarEnabled ? handleScroll : undefined}
      style={!scrollbarEnabled ? { overflow: 'hidden' } : undefined}
    >
      {/* 顶部留白（让第一行歌词能滚动到中间） */}
      <div className="lyrics-panel__spacer" />

      {lyrics.map((line, index) => {
        // 计算当前行与激活行的距离（渐进式披露）
        const distance = index - currentIndex

        // 默认显示更多行；关闭 flag 时回退到当前行和后面 2 行。
        // 开启滚动条时，远处歌词也需要保持可见，否则手动上滑看不到旧歌词。
        const isInFocusRange = index >= 0 && distance >= (moreLines ? -1 : 0) && distance <= (moreLines ? 4 : 2)
        const isVisible = scrollbarEnabled || isInFocusRange
        const opacity = isVisible ? (
          distance === 0 ? 1 :
          Math.abs(distance) === 1 ? 0.5 :
          Math.abs(distance) === 2 ? 0.3 :
          isInFocusRange ? 0.15 : 0.22
        ) : 0
        const isActive = index === currentIndex

        return (
          <div
            key={`${line.time}-${index}`}
            ref={(el) => { itemRefs.current[index] = el }}
            className={`lyrics-panel__line ${isActive ? 'lyrics-panel__line--active' : ''}`}
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
