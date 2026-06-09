// =============================================================================
// QinPlayer — LRC 歌词解析器
// =============================================================================
// 职责：将 .lrc 文件内容解析为时间轴数组
// 支持：
//   - 标准格式：[00:12.34]第一行歌词
//   - 多时间戳：[00:12.34][00:15.67]同一句歌词（间奏重复）
//   - 偏移量：[offset:xxx]（全局时间偏移，单位毫秒）
//   - 2位或3位毫秒：[00:12.34] 或 [00:12.345]
// =============================================================================

import type { LyricLine } from '../types'

// 时间戳正则：匹配 [mm:ss.xx] 或 [mm:ss.xxx]
// \d{2,3} 兼容 2位和3位毫秒
const TIME_REGEX = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g

// 偏移量正则：匹配 [offset:xxx]（正负均可）
const OFFSET_REGEX = /\[offset:([+-]?\d+)\]/

/**
 * 解析单个时间戳字符串为秒数
 * [00:12.34] → 12.34
 * [01:30.500] → 90.5
 */
function parseTimestamp(minutes: string, seconds: string, ms: string): number {
  const m = parseInt(minutes, 10)
  const s = parseInt(seconds, 10)
  // 毫秒：2位时乘10（.34 → 340ms），3位时直接用（.345 → 345ms）
  const milliseconds = ms.length === 2 ? parseInt(ms, 10) * 10 : parseInt(ms, 10)
  return m * 60 + s + milliseconds / 1000
}

/**
 * 解析 LRC 歌词内容为时间轴数组
 *
 * @param lrcContent - .lrc 文件的文本内容
 * @returns 按时间排序的歌词行数组
 *
 * @example
 * const lyrics = parseLrc('[00:12.34]第一行\n[00:15.67]第二行')
 * // [{ time: 12.34, text: '第一行' }, { time: 15.67, text: '第二行' }]
 *
 * // 多时间戳格式（间奏重复歌词）
 * const lyrics = parseLrc('[00:12.34][00:15.67]同一句歌词')
 * // [{ time: 12.34, text: '同一句歌词' }, { time: 15.67, text: '同一句歌词' }]
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
      offset = parseInt(offsetMatch[1], 10) / 1000  // 毫秒转秒
      continue
    }

    // 2. 提取所有时间戳（一行可能有多个 [mm:ss.xx]）
    const timestamps: number[] = []
    let match: RegExpExecArray | null

    // 重置正则状态（lastIndex）
    TIME_REGEX.lastIndex = 0
    while ((match = TIME_REGEX.exec(trimmed)) !== null) {
      timestamps.push(parseTimestamp(match[1], match[2], match[3]))
    }

    // 没有时间戳的行跳过（可能是元数据标签如 [ti:歌名]）
    if (timestamps.length === 0) continue

    // 3. 提取歌词文本（去掉所有时间戳后的部分）
    const text = trimmed.replace(TIME_REGEX, '').trim()
    if (!text) continue  // 纯时间戳行（间奏标记）跳过

    // 4. 为每个时间戳生成一条记录（多时间戳 → 多条记录）
    for (const time of timestamps) {
      result.push({
        time: time + offset,  // 应用全局偏移
        text
      })
    }
  }

  // 按时间排序
  result.sort((a, b) => a.time - b.time)

  return result
}

/**
 * 查找当前播放时间对应的歌词行索引
 * 二分查找，返回最后一个 time <= currentTime 的行索引
 *
 * @param lyrics - 已排序的歌词数组
 * @param currentTime - 当前播放时间（秒）
 * @returns 当前行索引，-1 表示还没到第一句
 */
export function findCurrentLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (lyrics.length === 0 || currentTime < lyrics[0].time) {
    return -1
  }

  // 二分查找
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
