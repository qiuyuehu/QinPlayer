// =============================================================================
// QinPlayer — 根组件
// =============================================================================
// 职责：组装布局（标题栏 + 导航栏 + 内容区 + 播放控制条）、主题管理
// 布局：TitleBar 固定顶部，中间 Sidebar + Content 占满，PlayerBar 固定底部
// =============================================================================

import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Content from './components/Content'
import PlayerBar from './components/PlayerBar'
import { useTheme } from './hooks/useTheme'
import { useAudioSync } from './hooks/useAudioSync'

function App() {
  // 初始化主题系统（监听 theme 状态，切换 data-theme 属性）
  useTheme()

  // 初始化音频同步（监听 Zustand 状态，统一驱动 AudioEngine）
  useAudioSync()

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
