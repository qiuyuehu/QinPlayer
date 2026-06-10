// =============================================================================
// QinPlayer — LRC 歌词解析器
// =============================================================================
// 职责：将 .lrc 文件内容解析为时间轴数组
// 支持：
//   - 标准格式：[00:12.34]第一行歌词
//   - 多时间戳：[00:12.34][00:15.67]同一句歌词（间奏重复）
//   - 双语歌词：相同时间戳的多行合并显示（中英/中日对照）
//   - 偏移量：[offset:xxx]（全局时间偏移，单位毫秒）
//   - 2位或3位毫秒：[00:12.34] 或 [00:12.345]
// =============================================================================

import type { LyricLine } from '../types'

// 时间戳正则：匹配 [mm:ss.xx] 或 [mm:ss.xxx]
const TIME_REGEX = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g

// 偏移量正则：匹配 [offset:xxx]（正负均可）
const OFFSET_REGEX = /\[offset:([+-]?\d+)\]/

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
 * 解析 LRC 歌词内容为时间轴数组
 *
 * @param lrcContent - .lrc 文件的文本内容
 * @returns 按时间排序的歌词行数组（双语歌词合并为多行文本）
 *
 * @example
 * // 双语歌词（相同时间戳合并）
 * const lyrics = parseLrc('[00:12.34]中文\n[00:12.34]English')
 * // [{ time: 12.34, text: '中文\nEnglish' }]
 */
export function parseLrc(lrcContent: string): LyricLine[] {
  const lines = lrcContent.split('\n')
  // 用 Map 按时间戳分组，支持双语歌词合并
  const timeMap = new Map<number, string[]>()
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
    const text = trimmed.replace(TIME_REGEX, '').trim()
    if (!text) continue

    // 4. 应用偏移量，按时间戳分组（支持双语歌词合并）
    for (const time of timestamps) {
      const adjustedTime = time + offset
      // 四舍五入到毫秒，避免浮点精度问题
      const key = Math.round(adjustedTime * 1000) / 1000

      if (timeMap.has(key)) {
        // 相同时间戳的歌词追加（双语歌词）
        timeMap.get(key)!.push(text)
      } else {
        timeMap.set(key, [text])
      }
    }
  }

  // 5. 转换为数组，双语歌词用换行符连接
  const result: LyricLine[] = []
  for (const [time, texts] of timeMap) {
    result.push({
      time,
      text: texts.join('\n')  // 双语歌词用换行符分隔
    })
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
