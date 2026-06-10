// =============================================================================
// QinPlayer — LRC 歌词解析器
// =============================================================================
// 职责：将 .lrc 文件内容解析为时间轴数组
// 支持：
//   - 标准格式：[00:12.34]第一行歌词
//   - 多时间戳：[00:12.34][00:15.67]同一句歌词（间奏重复）
//   - 双语歌词：
//     1. 用 ｜ 分隔：[00:12.34]原文｜翻译
//     2. 用空格分隔：[00:12.34]外文 中文翻译（自动检测）
//   - 偏移量：[offset:xxx]（全局时间偏移，单位毫秒）
//   - 2位或3位毫秒：[00:12.34] 或 [00:12.345]
// =============================================================================

import type { LyricLine } from '../types'

// 时间戳正则：匹配 [mm:ss.xx] 或 [mm:ss.xxx]
const TIME_REGEX = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g

// 偏移量正则：匹配 [offset:xxx]（正负均可）
const OFFSET_REGEX = /\[offset:([+-]?\d+)\]/

// 字符检测工具
const hasCJK = (s: string) => /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/.test(s)
const hasLatin = (s: string) => /[a-zA-Z]/.test(s)
const hasKana = (s: string) => /[\u3040-\u309f\u30a0-\u30ff]/.test(s)

/**
 * 解析单个时间戳字符串为秒数
 */
function parseTimestamp(minutes: string, seconds: string, ms: string): number {
  const m = parseInt(minutes, 10)
  const s = parseInt(seconds, 10)
  const milliseconds = ms.length === 2 ? parseInt(ms, 10) * 10 : parseInt(ms, 10)
  return m * 60 + s + milliseconds / 1000
}

/**
 * 检测并拆分双语歌词
 * 1. 优先用 ｜ 分隔
 * 2. 自动检测：外文 + 空格 + 中文
 */
function detectBilingual(raw: string): { text: string; translation?: string } {
  // 1. 优先用 ｜ 分隔
  if (raw.includes('｜')) {
    const parts = raw.split('｜')
    return {
      text: parts[0].trim(),
      translation: parts[1]?.trim() || undefined
    }
  }

  // 2. 自动检测：用空格分隔
  const lastSpace = raw.lastIndexOf(' ')
  if (lastSpace > 0 && lastSpace < raw.length - 1) {
    const left = raw.substring(0, lastSpace)
    const right = raw.substring(lastSpace + 1)

    // 一侧主要是拉丁/假名，另一侧纯 CJK → 双语（左侧为原文）
    if ((hasLatin(left) || hasKana(left)) && hasCJK(right) && !hasLatin(right) && !hasKana(right)) {
      return { text: left, translation: right }
    }
    // 两侧都有 CJK → 日文假名在左 = "日文 中文翻译"
    if (hasKana(left) && hasCJK(right) && !hasKana(right)) {
      return { text: left, translation: right }
    }
  }

  // 3. 没有检测到双语
  return { text: raw }
}

/**
 * 解析 LRC 歌词内容为时间轴数组
 *
 * @param lrcContent - .lrc 文件的文本内容
 * @returns 按时间排序的歌词行数组
 */
export function parseLrc(lrcContent: string): LyricLine[] {
  const lines = lrcContent.split('\n')
  const result: LyricLine[] = []
  let offset = 0  // 全局偏移量（毫秒）

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 1. 检查是否有全局偏移量 [offset:xxx]
    const offsetMatch = trimmed.match(OFFSET_REGEX)
    if (offsetMatch) {
      offset = parseInt(offsetMatch[1], 10) / 1000
      continue
    }

    // 2. 提取所有时间戳
    const timestamps: number[] = []
    let match: RegExpExecArray | null

    TIME_REGEX.lastIndex = 0
    while ((match = TIME_REGEX.exec(trimmed)) !== null) {
      timestamps.push(parseTimestamp(match[1], match[2], match[3]))
    }

    // 没有时间戳的行跳过
    if (timestamps.length === 0) continue

    // 3. 提取歌词文本
    const raw = trimmed.replace(TIME_REGEX, '').trim()
    if (!raw) continue

    // 4. 检测双语歌词
    const { text, translation } = detectBilingual(raw)

    // 5. 为每个时间戳生成一条记录
    for (const time of timestamps) {
      result.push({
        time: time + offset,
        text,
        translation
      })
    }
  }

  // 按时间排序
  result.sort((a, b) => a.time - b.time)

  return result
}

/**
 * 查找当前播放时间对应的歌词行索引
 */
export function findCurrentLyricIndex(lyrics: LyricLine[], currentTime: number): number {
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
