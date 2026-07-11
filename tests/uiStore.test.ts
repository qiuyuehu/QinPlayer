/**
 * uiStore 测试
 * 覆盖：状态设置、toggleSidebar 逻辑、主题切换
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FEATURE_FLAGS, isNavAllowed } from '../src/utils/featureFlags'

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeNav: 'local',
      isMiniMode: false,
      theme: 'dark',
      reducedMotion: false,
      sidebarCollapsed: false,
      searchQuery: '',
      featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    })
  })

  // --- 初始状态 ---
  it('初始状态：导航为 local，暗色主题，侧边栏展开', () => {
    const state = useUIStore.getState()
    expect(state.activeNav).toBe('local')
    expect(state.theme).toBe('dark')
    expect(state.sidebarCollapsed).toBe(false)
    expect(state.isMiniMode).toBe(false)
    expect(state.searchQuery).toBe('')
    expect(state.reducedMotion).toBe(false)
    expect(state.featureFlags.playback).toBe(true)
  })

  it('setReducedMotion 只更新减少动画偏好', () => {
    useUIStore.getState().setReducedMotion(true)
    expect(useUIStore.getState().reducedMotion).toBe(true)

    useUIStore.getState().setReducedMotion(false)
    expect(useUIStore.getState().reducedMotion).toBe(false)
  })

  // --- setActiveNav ---
  it('setActiveNav 切换导航', () => {
    useUIStore.getState().setActiveNav('albums')
    expect(useUIStore.getState().activeNav).toBe('albums')
  })

  // --- setMiniMode ---
  it('setMiniMode 切换迷你模式', () => {
    useUIStore.getState().setMiniMode(true)
    expect(useUIStore.getState().isMiniMode).toBe(true)
    useUIStore.getState().setMiniMode(false)
    expect(useUIStore.getState().isMiniMode).toBe(false)
  })

  // --- setTheme ---
  it('setTheme 切换主题', () => {
    useUIStore.getState().setTheme('light')
    expect(useUIStore.getState().theme).toBe('light')
    useUIStore.getState().setTheme('system')
    expect(useUIStore.getState().theme).toBe('system')
    useUIStore.getState().setTheme('dark')
    expect(useUIStore.getState().theme).toBe('dark')
  })

  // --- toggleSidebar ---
  it('toggleSidebar 切换侧边栏折叠', () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })

  // --- setSearchQuery ---
  it('setSearchQuery 设置搜索关键词', () => {
    useUIStore.getState().setSearchQuery('周杰伦')
    expect(useUIStore.getState().searchQuery).toBe('周杰伦')
    useUIStore.getState().setSearchQuery('')
    expect(useUIStore.getState().searchQuery).toBe('')
  })

  // --- setFeatureFlags ---
  it('setFeatureFlags 设置功能开关快照', () => {
    useUIStore.getState().setFeatureFlags({ ...DEFAULT_FEATURE_FLAGS, albums: false })
    expect(useUIStore.getState().featureFlags.albums).toBe(false)
  })

  it('isNavAllowed 应该拦截关闭的导航页面', () => {
    const flags = { ...DEFAULT_FEATURE_FLAGS, albums: false }
    expect(isNavAllowed('albums', flags)).toBe(false)
    expect(isNavAllowed('local', flags)).toBe(true)
  })
})
