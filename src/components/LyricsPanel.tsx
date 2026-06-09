// =============================================================================
// QinPlayer — 歌词滚动面板组件
// =============================================================================
// 职责：逐行渲染歌词，自动滚动到当前行，当前行高亮放大
// 设计要点：
//   - GPU 加速：使用 CSS transform: translateY() + will-change: transform
//   - 不用 scrollTop（易掉帧）
//   - 当前行高亮：scale(1.1) + 颜色变化
//   - 点击歌词行跳转到对应时间
// =============================================================================

import { useEffect, useRef, useMemo, useCallback } from 'react'
import type { LyricLine } from '../types'

interface LyricsPanelProps {
  lyrics: LyricLine[]          // 已排序的歌词数组
  currentTime: number          // 当前播放时间（秒）
  offset?: number              // 时间轴偏移量（秒）
  onLineClick?: (time: number) => void  // 点击歌词行回调
}

/**
 * 查找当前播放时间对应的歌词行索引
 * 二分查找，返回最后一个 time <= currentTime 的行索引
 */
function findCurrentIndex(lyrics: LyricLine[], currentTime: number): number {
  if (lyrics.length === 0 || currentTime < lyrics[0].time) {
    return -1
  }

  let left = 0
  let right = lyrics.length - 1
  let result = -1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (lyrics[mid].time <= currentTime) {
      result = mid
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  return result
}

function LyricsPanel({ lyrics, currentTime, offset = 0, onLineClick }: LyricsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  // 应用偏移量后的当前时间
  const adjustedTime = currentTime + offset

  // 计算当前行索引
  const currentIndex = useMemo(
    () => findCurrentIndex(lyrics, adjustedTime),
    [lyrics, adjustedTime]
  )

  // 当前行变化时，平滑滚动到当前行
  useEffect(() => {
    if (currentIndex < 0 || !containerRef.current) return

    const currentElement = itemRefs.current[currentIndex]
    if (!currentElement) return

    const container = containerRef.current
    const containerHeight = container.clientHeight
    const elementTop = currentElement.offsetTop
    const elementHeight = currentElement.offsetHeight

    // 计算偏移量：让当前行居中
    const targetScroll = elementTop - containerHeight / 2 + elementHeight / 2

    // 使用 CSS transform 实现 GPU 加速滚动（不用 scrollTop）
    container.style.transform = `translateY(${-targetScroll}px)`
  }, [currentIndex])

  // 点击歌词行跳转
  const handleLineClick = useCallback((time: number) => {
    if (onLineClick) {
      onLineClick(time)
    }
  }, [onLineClick])

  // 无歌词时显示提示
  if (lyrics.length === 0) {
    return (
      <div className="lyrics-panel lyrics-panel--empty">
        <p className="lyrics-panel__hint">暂无歌词</p>
      </div>
    )
  }

  return (
    <div className="lyrics-panel" ref={containerRef}>
      {/* 顶部留白（让第一行歌词能滚动到中间） */}
      <div className="lyrics-panel__spacer" />

      {lyrics.map((line, index) => (
        <div
          key={`${line.time}-${index}`}
          ref={(el) => { itemRefs.current[index] = el }}
          className={`lyrics-panel__line ${
            index === currentIndex ? 'lyrics-panel__line--active' : ''
          }`}
          onClick={() => handleLineClick(line.time)}
        >
          {line.text}
        </div>
      ))}

      {/* 底部留白 */}
      <div className="lyrics-panel__spacer" />
    </div>
  )
}

export default LyricsPanel
