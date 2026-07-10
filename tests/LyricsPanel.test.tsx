/**
 * LyricsPanel 组件测试
 * 覆盖单语、双语、混合歌词的可见行数规则
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import LyricsPanel from '../src/components/LyricsPanel'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { LyricLine } from '../src/types'

const originalScrollTo = HTMLElement.prototype.scrollTo

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    value: vi.fn(),
    writable: true,
  })
})

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    value: originalScrollTo,
    writable: true,
  })
})

// 创建足够长的歌词，确保测试不受首尾边界影响。
function createLyrics(withTranslation = false): LyricLine[] {
  return Array.from({ length: 10 }, (_, index) => ({
    time: index * 5,
    text: `第 ${index + 1} 行歌词`,
    ...(withTranslation ? { translation: `第 ${index + 1} 行翻译` } : {}),
  }))
}

// LyricsPanel 会保留所有 DOM 节点，以行内 opacity 判断当前可见行。
function countVisibleLines(container: HTMLElement): number {
  const lines = container.querySelectorAll('.lyrics-panel__line')
  return Array.from(lines).filter((line) => {
    const opacity = Number.parseFloat(window.getComputedStyle(line).opacity)
    return opacity > 0
  }).length
}

describe('LyricsPanel 歌词行数', () => {
  it('单语歌词开启更多行时应该显示 6 行', () => {
    const { container } = render(
      <LyricsPanel
        lyrics={createLyrics()}
        currentIndex={4}
        featureFlags={{ ...DEFAULT_FEATURE_FLAGS, lyricsMoreLines: true }}
      />,
    )

    expect(countVisibleLines(container)).toBe(6)
  })

  it('单语歌词关闭更多行时应该显示 3 行', () => {
    const { container } = render(
      <LyricsPanel
        lyrics={createLyrics()}
        currentIndex={4}
        featureFlags={{ ...DEFAULT_FEATURE_FLAGS, lyricsMoreLines: false }}
      />,
    )

    expect(countVisibleLines(container)).toBe(3)
  })

  it('双语歌词开启更多行时仍应该显示 3 行', () => {
    const { container } = render(
      <LyricsPanel
        lyrics={createLyrics(true)}
        currentIndex={4}
        featureFlags={{ ...DEFAULT_FEATURE_FLAGS, lyricsMoreLines: true }}
      />,
    )

    expect(countVisibleLines(container)).toBe(3)
  })

  it('双语歌词关闭更多行时应该显示 3 行', () => {
    const { container } = render(
      <LyricsPanel
        lyrics={createLyrics(true)}
        currentIndex={4}
        featureFlags={{ ...DEFAULT_FEATURE_FLAGS, lyricsMoreLines: false }}
      />,
    )

    expect(countVisibleLines(container)).toBe(3)
  })

  it('部分歌词有翻译时应该按双语显示 3 行', () => {
    const lyrics = createLyrics()
    lyrics[2] = { ...lyrics[2], translation: '局部翻译' }
    const { container } = render(
      <LyricsPanel
        lyrics={lyrics}
        currentIndex={4}
        featureFlags={{ ...DEFAULT_FEATURE_FLAGS, lyricsMoreLines: true }}
      />,
    )

    expect(countVisibleLines(container)).toBe(3)
  })

  it('空歌词应该渲染空面板', () => {
    const { container } = render(
      <LyricsPanel
        lyrics={[]}
        currentIndex={-1}
        featureFlags={DEFAULT_FEATURE_FLAGS}
      />,
    )

    expect(container.querySelector('.lyrics-panel--empty')).toBeInTheDocument()
    expect(container.querySelectorAll('.lyrics-panel__line')).toHaveLength(0)
  })
})
