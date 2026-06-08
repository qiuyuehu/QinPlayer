// =============================================================================
// QinPlayer — 自定义标题栏
// =============================================================================
// 职责：窗口拖拽、最小化/最大化/关闭按钮
// 样式：暗色主题，与 titleBarOverlay 配色一致
// 注意：标题栏区域设 -webkit-app-region: drag 实现拖拽，
//       按钮必须设 no-drag 防止点击被拖拽拦截
// =============================================================================

import { useState, useEffect, useCallback } from 'react'

function TitleBar() {
  // 窗口最大化状态（用于切换图标）
  const [isMaximized, setIsMaximized] = useState(false)

  // 监听窗口最大化/还原事件（主进程推送）
  useEffect(() => {
    const unsubscribe = window.electronAPI.on('window:maximized', (maximized: unknown) => {
      setIsMaximized(maximized as boolean)
    })
    return unsubscribe
  }, [])

  // --- 窗口控制按钮 ---

  const handleMinimize = useCallback(() => {
    window.electronAPI.minimize()
  }, [])

  const handleMaximize = useCallback(() => {
    window.electronAPI.maximize()
  }, [])

  const handleClose = useCallback(() => {
    window.electronAPI.close()
  }, [])

  return (
    <div className="title-bar">
      {/* 左侧：应用名称（可拖拽区域） */}
      <div className="title-bar__drag-area">
        <span className="title-bar__text">QinPlayer</span>
      </div>

      {/* 右侧：窗口控制按钮 */}
      <div className="title-bar__controls">
        {/* 最小化按钮 */}
        <button
          className="title-bar__btn"
          onClick={handleMinimize}
          title="最小化"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>

        {/* 最大化/还原按钮 */}
        <button
          className="title-bar__btn"
          onClick={handleMaximize}
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            // 还原图标（两个重叠的方块）
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="3" y="1" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="1" y="3" width="8" height="8" rx="1" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            // 最大化图标（方块）
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="1" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )}
        </button>

        {/* 关闭按钮（hover 时变红） */}
        <button
          className="title-bar__btn title-bar__btn--close"
          onClick={handleClose}
          title="关闭"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default TitleBar
