import { describe, expect, it } from 'vitest'

import {
  buildListeningSummary,
  formatListeningDuration,
  formatLocalDate,
  getLocalWeekStart,
} from '../src/utils/listeningStats'

describe('听歌统计纯函数', () => {
  it('应该使用本地日期而不是 UTC 日期切片', () => {
    const localEarlyMorning = new Date(2026, 0, 2, 0, 30)

    expect(formatLocalDate(localEarlyMorning)).toBe('2026-01-02')
  })

  it('应该以周一作为本地周起点并正确跨年', () => {
    expect(formatLocalDate(getLocalWeekStart(new Date(2026, 0, 1, 12)))).toBe('2025-12-29')
    expect(formatLocalDate(getLocalWeekStart(new Date(2026, 2, 1, 12)))).toBe('2026-02-23')
  })

  it('应该聚合总计、本月、本周和今日秒数', () => {
    const summary = buildListeningSummary([
      { date: '2026-02-28', seconds: 10 },
      { date: '2026-03-01', seconds: 20 },
      { date: '2026-03-02', seconds: 30 },
      { date: '2026-03-04', seconds: 40 },
    ], new Date(2026, 2, 4, 12))

    expect(summary).toMatchObject({
      totalSeconds: 100,
      monthSeconds: 90,
      weekSeconds: 70,
      todaySeconds: 40,
      activeDaysThisWeek: 2,
      activeRatio: 2 / 7,
      firstDate: '2026-02-28',
    })
  })

  it('近 7 天应该补零并给出安全柱高', () => {
    const summary = buildListeningSummary([
      { date: '2024-02-29', seconds: 60 },
      { date: '2024-03-02', seconds: 30 },
    ], new Date(2024, 2, 3, 12))

    expect(summary.lastSevenDays.map((day) => day.date)).toEqual([
      '2024-02-26', '2024-02-27', '2024-02-28', '2024-02-29',
      '2024-03-01', '2024-03-02', '2024-03-03',
    ])
    expect(summary.lastSevenDays.map((day) => day.seconds)).toEqual([0, 0, 0, 60, 0, 30, 0])
    expect(summary.lastSevenDays.map((day) => day.ratio)).toEqual([0, 0, 0, 1, 0, 0.5, 0])

    const empty = buildListeningSummary([], new Date(2024, 2, 3, 12))
    expect(empty.lastSevenDays.every((day) => day.ratio === 0)).toBe(true)
    expect(empty.lastSevenDays.every((day) => Number.isFinite(day.ratio))).toBe(true)
  })

  it('连续天数应该允许从今天或昨天开始', () => {
    const todayActive = buildListeningSummary([
      { date: '2026-07-10', seconds: 1 },
      { date: '2026-07-11', seconds: 1 },
      { date: '2026-07-12', seconds: 1 },
    ], new Date(2026, 6, 12, 8))
    expect(todayActive.streakDays).toBe(3)

    const yesterdayActive = buildListeningSummary([
      { date: '2026-07-09', seconds: 1 },
      { date: '2026-07-10', seconds: 1 },
      { date: '2026-07-11', seconds: 1 },
    ], new Date(2026, 6, 12, 8))
    expect(yesterdayActive.streakDays).toBe(3)

    expect(buildListeningSummary([], new Date(2026, 6, 12, 8)).streakDays).toBe(0)
  })

  it('活跃比例应该限制在 0 到 1', () => {
    const duplicateDays = Array.from({ length: 10 }, () => ({ date: '2026-07-12', seconds: 1 }))
    const summary = buildListeningSummary(duplicateDays, new Date(2026, 6, 12, 8))

    expect(summary.activeDaysThisWeek).toBe(1)
    expect(summary.activeRatio).toBe(1 / 7)
  })

  it.each([
    [0, '0 分钟'],
    [59, '少于 1 分钟'],
    [60, '1 分钟'],
    [3660, '1 小时 1 分钟'],
    [360_060, '100 小时 1 分钟'],
  ])('应该格式化 %i 秒', (seconds, expected) => {
    expect(formatListeningDuration(seconds)).toBe(expected)
  })
})
