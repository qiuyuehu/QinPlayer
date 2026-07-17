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
  | 'profile'
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
  profile: boolean
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

export type CloseBehavior = 'minimize' | 'exit' | 'ask'
export type CloseDecision = 'minimize' | 'exit' | 'cancel'

export interface CloseResponse {
  requestId: string
  decision: CloseDecision
  remember: boolean
}

export type NativeTrackMenuAction =
  | 'play'
  | 'insert-next'
  | 'remove-priority'
  | 'remove-playlist'
  | 'open-location'
  | 'show-info'

export interface NativeTrackMenuEntry {
  action: NativeTrackMenuAction
  enabled: boolean
}

export interface NativeTrackMenuDisplayEntry extends NativeTrackMenuEntry {
  label: string
}

export interface NativeTrackMenuWindowInit {
  entries: NativeTrackMenuDisplayEntry[]
  theme: 'dark' | 'light'
  reducedMotion: boolean
}

export function normalizeCloseBehavior(value: unknown): CloseBehavior {
  return value === 'exit' || value === 'ask' ? value : 'minimize'
}

export interface ListeningDay {
  date: string
  seconds: number
}

export interface ListeningRankingEntry {
  track: Track
  playCount: number
}

// ---------------------------------------------------------------------------
// IPC 三方向契约
// ---------------------------------------------------------------------------

export type ChannelSpec<Args extends unknown[], Result> = {
  args: Args
  result: Result
}

export type ScanFolderResult =
  | { success: true }
  | { success: false; error: string }

export type EqSaveResult =
  | { success: true }
  | { success: false; error: string }

export type DatabaseExportResult =
  | { success: true; path: string }
  | { success: false; canceled: true }
  | { success: false; error: string }

export interface DatabaseImportResult {
  success: boolean
  error?: string
  fatal?: boolean
}

/** Worker 入库后立即推送的原始扫描结果，不伪装成带数据库 ID 的 Track。 */
export interface ScanSongFoundPayload {
  filePath: string
  fileName: string
  title: string | null
  artist: string | null
  album: string | null
  duration: number | null
  coverPath: string | null
  mtime: number
}

export interface ScanProgressPayload {
  percent: number
  currentFile: string
  processed: number
  total: number
}

export interface MainWindowInvokeChannels {
  'config:getFeatureFlags': ChannelSpec<[], FeatureFlags>
  'listening:addSeconds': ChannelSpec<[input: { date: string; seconds: number }], void>
  'listening:getDays': ChannelSpec<[], ListeningDay[]>
  'listening:getRanking': ChannelSpec<[options: { limit: number }], ListeningRankingEntry[]>
  'context-menu:show-track': ChannelSpec<[
    request: {
      entries: NativeTrackMenuEntry[]
      theme: 'dark' | 'light'
      reducedMotion: boolean
    },
  ], NativeTrackMenuAction | null>
  'select-folder': ChannelSpec<[], string | null>
  'scan-folder': ChannelSpec<[folderPath: string], ScanFolderResult>
  'songs:getAll': ChannelSpec<[], Track[]>
  'songs:search': ChannelSpec<[options: { keyword: string }], Track[]>
  'songs:like': ChannelSpec<[options: { songId: number }], void>
  'songs:unlike': ChannelSpec<[options: { songId: number }], void>
  'songs:getLiked': ChannelSpec<[], Track[]>
  'songs:getRecent': ChannelSpec<[], Track[]>
  'songs:updatePlayCount': ChannelSpec<[options: { songId: number }], void>
  'songs:recordPlay': ChannelSpec<[options: { songId: number }], void>
  'songs:isLiked': ChannelSpec<[options: { songId: number }], boolean>
  'songs:deleteAll': ChannelSpec<[], { deleted: number }>
  'playlists:create': ChannelSpec<[options: { name: string }], Playlist>
  'playlists:rename': ChannelSpec<[options: { id: number; name: string }], void>
  'playlists:delete': ChannelSpec<[options: { id: number }], void>
  'playlists:getAll': ChannelSpec<[], Playlist[]>
  'playlists:getSongs': ChannelSpec<[
    options: { id: number; sortBy: 'added' | 'playCount'; order: 'asc' | 'desc' },
  ], Track[]>
  'playlists:addSong': ChannelSpec<[options: { playlistId: number; songId: number }], void>
  'playlists:removeSong': ChannelSpec<[options: { playlistId: number; songId: number }], void>
  'playlists:isInPlaylist': ChannelSpec<[options: { playlistId: number; songId: number }], boolean>
  'settings:get': ChannelSpec<[options: { key: string }], string | null>
  'settings:set': ChannelSpec<[options: { key: string; value: string }], void>
  'settings:getFolders': ChannelSpec<[], string[]>
  'settings:addFolder': ChannelSpec<[], string | null>
  'settings:removeFolder': ChannelSpec<[options: { path: string }], { deletedSongs: number }>
  'settings:pickAvatar': ChannelSpec<[], string | null>
  'eq:get': ChannelSpec<[], string | null>
  'eq:save': ChannelSpec<[payload: { gains: number[] }], EqSaveResult>
  'open-folder': ChannelSpec<[folderPath: string], void>
  'open-file-location': ChannelSpec<[filePath: string], void>
  'read-lrc-file': ChannelSpec<[lrcPath: string], string | null>
  'db:export': ChannelSpec<[], DatabaseExportResult>
  'db:import-select': ChannelSpec<[], string | null>
  'db:import-apply': ChannelSpec<[backupPath: string], DatabaseImportResult>
  'get-auto-launch': ChannelSpec<[], boolean>
}

