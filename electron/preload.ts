// =============================================================================
// QinPlayer — 预加载脚本
// =============================================================================
// 职责：通过 contextBridge 安全地将主进程 API 暴露给渲染进程
// 注意：preload 脚本在渲染进程的沙箱中运行，只能访问有限的 Node.js API
// =============================================================================

import { contextBridge, ipcRenderer } from 'electron'

// ---------------------------------------------------------------------------
// 暴露给渲染进程的 API
// ---------------------------------------------------------------------------
// 渲染进程通过 window.electronAPI.xxx() 调用
// 所有 IPC 通信都通过这里，不直接暴露 ipcRenderer（安全原则）
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld('electronAPI', {
  // --- 自定义协议 ---
  // 将本地文件路径转换为 qinplayer:// 协议 URL
  // 渲染进程用这个 URL 设置 <audio> 标签的 src
  getAudioUrl: (filePath: string): string => {
    return `qinplayer://audio?path=${encodeURIComponent(filePath)}`
  },

  // --- 窗口控制 ---
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // --- IPC 通信 ---
  // invoke: 双向通信（渲染 → 主进程 → 返回结果）
  // send: 单向通信（渲染 → 主进程，不等返回）
  // on: 监听主进程推送的消息

  invoke: (channel: string, ...args: unknown[]) => {
    return ipcRenderer.invoke(channel, ...args)
  },

  // 监听主进程推送的消息
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
      callback(...args)
    }
    ipcRenderer.on(channel, subscription)
    // 返回取消监听的函数，防止内存泄漏
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  }
})

// ---------------------------------------------------------------------------
// TypeScript 类型声明
// ---------------------------------------------------------------------------

export interface ElectronAPI {
  getAudioUrl: (filePath: string) => string
  minimize: () => void
  maximize: () => void
  close: () => void
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
