// =============================================================================
// QinPlayer — Electron API 类型声明
// =============================================================================
// 为 window.electronAPI 提供 TypeScript 类型支持
// 实现在 electron/preload.ts 的 contextBridge.exposeInMainWorld 中
// =============================================================================

export interface ElectronAPI {
  /** 将本地文件路径转换为 qinplayer://audio 协议 URL */
  getAudioUrl: (filePath: string) => string
  /** 将本地文件路径转换为 qinplayer://cover 协议 URL */
  getCoverUrl: (filePath: string) => string
  /** 最小化窗口 */
  minimize: () => void
  /** 最大化/还原窗口 */
  maximize: () => void
  /** 关闭窗口 */
  close: () => void
  /** 双向 IPC 通信（渲染 → 主进程） */
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  /** 监听主进程推送的消息 */
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
