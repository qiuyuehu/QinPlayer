/**
 * windowBounds 测试
 * 覆盖：bounds/state 读写容错、NaN 拦截、多显示器 bounds clamp
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>()
  const getAllDisplays = vi.fn(() => [
    { workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  ])
  const getDatabase = vi.fn(() => ({
    prepare: (sql: string) => ({
      get: (key: string) => {
        if (!sql.startsWith('SELECT')) return undefined
        const value = values.get(key)
        return value ? { value } : undefined
      },
      run: (key: string, value: string) => {
        values.set(key, value)
      },
    }),
  }))

  return { values, getAllDisplays, getDatabase }
})

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: mocks.getAllDisplays,
  },
}))

vi.mock('../electron/db/database', () => ({
  getDatabase: mocks.getDatabase,
}))

import {
  loadWindowBounds,
  loadWindowState,
  normalizeWindowBounds,
  saveWindowBounds,
  saveWindowState,
} from '../electron/windowBounds'

describe('windowBounds', () => {
  beforeEach(() => {
    mocks.values.clear()
    mocks.getDatabase.mockClear()
    mocks.getDatabase.mockImplementation(() => ({
      prepare: (sql: string) => ({
        get: (key: string) => {
          if (!sql.startsWith('SELECT')) return undefined
          const value = mocks.values.get(key)
          return value ? { value } : undefined
        },
        run: (key: string, value: string) => {
          mocks.values.set(key, value)
        },
      }),
    }))
    mocks.getAllDisplays.mockReturnValue([
      { workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
    ])
  })

  it('读取 bounds 时数据库异常不应该抛出', () => {
    mocks.getDatabase.mockImplementation(() => {
      throw new Error('db closed')
    })

    expect(loadWindowBounds()).toBeNull()
  })

  it('保存 bounds 时数据库异常不应该抛出', () => {
    mocks.getDatabase.mockImplementation(() => {
      throw new Error('db closed')
    })

    expect(() => saveWindowBounds({ x: 1, y: 2, width: 1000, height: 680 })).not.toThrow()
  })

  it('应该拒绝 NaN bounds', () => {
    mocks.values.set('windowBounds', JSON.stringify({ x: Number.NaN, y: 0, width: 1000, height: 680 }))

    expect(loadWindowBounds()).toBeNull()
  })

  it('应该 clamp 到显示器可见区域并保证最小尺寸', () => {
    const normalized = normalizeWindowBounds({ x: 1800, y: 1000, width: 200, height: 200 })

    expect(normalized).toEqual({ x: 1120, y: 440, width: 800, height: 600 })
  })

  it('标题栏完全不可见时应该返回 null', () => {
    const normalized = normalizeWindowBounds({ x: 100, y: -100, width: 1000, height: 680 })

    expect(normalized).toBeNull()
  })

  it('应该保存并读取窗口状态', () => {
    saveWindowState({ isMaximized: true, isMinimized: false })

    expect(loadWindowState()).toEqual({ isMaximized: true, isMinimized: false })
  })
})
