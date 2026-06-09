// =============================================================================
// QinPlayer — UI 状态管理 Store
// =============================================================================
// 职责：管理界面相关状态（导航、主题、迷你模式）
// 设计：低频状态，变更不频繁，放 Zustand 不会有性能问题
// =============================================================================

import { create } from 'zustand'
import type { Theme } from '../types'

// ---------------------------------------------------------------------------
// 状态接口
// ---------------------------------------------------------------------------

interface UIState {
  activeNav: string              // 当前选中的导航项 ID
  isMiniMode: boolean            // 是否处于迷你模式
  theme: Theme                   // 当前主题
  sidebarCollapsed: boolean      // 侧边栏是否折叠
  searchQuery: string            // 搜索关键词

  // actions
  setActiveNav: (nav: string) => void
  setMiniMode: (v: boolean) => void
  setTheme: (t: Theme) => void
  toggleSidebar: () => void
  setSearchQuery: (q: string) => void
}

// ---------------------------------------------------------------------------
// Store 创建
// ---------------------------------------------------------------------------

export const useUIStore = create<UIState>((set) => ({
  // 初始状态
  activeNav: 'local',            // 默认显示本地音乐页面
  isMiniMode: false,
  theme: 'dark',                 // 默认暗色主题
  sidebarCollapsed: false,
  searchQuery: '',               // 搜索关键词（空 = 不搜索）

  // actions
  setActiveNav: (nav) => set({ activeNav: nav }),
  setMiniMode: (v) => set({ isMiniMode: v }),
  setTheme: (t) => set({ theme: t }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSearchQuery: (q) => set({ searchQuery: q }),
}))
