// =============================================================================
// QinPlayer — 主题切换 Hook
// =============================================================================
// 职责：管理主题状态，切换 <html> 的 data-theme 属性
// 支持：'dark' | 'light' | 'system'
// 'system' 模式下监听系统主题变化，自动跟随
// 主题变化时通知主进程更新标题栏颜色（Windows titleBarOverlay）
// =============================================================================

import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import type { Theme } from '../types'

// 获取系统主题
function getSystemTheme(): 'dark' | 'light' {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

// 应用主题到 DOM + 通知主进程
function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  document.documentElement.setAttribute('data-theme', resolved)

  // 通知主进程更新标题栏颜色
  window.electronAPI.send('theme-changed', resolved)
}

export function useTheme() {
  const theme = useUIStore((state) => state.theme)

  // 主题变化时应用到 DOM
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // system 模式下监听系统主题变化（两套机制互补）
  // 1. matchMedia：渲染进程自己监听（响应快）
  // 2. 主进程 nativeTheme：主进程推送（更可靠，作为备份）
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mediaQuery.addEventListener('change', handler)

    // 监听主进程 nativeTheme 推送
    const unsubscribe = window.electronAPI.on('theme:system-changed', () => {
      applyTheme('system')
    })

    return () => {
      mediaQuery.removeEventListener('change', handler)
      unsubscribe()
    }
  }, [theme])

  return { theme }
}
