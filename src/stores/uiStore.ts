// =============================================================================
// QinPlayer — UI 状态管理 Store
// =============================================================================
// 职责：管理界面相关状态（导航、主题、迷你模式）
// 设计：低频状态，变更不频繁，放 Zustand 不会有性能问题
// =============================================================================

import { create } from 'zustand'
import type { Theme } from '../types'
import type { FeatureFlags } from '../types/ipc'
import { DEFAULT_FEATURE_FLAGS } from '../utils/featureFlags'

// ---------------------------------------------------------------------------
// 状态接口
// ---------------------------------------------------------------------------

interface UIState {
  activeNav: string              // 当前选中的导航项 ID
  previousNav: string | null     // 进入歌词前的导航项（退出歌词时恢复用）
  isMiniMode: boolean            // 是否处于迷你模式
  theme: Theme                   // 当前主题
  reducedMotion: boolean         // 是否手动减少界面动画
  sidebarCollapsed: boolean      // 侧边栏是否折叠
  searchQuery: string            // 搜索关键词
  featureFlags: FeatureFlags     // 启动时读取的功能开关快照

  // actions
  setActiveNav: (nav: string) => void
  setMiniMode: (v: boolean) => void
  setTheme: (t: Theme) => void
  setReducedMotion: (enabled: boolean) => void
  toggleSidebar: () => void
  setSearchQuery: (q: string) => void
  setFeatureFlags: (flags: FeatureFlags) => void
}

// ---------------------------------------------------------------------------
// Store 创建
// ---------------------------------------------------------------------------

export const useUIStore = create<UIState>((set) => ({
  // 初始状态
  activeNav: 'local',            // 默认显示本地音乐页面
  previousNav: null,             // 进入歌词前的导航项
  isMiniMode: false,
  theme: 'dark',                 // 默认暗色主题
  reducedMotion: false,
  sidebarCollapsed: false,
  searchQuery: '',               // 搜索关键词（空 = 不搜索）
  featureFlags: { ...DEFAULT_FEATURE_FLAGS },

  // actions
  setActiveNav: (nav) => set((state) => ({
    activeNav: nav,
    // 切换到歌词时保存当前导航；已在歌词页时保留；切到其他页面时清空
    previousNav: nav === 'lyrics'
      ? (state.activeNav !== 'lyrics' ? state.activeNav : state.previousNav)
      : null,
  })),
  setMiniMode: (v) => set({ isMiniMode: v }),
  setTheme: (t) => set({ theme: t }),
  setReducedMotion: (enabled) => set({ reducedMotion: enabled }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setFeatureFlags: (flags) => set({ featureFlags: flags }),
}))
