// =============================================================================
// QinPlayer — React 入口
// =============================================================================
// 渲染进程的入口文件，挂载 React 根组件
// =============================================================================

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// 挂载 React 应用到 #root 元素
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
