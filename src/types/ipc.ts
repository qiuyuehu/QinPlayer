// =============================================================================
// QinPlayer — IPC 通道类型映射
// =============================================================================
// 禁止裸字符串通道名和 any 返回值
// 所有 IPC 通道在这里定义类型映射，实现编译期类型安全
// =============================================================================

import type { Track, Playlist } from './index'

// ---------------------------------------------------------------------------
// Feature Flags
// ---------------------------------------------------------------------------

export type FeatureFlagKey =
  | 'playback'
  | 'equalizer'
  | 'lyrics'
  | 'albums'
  | 'recent'
  | 'liked'
  | 'search'
  | 'miniMode'
  | 'tray'
  | 'playlists'
  | 'settings'
  | 'fadeEffect'
  | 'mediaSession'
  | 'queuePanel'
  | 'lyricsMoreLines'
  | 'windowSizePersist'

export interface FeatureFlags {
  playback: boolean
  equalizer: boolean
  lyrics: boolean
  albums: boolean
  recent: boolean
  liked: boolean
  search: boolean
  miniMode: boolean
  tray: boolean
  playlists: boolean
  settings: boolean
  fadeEffect: boolean
  mediaSession: boolean
  queuePanel: boolean
  lyricsMoreLines: boolean
  windowSizePersist: boolean
}

// ---------------------------------------------------------------------------
// IPC 通道定义
// ---------------------------------------------------------------------------
// 每个通道定义 args（参数类型）和 return（返回值类型）
// 主进程 ipcMain.handle 和渲染进程 ipcRenderer.invoke 共享此类型
// ---------------------------------------------------------------------------

export interface IpcChannels {
  // --- 配置 ---
  'config:getFeatureFlags': {
    args: void
    return: FeatureFlags
  }

  // --- 文件夹管理 ---
  'select-folder': {
    args: void
    return: string | null
  }
  'scan-folder': {
    args: { folderPath: string }
    return: void  // 异步推送进度，不直接返回结果
  }

  // --- 歌曲 CRUD ---
  'songs:getAll': {
    args: void
    return: Track[]
  }
  'songs:search': {
    args: { keyword: string }
    return: Track[]
  }
  'songs:like': {
    args: { songId: number }
    return: void
  }
  'songs:unlike': {
    args: { songId: number }
    return: void
  }
  'songs:getLiked': {
    args: void
    return: Track[]
  }
  'songs:getRecent': {
    args: void
    return: Track[]
  }
  'songs:updatePlayCount': {
    args: { songId: number }
    return: void
  }
  'songs:recordPlay': {
    args: { songId: number }
    return: void
  }
  'songs:isLiked': {
    args: { songId: number }
    return: boolean
  }

  // --- 歌单 CRUD ---
  'playlists:create': {
    args: { name: string }
    return: Playlist
  }
  'playlists:rename': {
    args: { id: number; name: string }
    return: void
  }
  'playlists:delete': {
    args: { id: number }
    return: void
  }
  'playlists:getAll': {
    args: void
    return: Playlist[]
  }
  'playlists:getSongs': {
    args: { id: number; sortBy: string; order: string }
    return: Track[]
  }
  'playlists:addSong': {
    args: { playlistId: number; songId: number }
    return: void
  }
  'playlists:removeSong': {
    args: { playlistId: number; songId: number }
    return: void
  }
  'playlists:isInPlaylist': {
    args: { playlistId: number; songId: number }
    return: boolean
  }

  // --- 设置 ---
  'settings:get': {
    args: { key: string }
    return: string | null
  }
  'settings:set': {
    args: { key: string; value: string }
    return: void
  }
  'settings:getFolders': {
    args: void
    return: string[]
  }
  'settings:addFolder': {
    args: { path: string }
    return: void
  }
  'settings:removeFolder': {
    args: { path: string }
    return: void
  }

  // --- 均衡器 ---
  'eq:get': {
    args: void
    return: string | null  // JSON 数组字符串，如 "[0,2,4,0,0,0,0,0,0,0]" 或 null
  }
  'eq:save': {
    args: { gains: number[] }
    return: void
  }

  // --- 系统 ---
  'set-auto-launch': {
    args: { enabled: boolean }
    return: void
  }
  'get-auto-launch': {
    args: void
    return: boolean
  }
}

// ---------------------------------------------------------------------------
// 类型辅助工具
// ---------------------------------------------------------------------------

// 通道名称类型
export type IpcChannel = keyof IpcChannels

// 获取通道的参数类型
export type IpcArgs<T extends IpcChannel> = IpcChannels[T]['args']

// 获取通道的返回值类型
export type IpcReturn<T extends IpcChannel> = IpcChannels[T]['return']

// ---------------------------------------------------------------------------
// 主进程 → 渲染进程的推送通道（send/on）
// ---------------------------------------------------------------------------

export interface IpcPushChannels {
  'scan:progress': { percent: number; currentFile: string }
  'scan:song-found': Track
  'scan:done': { total: number }
  'scan:error': { message: string }
  'theme-changed': 'dark' | 'light'
  'tray:prev': void
  'tray:play-pause': void
  'tray:next': void
}

export type IpcPushChannel = keyof IpcPushChannels
