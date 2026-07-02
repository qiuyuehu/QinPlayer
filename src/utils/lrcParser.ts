// =============================================================================
// QinPlayer — LRC 歌词解析器
// =============================================================================
// 职责：将 .lrc 文件内容解析为时间轴数组
// 支持：
//   - 标准格式：[00:12.34]第一行歌词
//   - 多时间戳：[00:12.34][00:15.67]同一句歌词（间奏重复）
//   - 双语歌词：
//     1. 同时间戳双行：[00:12.34]原文 + [00:12.34]翻译（新格式）
//     2. 用 ｜ 分隔：[00:12.34]原文｜翻译
//     3. 用空格分隔：[00:12.34]外文 中文翻译（自动检测）
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
 * 检测文本是否包含中文字符
 */
function hasCJK(s: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/.test(s)
}

/**
 * 检测文本是否包含拉丁字母
 */
function hasLatin(s: string): boolean {
  return /[a-zA-Z]/.test(s)
}

/**
 * 检测并拆分单行内的双语歌词（｜ 分隔 或 空格分隔）
 */
function detectBilingualInline(raw: string): { text: string; translation?: string } {
  // 1. 优先用 ｜ 分隔
  if (raw.includes('｜')) {
    const parts = raw.split('｜')
    return {
      text: parts[0].trim(),
      translation: parts[1]?.trim() || undefined
    }
  }

  // 2. 空格分隔：前半含拉丁字母 + 后半含中文 → 双语
  if (hasLatin(raw) && hasCJK(raw)) {
    const spaceIndex = raw.indexOf(' ')
    if (spaceIndex > 0) {
      const left = raw.substring(0, spaceIndex).trim()
      const right = raw.substring(spaceIndex + 1).trim()
      if (left && right && hasLatin(left) && hasCJK(right)) {
        return { text: left, translation: right }
      }
    }
  }

  // 3. 没有检测到双语
  return { text: raw }
}

/**
 * 解析 LRC 歌词内容为时间轴数组
 *
 * 核心逻辑：
 *   1. 遍历所有行，提取时间戳 + 文本
 *   2. 按时间戳分组（同一时间戳的多行归为一组）
 *   3. 同组两条 → 第一条原文，第二条翻译；一条 → 普通行
 *   4. 排序输出
 *
 * @param lrcContent - .lrc 文件的文本内容
 * @returns 按时间排序的歌词行数组
 */
export function parseLrc(lrcContent: string): LyricLine[] {
  const lines = lrcContent.split('\n')
  let offset = 0  // 全局偏移量（毫秒）

  // 第一遍：收集所有 { time, rawText } 条目
  type RawEntry = { time: number; raw: string }
  const entries: RawEntry[] = []

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

    // 4. 为每个时间戳生成一条记录
    for (const time of timestamps) {
      entries.push({ time: time + offset, raw })
    }
  }

  // 第二遍：按时间戳分组，合并同时间的双语行
  // 用 Map 保持插入顺序（同时间的行按出现顺序排列）
  const grouped = new Map<number, string[]>()
  for (const entry of entries) {
    const list = grouped.get(entry.time)
    if (list) {
      list.push(entry.raw)
    } else {
      grouped.set(entry.time, [entry.raw])
    }
  }

  // 第三遍：生成最终歌词数组
  const result: LyricLine[] = []

  for (const [time, texts] of grouped) {
    if (texts.length >= 2) {
      // 同时间两条：第一条原文，第二条翻译
      // 每条内部也可能包含 ｜ 分隔的双语，先各自处理
      const first = detectBilingualInline(texts[0])
      const second = detectBilingualInline(texts[1])

      result.push({
        time,
        text: first.text,
        // 翻译取第二行的文本（如果第二行本身也有翻译部分，拼接起来）
        translation: second.translation
          ? `${second.text}｜${second.translation}`
          : second.text
      })
    } else {
      // 单行：走常规双语检测
      const { text, translation } = detectBilingualInline(texts[0])
      result.push({ time, text, translation })
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