export interface ContextMenuInvokeChannels {
  'context-menu:window-get-init': ChannelSpec<[], NativeTrackMenuWindowInit | null>
  'context-menu:window-ready': ChannelSpec<[], void>
  'context-menu:window-resolve': ChannelSpec<[
    payload: { action: NativeTrackMenuAction | null },
  ], void>
}

export interface IpcChannels extends MainWindowInvokeChannels, ContextMenuInvokeChannels {}

export interface IpcSendChannels {
  'close:ready': ChannelSpec<[], void>
  'close:respond': ChannelSpec<[response: CloseResponse], void>
  'window:minimize': ChannelSpec<[], void>
  'window:maximize': ChannelSpec<[], void>
  'window:close': ChannelSpec<[], void>
  'window:set-mini-mode': ChannelSpec<[isMini: boolean], void>
  'window:set-always-on-top': ChannelSpec<[flag: boolean], void>
  'player:playing-changed': ChannelSpec<[playing: boolean], void>
  'theme-changed': ChannelSpec<[theme: 'dark' | 'light'], void>
  'set-auto-launch': ChannelSpec<[enabled: boolean], void>
}

export interface IpcEventChannels {
  'close:request': ChannelSpec<[payload: { requestId: string }], void>
  'window:maximized': ChannelSpec<[maximized: boolean], void>
  'tray:prev': ChannelSpec<[], void>
  'tray:play-pause': ChannelSpec<[], void>
  'tray:next': ChannelSpec<[], void>
  'theme:system-changed': ChannelSpec<[theme: 'dark' | 'light'], void>
  'scan:song-found': ChannelSpec<[song: ScanSongFoundPayload], void>
  'scan:progress': ChannelSpec<[progress: ScanProgressPayload], void>
  'scan:done': ChannelSpec<[result: { total: number }], void>
  'scan:error': ChannelSpec<[error: { message: string; file?: string }], void>
}

export type MainWindowInvokeChannel = keyof MainWindowInvokeChannels
export type ContextMenuInvokeChannel = keyof ContextMenuInvokeChannels
export type IpcChannel = keyof IpcChannels
export type IpcSendChannel = keyof IpcSendChannels
export type IpcEventChannel = keyof IpcEventChannels

export type MainWindowInvokeArgs<C extends MainWindowInvokeChannel> = MainWindowInvokeChannels[C]['args']
export type MainWindowInvokeResult<C extends MainWindowInvokeChannel> = MainWindowInvokeChannels[C]['result']
export type ContextMenuInvokeArgs<C extends ContextMenuInvokeChannel> = ContextMenuInvokeChannels[C]['args']
export type ContextMenuInvokeResult<C extends ContextMenuInvokeChannel> = ContextMenuInvokeChannels[C]['result']
export type IpcArgs<C extends IpcChannel> = IpcChannels[C]['args']
export type IpcReturn<C extends IpcChannel> = IpcChannels[C]['result']
export type IpcSendArgs<C extends IpcSendChannel> = IpcSendChannels[C]['args']
export type IpcEventArgs<C extends IpcEventChannel> = IpcEventChannels[C]['args']

export const MAIN_WINDOW_INVOKE_CHANNELS = {
  'config:getFeatureFlags': true,
  'listening:addSeconds': true,
  'listening:getDays': true,
  'listening:getRanking': true,
  'context-menu:show-track': true,
  'select-folder': true,
  'scan-folder': true,
  'songs:getAll': true,
  'songs:search': true,
  'songs:like': true,
  'songs:unlike': true,
  'songs:getLiked': true,
  'songs:getRecent': true,
  'songs:updatePlayCount': true,
  'songs:recordPlay': true,
  'songs:isLiked': true,
  'songs:deleteAll': true,
  'playlists:create': true,
  'playlists:rename': true,
  'playlists:delete': true,
  'playlists:getAll': true,
  'playlists:getSongs': true,
  'playlists:addSong': true,
  'playlists:removeSong': true,
  'playlists:isInPlaylist': true,
  'settings:get': true,
  'settings:set': true,
  'settings:getFolders': true,
  'settings:addFolder': true,
  'settings:removeFolder': true,
  'settings:pickAvatar': true,
  'eq:get': true,
  'eq:save': true,
  'open-folder': true,
  'open-file-location': true,
  'read-lrc-file': true,
  'db:export': true,
  'db:import-select': true,
  'db:import-apply': true,
  'get-auto-launch': true,
} as const satisfies Record<MainWindowInvokeChannel, true>

export const CONTEXT_MENU_INVOKE_CHANNELS = {
  'context-menu:window-get-init': true,
  'context-menu:window-ready': true,
  'context-menu:window-resolve': true,
} as const satisfies Record<ContextMenuInvokeChannel, true>

export const MAIN_WINDOW_SEND_CHANNELS = {
  'close:ready': true,
  'close:respond': true,
  'window:minimize': true,
  'window:maximize': true,
  'window:close': true,
  'window:set-mini-mode': true,
  'window:set-always-on-top': true,
  'player:playing-changed': true,
  'theme-changed': true,
  'set-auto-launch': true,
} as const satisfies Record<IpcSendChannel, true>

export const MAIN_WINDOW_EVENT_CHANNELS = {
  'close:request': true,
  'window:maximized': true,
  'tray:prev': true,
  'tray:play-pause': true,
  'tray:next': true,
  'theme:system-changed': true,
  'scan:song-found': true,
  'scan:progress': true,
  'scan:done': true,
  'scan:error': true,
} as const satisfies Record<IpcEventChannel, true>
