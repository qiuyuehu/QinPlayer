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

function App() {
  // 水合状态（数据库加载完成前显示骨架屏）
  const [isHydrated, setIsHydrated] = useState(false)

  // 初始化主题系统
  useTheme()

  // 初始化音频同步
  useAudioSync()

  // 启动时恢复播放状态
  useEffect(() => {
    restorePlayerState().finally(() => {
      setIsHydrated(true)
    })
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
        <Sidebar />
        <Content />
      </div>

      {/* 底部播放控制条 */}
      <PlayerBar />
    </div>
  )
}

export default App
