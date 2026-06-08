// =============================================================================
// QinPlayer — Electron API 类型声明（渲染进程用）
// =============================================================================
// 声明 window.electronAPI 的类型，让渲染进程的 TypeScript 编译通过
// 实际实现在 electron/preload.ts 中通过 contextBridge 暴露
// =============================================================================

export interface ElectronAPI {
  // 自定义协议：将本地文件路径转为 qinplayer:// URL
  getAudioUrl: (filePath: string) => string

  // 窗口控制
  minimize: () => void
  maximize: () => void
  close: () => void

  // 通用 IPC
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
