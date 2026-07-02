/**
 * LRC 歌词解析器测试
 * 覆盖：标准格式、多时间戳、双语三种格式、偏移量、空文件、二分查找
 */
import { describe, it, expect } from 'vitest'
import { parseLrc, findCurrentLyricIndex } from '../src/utils/lrcParser'
import type { LyricLine } from '../src/types'

describe('parseLrc', () => {
  // --- 标准格式 ---
  it('解析标准 LRC 格式', () => {
    const lrc = '[00:12.34]第一行歌词\n[00:15.67]第二行歌词'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(2)
    expect(result[0].time).toBeCloseTo(12.34, 2)
    expect(result[0].text).toBe('第一行歌词')
    expect(result[1].time).toBeCloseTo(15.67, 2)
    expect(result[1].text).toBe('第二行歌词')
  })

  // --- 多时间戳（间奏重复） ---
  it('解析多时间戳：同一句歌词对应多个时间', () => {
    const lrc = '[00:12.34][01:30.00]重复歌词'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(2)
    expect(result[0].time).toBeCloseTo(12.34, 2)
    expect(result[0].text).toBe('重复歌词')
    expect(result[1].time).toBeCloseTo(90.00, 2)
    expect(result[1].text).toBe('重复歌词')
  })

  // --- 双语：同时间戳双行 ---
  it('解析双语：同时间戳双行（原文 + 翻译）', () => {
    const lrc = '[00:12.34]Hello World\n[00:12.34]你好世界'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Hello World')
    expect(result[0].translation).toBe('你好世界')
  })

  // --- 双语：｜ 分隔 ---
  it('解析双语：｜ 分隔', () => {
    const lrc = '[00:12.34]Hello World｜你好世界'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Hello World')
    expect(result[0].translation).toBe('你好世界')
  })

  // --- 双语：空格分隔（拉丁 + 中文） ---
  it('解析双语：空格分隔（拉丁 + 中文）', () => {
    const lrc = '[00:12.34]Hello 你好世界'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Hello')
    expect(result[0].translation).toBe('你好世界')
  })

  // --- 偏移量 ---
  it('解析 [offset:xxx] 全局偏移量', () => {
    const lrc = '[offset:500]\n[00:12.34]歌词'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(1)
    expect(result[0].time).toBeCloseTo(12.84, 2)  // 12.34 + 0.5
  })

  // --- 负偏移量 ---
  it('解析负偏移量', () => {
    const lrc = '[offset:-500]\n[00:12.34]歌词'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(1)
    expect(result[0].time).toBeCloseTo(11.84, 2)  // 12.34 - 0.5
  })

  // --- 3 位毫秒 ---
  it('解析 3 位毫秒格式', () => {
    const lrc = '[00:12.345]歌词'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(1)
    expect(result[0].time).toBeCloseTo(12.345, 3)
  })

  // --- 空文件 ---
  it('空字符串返回空数组', () => {
    expect(parseLrc('')).toEqual([])
  })

  it('只有空行返回空数组', () => {
    expect(parseLrc('\n\n\n')).toEqual([])
  })

  // --- 无时间戳的行跳过 ---
  it('跳过没有时间戳的行', () => {
    const lrc = '这不是歌词\n[00:12.34]这是歌词'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('这是歌词')
  })

  // --- 空歌词文本跳过 ---
  it('跳过空歌词文本', () => {
    const lrc = '[00:12.34]\n[00:15.00]有效歌词'
    const result = parseLrc(lrc)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('有效歌词')
  })

  // --- 按时间排序 ---
  it('结果按时间升序排列', () => {
    const lrc = '[00:30.00]第三句\n[00:10.00]第一句\n[00:20.00]第二句'
    const result = parseLrc(lrc)
    expect(result[0].text).toBe('第一句')
    expect(result[1].text).toBe('第二句')
    expect(result[2].text).toBe('第三句')
  })
})

describe('findCurrentLyricIndex', () => {
  const lyrics: LyricLine[] = [
    { time: 10, text: '第一句' },
    { time: 20, text: '第二句' },
    { time: 30, text: '第三句' },
    { time: 40, text: '第四句' },
  ]

  it('空歌词数组返回 -1', () => {
    expect(findCurrentLyricIndex([], 15)).toBe(-1)
  })

  it('时间在第一句之前返回 -1', () => {
    expect(findCurrentLyricIndex(lyrics, 5)).toBe(-1)
  })

  it('时间恰好等于第一句返回 0', () => {
    expect(findCurrentLyricIndex(lyrics, 10)).toBe(0)
  })

  it('时间在两句之间返回前一句索引', () => {
    expect(findCurrentLyricIndex(lyrics, 25)).toBe(1)
  })

  it('时间恰好等于最后一句返回最后索引', () => {
    expect(findCurrentLyricIndex(lyrics, 40)).toBe(3)
  })

  it('时间超过最后一句返回最后索引', () => {
    expect(findCurrentLyricIndex(lyrics, 999)).toBe(3)
  })

  it('时间在两句之间（15 秒）返回索引 0', () => {
    expect(findCurrentLyricIndex(lyrics, 15)).toBe(0)
  })
})
