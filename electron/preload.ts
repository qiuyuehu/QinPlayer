// =============================================================================
// QinPlayer — 预加载脚本
// =============================================================================
// 职责：通过 contextBridge 安全地将主进程 API 暴露给渲染进程
// 注意：preload 脚本在渲染进程的沙箱中运行，只能访问有限的 Node.js API
// =============================================================================

import { contextBridge, ipcRenderer } from 'electron'
import {
  MAIN_WINDOW_EVENT_CHANNELS,
  MAIN_WINDOW_INVOKE_CHANNELS,
  MAIN_WINDOW_SEND_CHANNELS,
  type IpcEventArgs,
  type IpcEventChannel,
  type IpcSendArgs,
  type IpcSendChannel,
  type MainWindowInvokeArgs,
  type MainWindowInvokeChannel,
  type MainWindowInvokeResult,
} from '../src/types/ipc'
import type { ElectronAPI } from '../src/types/electron'

function assertSongId(songId: number): void {
  if (!Number.isSafeInteger(songId) || songId <= 0) {
    throw new TypeError('song id 必须是正安全整数')
  }
}

function cacheVersion(value: number): string {
  return Number.isFinite(value) && value >= 0 ? String(value) : '0'
}

export function getAudioUrl(songId: number, mtime: number): string {
  assertSongId(songId)
  return `qinplayer://audio?id=${songId}&v=${encodeURIComponent(cacheVersion(mtime))}`
}

export function getCoverUrl(songId: number, mtime: number): string {
  assertSongId(songId)
  return `qinplayer://cover?id=${songId}&v=${encodeURIComponent(cacheVersion(mtime))}`
}

export function getAvatarUrl(avatarPath: string): string {
  const fileName = avatarPath.split(/[\\/]/).filter(Boolean).at(-1)
  if (!fileName) throw new TypeError('avatarPath 必须包含文件名')
  return `qinplayer://avatar?id=current&v=${encodeURIComponent(fileName)}`
}

// ---------------------------------------------------------------------------
// IPC 通道白名单（安全防护）
// ---------------------------------------------------------------------------
// invoke/send/on 只允许调用白名单内的通道，防止 XSS 注入后任意调用主进程
// ---------------------------------------------------------------------------

const INVOKE_CHANNELS = new Set<string>(Object.keys(MAIN_WINDOW_INVOKE_CHANNELS))
const SEND_CHANNELS = new Set<string>(Object.keys(MAIN_WINDOW_SEND_CHANNELS))
const ON_CHANNELS = new Set<string>(Object.keys(MAIN_WINDOW_EVENT_CHANNELS))

function invoke<C extends MainWindowInvokeChannel>(
  channel: C,
  ...args: MainWindowInvokeArgs<C>
): Promise<MainWindowInvokeResult<C>> {
  if (!INVOKE_CHANNELS.has(channel)) {
    console.warn(`[Preload] invoke 通道不在白名单: ${channel}`)
    return Promise.reject(new Error(`通道 ${channel} 不在白名单中`))
  }
  return ipcRenderer.invoke(channel, ...args)
}

function send<C extends IpcSendChannel>(channel: C, ...args: IpcSendArgs<C>): void {
  if (!SEND_CHANNELS.has(channel)) {
    console.warn(`[Preload] send 通道不在白名单: ${channel}`)
    return
  }
  ipcRenderer.send(channel, ...args)
}

function on<C extends IpcEventChannel>(
  channel: C,
  callback: (...args: IpcEventArgs<C>) => void,
): () => void {
  if (!ON_CHANNELS.has(channel)) {
    console.warn(`[Preload] on 通道不在白名单: ${channel}`)
    return () => {}
  }
  const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
    callback(...(args as IpcEventArgs<C>))
  }
  ipcRenderer.on(channel, subscription)
  return () => {
    ipcRenderer.removeListener(channel, subscription)
  }
}

// ---------------------------------------------------------------------------
// 暴露给渲染进程的 API
// ---------------------------------------------------------------------------
// 渲染进程通过 window.electronAPI.xxx() 调用
// 所有 IPC 通信都通过这里，不直接暴露 ipcRenderer（安全原则）
// ---------------------------------------------------------------------------

export const electronAPI = {
  // --- 自定义协议 ---
  getAudioUrl,
  getCoverUrl,
  getAvatarUrl,

  // --- 窗口控制 ---
  minimize: () => send('window:minimize'),
  maximize: () => send('window:maximize'),
  close: () => send('window:close'),
  setAlwaysOnTop: (flag: boolean) => send('window:set-always-on-top', flag),
  getFeatureFlags: () => invoke('config:getFeatureFlags'),

  // --- IPC 通信 ---
  // invoke: 双向通信（渲染 → 主进程 → 返回结果）
  // send: 单向通信（渲染 → 主进程，不等返回）
  // on: 监听主进程推送的消息

  invoke,

  // 单向发送（渲染 → 主进程）
  send,

  // 监听主进程推送的消息
  on,
} satisfies ElectronAPI

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
