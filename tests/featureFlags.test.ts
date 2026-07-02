/**
 * featureFlags 扩展测试
 * 覆盖：isNavAllowed 导航守卫、canPlay 播放守卫、各 flag 消融验证
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FEATURE_FLAGS,
  normalizeFeatureFlags,
  isNavAllowed,
  canPlay,
  hasFeature,
} from '../src/utils/featureFlags'
import type { FeatureFlags } from '../src/types/ipc'

// 全关 flags（消融基准）
const ALL_OFF: FeatureFlags = {
  playback: false,
  equalizer: false,
  lyrics: false,
  albums: false,
  recent: false,
  liked: false,
  search: false,
  miniMode: false,
  tray: false,
  playlists: false,
  settings: false,
  fadeEffect: false,
  mediaSession: false,
}

describe('isNavAllowed — 导航守卫', () => {
  it('全部开启时所有导航项都允许', () => {
    const navs = ['recent', 'local', 'albums', 'playlists', 'liked', 'lyrics', 'settings', 'search']
    for (const nav of navs) {
      expect(isNavAllowed(nav, DEFAULT_FEATURE_FLAGS)).toBe(true)
    }
  })

  it('全部关闭时非 local 导航项都禁止', () => {
    expect(isNavAllowed('local', ALL_OFF)).toBe(true)  // local 永远允许
    expect(isNavAllowed('recent', ALL_OFF)).toBe(false)
    expect(isNavAllowed('albums', ALL_OFF)).toBe(false)
    expect(isNavAllowed('playlists', ALL_OFF)).toBe(false)
    expect(isNavAllowed('liked', ALL_OFF)).toBe(false)
    expect(isNavAllowed('lyrics', ALL_OFF)).toBe(false)
    expect(isNavAllowed('settings', ALL_OFF)).toBe(false)
    expect(isNavAllowed('search', ALL_OFF)).toBe(false)
  })

  it('单个 flag 关闭只影响对应导航', () => {
    const flags = { ...DEFAULT_FEATURE_FLAGS, albums: false }
    expect(isNavAllowed('albums', flags)).toBe(false)
    expect(isNavAllowed('local', flags)).toBe(true)
    expect(isNavAllowed('recent', flags)).toBe(true)
  })

  it('未知导航项默认允许', () => {
    expect(isNavAllowed('unknown-page', ALL_OFF)).toBe(true)
  })
})

describe('canPlay — 播放守卫', () => {
  it('playback=true 时允许播放', () => {
    expect(canPlay(DEFAULT_FEATURE_FLAGS)).toBe(true)
  })

  it('playback=false 时禁止播放', () => {
    expect(canPlay({ ...DEFAULT_FEATURE_FLAGS, playback: false })).toBe(false)
  })
})

describe('hasFeature — 单项检查', () => {
  it('对应 flag 为 true 返回 true', () => {
    expect(hasFeature(DEFAULT_FEATURE_FLAGS, 'equalizer')).toBe(true)
  })

  it('对应 flag 为 false 返回 false', () => {
    expect(hasFeature({ ...DEFAULT_FEATURE_FLAGS, equalizer: false }, 'equalizer')).toBe(false)
  })
})

describe('消融验证 — 逐个 flag 关闭不影响其他', () => {
  const flagKeys = Object.keys(DEFAULT_FEATURE_FLAGS) as (keyof FeatureFlags)[]

  for (const key of flagKeys) {
    it(`关闭 ${key} 不影响其他 flag 默认值`, () => {
      const flags = { ...DEFAULT_FEATURE_FLAGS, [key]: false }
      for (const other of flagKeys) {
        if (other !== key) {
          expect(flags[other]).toBe(true)
        }
      }
      expect(flags[key]).toBe(false)
    })
  }
})

describe('normalizeFeatureFlags — 边界值', () => {
  it('空对象返回全默认', () => {
    expect(normalizeFeatureFlags({})).toEqual(DEFAULT_FEATURE_FLAGS)
  })

  it('数组输入返回全默认', () => {
    expect(normalizeFeatureFlags([1, 2, 3])).toEqual(DEFAULT_FEATURE_FLAGS)
  })

  it('字符串 "true" 被忽略', () => {
    const flags = normalizeFeatureFlags({ playback: 'true' })
    expect(flags.playback).toBe(true)  // 默认值
  })

  it('数字 0 被忽略', () => {
    const flags = normalizeFeatureFlags({ playback: 0 })
    expect(flags.playback).toBe(true)  // 默认值
  })

  it('null 被忽略', () => {
    const flags = normalizeFeatureFlags({ playback: null })
    expect(flags.playback).toBe(true)  // 默认值
  })
})
