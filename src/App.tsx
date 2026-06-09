// =============================================================================
// QinPlayer — 根组件
// =============================================================================
// 职责：组装布局（标题栏 + 导航栏 + 内容区 + 播放控制条）、主题管理
// 布局：TitleBar 固定顶部，中间 Sidebar + Content 占满，PlayerBar 固定底部
// 水合：启动时从数据库恢复播放状态，加载完成前显示骨架屏
// =============================================================================

import { useState, useEffect } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Content from './components/Content'
import PlayerBar from './components/PlayerBar'
import { useTheme } from './hooks/useTheme'
import { useAudioSync } from './hooks/useAudioSync'
import { restorePlayerState } from './stores/playerStore'
import { useUIStore } from './stores/uiStore'
import type { Theme } from './types'

function App() {
  // 水合状态（数据库加载完成前显示骨架屏）
  const [isHydrated, setIsHydrated] = useState(false)

  // 当前导航项（歌词界面时隐藏导航栏和播放栏）
  const activeNav = useUIStore((state) => state.activeNav)
  const isLyricsMode = activeNav === 'lyrics'

  // 初始化主题系统
  useTheme()

  // 初始化音频同步
  useAudioSync()

  // 启动时恢复播放状态 + 主题设置
  useEffect(() => {
    async function hydrate() {
      try {
        // 并行恢复：播放状态 + 主题设置
        const [, savedTheme] = await Promise.all([
          restorePlayerState(),
          window.electronAPI.invoke('settings:get', { key: 'theme' }) as Promise<string | null>,
        ])

        // 恢复主题（如果有保存的值）
        if (savedTheme && ['dark', 'light', 'system'].includes(savedTheme)) {
          useUIStore.getState().setTheme(savedTheme as Theme)
        }
      } catch (e) {
        console.error('[App] 水合失败:', e)
      } finally {
        setIsHydrated(true)
      }
    }
    hydrate()
  }, [])

  // 加载中显示骨架屏
  if (!isHydrated) {
    return (
      <div className="app">
        <TitleBar />
        <div className="app__main">
          <div className="app__skeleton">
            <div className="app__skeleton-sidebar" />
            <div className="app__skeleton-content">
              <div className="app__skeleton-bar" style={{ width: '40%' }} />
              <div className="app__skeleton-bar" style={{ width: '60%' }} />
              <div className="app__skeleton-bar" style={{ width: '50%' }} />
            </div>
          </div>
        </div>
        <PlayerBar />
      </div>
    )
  }

  return (
    <div className="app">
      {/* 自定义标题栏（拖拽区 + 窗口控制按钮） */}
      <TitleBar />

      {/* 主体区域：左侧导航栏 + 右侧内容区 */}
      <div className="app__main">
        {/* 歌词界面时隐藏导航栏 */}
        {!isLyricsMode && <Sidebar />}
        <Content />
      </div>

      {/* 底部播放控制条（歌词界面时隐藏） */}
      {!isLyricsMode && <PlayerBar />}
    </div>
  )
}

export default App
