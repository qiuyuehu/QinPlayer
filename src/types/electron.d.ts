import type {
  FeatureFlags,
  IpcEventArgs,
  IpcEventChannel,
  IpcSendArgs,
  IpcSendChannel,
  MainWindowInvokeArgs,
  MainWindowInvokeChannel,
  MainWindowInvokeResult,
  NativeTrackMenuAction,
  NativeTrackMenuWindowInit,
} from './ipc'

// =============================================================================
// QinPlayer — Electron API 类型声明
// =============================================================================
// 为 window.electronAPI 提供 TypeScript 类型支持
// 实现在 electron/preload.ts 的 contextBridge.exposeInMainWorld 中
// =============================================================================

export interface ElectronAPI {
  /** 生成由主进程按歌曲 ID 授权的音频 URL */
  getAudioUrl: (songId: number, mtime: number) => string
  /** 生成由主进程按歌曲 ID 授权的封面 URL */
  getCoverUrl: (songId: number, mtime: number) => string
  /** 生成只指向当前设置头像的 URL；路径只用于缓存版本文件名 */
  getAvatarUrl: (avatarPath: string) => string
  /** 最小化窗口 */
  minimize: () => void
  /** 最大化/还原窗口 */
  maximize: () => void
  /** 关闭窗口 */
  close: () => void
  /** 设置窗口是否置顶 */
  setAlwaysOnTop: (flag: boolean) => void
  /** 获取功能开关快照 */
  getFeatureFlags: () => Promise<FeatureFlags>
  /** 双向 IPC 通信（渲染 → 主进程） */
  invoke: <C extends MainWindowInvokeChannel>(
    channel: C,
    ...args: MainWindowInvokeArgs<C>
  ) => Promise<MainWindowInvokeResult<C>>
  /** 单向发送（渲染 → 主进程） */
  send: <C extends IpcSendChannel>(channel: C, ...args: IpcSendArgs<C>) => void
  /** 监听主进程推送的消息 */
  on: <C extends IpcEventChannel>(
    channel: C,
    callback: (...args: IpcEventArgs<C>) => void,
  ) => () => void
}

export interface ContextMenuWindowAPI {
  getInit: () => Promise<NativeTrackMenuWindowInit | null>
  ready: () => Promise<void>
  resolve: (action: NativeTrackMenuAction | null) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    contextMenuAPI: ContextMenuWindowAPI
  }
}
