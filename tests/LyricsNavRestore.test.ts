/**
 * 歌词退出导航恢复 — 回归测试
 * 覆盖：从任意页面进歌词，退出后恢复到进入前的页面
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'

describe('Bug 1 回归：歌词退出后恢复之前的导航', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeNav: 'local',
      previousNav: null,
      featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    })
  })

  it('从专辑页进歌词，previousNav 应保存为 albums', () => {
    useUIStore.getState().setActiveNav('albums')
    useUIStore.getState().setActiveNav('lyrics')

    const state = useUIStore.getState()
    expect(state.activeNav).toBe('lyrics')
    expect(state.previousNav).toBe('albums')
  })

  it('从歌单页进歌词，previousNav 应保存为 playlists', () => {
    useUIStore.getState().setActiveNav('playlists')
    useUIStore.getState().setActiveNav('lyrics')

    const state = useUIStore.getState()
    expect(state.activeNav).toBe('lyrics')
    expect(state.previousNav).toBe('playlists')
  })

  it('从本地音乐进歌词，previousNav 应保存为 local', () => {
    useUIStore.getState().setActiveNav('lyrics')

    const state = useUIStore.getState()
    expect(state.activeNav).toBe('lyrics')
    expect(state.previousNav).toBe('local')
  })

  it('退出歌词时应恢复到之前的导航项', () => {
    // 从专辑进歌词
    useUIStore.getState().setActiveNav('albums')
    useUIStore.getState().setActiveNav('lyrics')
    expect(useUIStore.getState().previousNav).toBe('albums')

    // 模拟 leaveLyrics 行为：读取 previousNav 并恢复
    const { previousNav } = useUIStore.getState()
    useUIStore.getState().setActiveNav(previousNav || 'local')

    expect(useUIStore.getState().activeNav).toBe('albums')
    // setActiveNav 切到非 lyrics 页面时会清空 previousNav
    expect(useUIStore.getState().previousNav).toBeNull()
  })

  it('连续两次进入/退出歌词应正确恢复', () => {
    // 第一次：从专辑进歌词
    useUIStore.getState().setActiveNav('albums')
    useUIStore.getState().setActiveNav('lyrics')
    expect(useUIStore.getState().previousNav).toBe('albums')

    // 退出
    const prev1 = useUIStore.getState().previousNav
    useUIStore.getState().setActiveNav(prev1 || 'local')
    expect(useUIStore.getState().activeNav).toBe('albums')

    // 第二次：从歌单进歌词
    useUIStore.getState().setActiveNav('playlists')
    useUIStore.getState().setActiveNav('lyrics')
    expect(useUIStore.getState().previousNav).toBe('playlists')

    // 退出
    const prev2 = useUIStore.getState().previousNav
    useUIStore.getState().setActiveNav(prev2 || 'local')
    expect(useUIStore.getState().activeNav).toBe('playlists')
  })

  it('已在歌词页时再次 setActiveNav(lyrics) 不覆盖 previousNav', () => {
    useUIStore.getState().setActiveNav('albums')
    useUIStore.getState().setActiveNav('lyrics')
    expect(useUIStore.getState().previousNav).toBe('albums')

    // 再次调用 setActiveNav('lyrics') — 不应该覆盖
    useUIStore.getState().setActiveNav('lyrics')
    expect(useUIStore.getState().previousNav).toBe('albums')
  })

  it('previousNav 为空时兜底到 local', () => {
    // 直接设置 activeNav 为 lyrics（不经过正常流程，previousNav 为 null）
    useUIStore.setState({ activeNav: 'lyrics', previousNav: null })

    const { previousNav } = useUIStore.getState()
    useUIStore.getState().setActiveNav(previousNav || 'local')

    expect(useUIStore.getState().activeNav).toBe('local')
  })
})
