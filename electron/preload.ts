// =============================================================================
// QinPlayer — 预加载脚本
// =============================================================================
// 职责：通过 contextBridge 安全地将主进程 API 暴露给渲染进程
// 注意：preload 脚本在渲染进程的沙箱中运行，只能访问有限的 Node.js API
// =============================================================================

import { contextBridge, ipcRenderer } from 'electron'

// ---------------------------------------------------------------------------
// IPC 通道白名单（安全防护）
// ---------------------------------------------------------------------------
// invoke/send/on 只允许调用白名单内的通道，防止 XSS 注入后任意调用主进程
// ---------------------------------------------------------------------------

const INVOKE_CHANNELS = new Set([
  // 配置
  'config:getFeatureFlags',
  // 听歌统计
  'listening:addSeconds', 'listening:getDays', 'listening:getRanking',
  // 设置
  'settings:get', 'settings:set',
  'settings:getFolders', 'settings:addFolder', 'settings:removeFolder',
  'settings:pickAvatar',
  // 歌曲
  'songs:getAll', 'songs:getLiked', 'songs:getRecent', 'songs:search',
  'songs:recordPlay', 'songs:updatePlayCount', 'songs:like', 'songs:unlike',
  'songs:isLiked', 'songs:deleteAll',
  // 歌单
  'playlists:getAll', 'playlists:getSongs', 'playlists:create',
  'playlists:delete', 'playlists:addSong', 'playlists:removeSong',
  'playlists:rename', 'playlists:isInPlaylist',
  // 文件/扫描
  'select-folder', 'scan-folder', 'open-folder', 'open-file-location',
  'read-lrc-file',
  // 数据库
  'db:export', 'db:import-select', 'db:import-apply',
  // 均衡器
  'eq:get', 'eq:save',
  // 其他
  'get-auto-launch',
])

const SEND_CHANNELS = new Set([
  'window:minimize', 'window:maximize', 'window:close',
  'window:set-mini-mode', 'window:set-always-on-top',
  'player:playing-changed',
  'theme-changed',
  'set-auto-launch',
])

const ON_CHANNELS = new Set([
  'window:maximized',
  'tray:play-pause', 'tray:prev', 'tray:next',
  'theme:system-changed',
  'scan:song-found', 'scan:progress', 'scan:done', 'scan:error',
])

// ---------------------------------------------------------------------------
// 暴露给渲染进程的 API
// ---------------------------------------------------------------------------
// 渲染进程通过 window.electronAPI.xxx() 调用
// 所有 IPC 通信都通过这里，不直接暴露 ipcRenderer（安全原则）
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld('electronAPI', {
  // --- 自定义协议 ---
  // 将本地文件路径转换为 qinplayer:// 协议 URL
  getAudioUrl: (filePath: string): string => {
    return `qinplayer://audio?path=${encodeURIComponent(filePath)}`
  },
  getCoverUrl: (filePath: string): string => {
    return `qinplayer://cover?path=${encodeURIComponent(filePath)}`
  },

  // --- 窗口控制 ---
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  setAlwaysOnTop: (flag: boolean) => ipcRenderer.send('window:set-always-on-top', flag),
  getFeatureFlags: () => ipcRenderer.invoke('config:getFeatureFlags'),

  // --- IPC 通信 ---
  // invoke: 双向通信（渲染 → 主进程 → 返回结果）
  // send: 单向通信（渲染 → 主进程，不等返回）
  // on: 监听主进程推送的消息

  invoke: (channel: string, ...args: unknown[]) => {
    if (!INVOKE_CHANNELS.has(channel)) {
      console.warn(`[Preload] invoke 通道不在白名单: ${channel}`)
      return Promise.reject(new Error(`通道 ${channel} 不在白名单中`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  // 单向发送（渲染 → 主进程）
  send: (channel: string, ...args: unknown[]) => {
    if (!SEND_CHANNELS.has(channel)) {
      console.warn(`[Preload] send 通道不在白名单: ${channel}`)
      return
    }
    ipcRenderer.send(channel, ...args)
  },

  // 监听主进程推送的消息
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ON_CHANNELS.has(channel)) {
      console.warn(`[Preload] on 通道不在白名单: ${channel}`)
      return () => {}  // 返回空函数
    }
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
  getCoverUrl: (filePath: string) => string
  minimize: () => void
  maximize: () => void
  close: () => void
  setAlwaysOnTop: (flag: boolean) => void
  getFeatureFlags: () => Promise<unknown>
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  send: (channel: string, ...args: unknown[]) => void
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
