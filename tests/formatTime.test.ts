/**
 * formatTime 工具函数测试
 * 覆盖：正常值、边界值、异常值
 */
import { describe, it, expect } from 'vitest'
import { formatTime } from '../src/utils/formatTime'

describe('formatTime', () => {
  // --- 正常值 ---
  it('0 秒 → "0:00"', () => {
    expect(formatTime(0)).toBe('0:00')
  })

  it('5 秒 → "0:05"', () => {
    expect(formatTime(5)).toBe('0:05')
  })

  it('59 秒 → "0:59"', () => {
    expect(formatTime(59)).toBe('0:59')
  })

  it('60 秒 → "1:00"', () => {
    expect(formatTime(60)).toBe('1:00')
  })

  it('90 秒 → "1:30"', () => {
    expect(formatTime(90)).toBe('1:30')
  })

  it('3 分 25 秒 → "3:25"', () => {
    expect(formatTime(205)).toBe('3:25')
  })

  it('60 分钟 → "60:00"', () => {
    expect(formatTime(3600)).toBe('60:00')
  })

  // --- 小数 ---
  it('小数秒向下取整：59.9 → "0:59"', () => {
    expect(formatTime(59.9)).toBe('0:59')
  })

  it('小数分钟向下取整：125.7 → "2:05"', () => {
    expect(formatTime(125.7)).toBe('2:05')
  })

  // --- 异常值 ---
  it('负数 → "0:00"', () => {
    expect(formatTime(-1)).toBe('0:00')
  })

  it('NaN → "0:00"', () => {
    expect(formatTime(NaN)).toBe('0:00')
  })

  it('Infinity → "0:00"', () => {
    expect(formatTime(Infinity)).toBe('0:00')
  })

  it('-Infinity → "0:00"', () => {
    expect(formatTime(-Infinity)).toBe('0:00')
  })
})
