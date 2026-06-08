# QinPlayer 代码架构

> 本文档定义项目的文件组织、模块职责、数据流和通信协议。
> 开发前必读，维护时必查。

---

## 1. 目录结构

```
QinPlayer/
├── electron/                    # 主进程（TypeScript，electron-vite 编译为 CJS）
│   ├── main.ts                  # 入口协调者（生命周期、初始化顺序）
│   ├── window-manager.ts        # 窗口管理（创建、销毁、尺寸调整）
│   ├── ipc-router.ts            # IPC 路由（注册所有 ipcMain.on/handle）
│   ├── tray.ts                  # 系统托盘
│   ├── protocol.ts              # 自定义协议 qinplayer://
│   ├── preload.ts               # 预加载脚本（contextBridge 暴露 API）
│   ├── db/
│   │   ├── database.ts          # SQLite 初始化 + 表结构
│   │   ├── songs.ts             # 歌曲 CRUD
│   │   ├── playlists.ts         # 歌单 CRUD
│   │   └── settings.ts          # 设置读写
│   └── workers/
│       └── scanner.ts           # Worker Threads 媒体库扫描（只解析不写库）
│
├── src/                         # 渲染进程（React + TypeScript）
│   ├── main.tsx                 # React 入口
│   ├── App.tsx                  # 根组件（布局 + 主题 + 初始化）
│   │
│   ├── components/              # 通用组件
│   │   ├── TitleBar.tsx         # 自定义标题栏
│   │   ├── Sidebar.tsx          # 左侧导航栏
│   │   ├── Content.tsx          # 右侧内容区（路由）
│   │   ├── PlayerBar.tsx        # 底部播放控制条
│   │   ├── SongList.tsx         # 歌曲列表（复用）
│   │   ├── AlbumGrid.tsx        # 专辑网格（复用）
│   │   ├── ContextMenu.tsx      # 右键菜单（通用）
│   │   ├── CreatePlaylistDialog.tsx
│   │   ├── SongInfoDialog.tsx
│   │   ├── LyricsPanel.tsx      # 歌词滚动面板
│   │   └── MiniPlayer.tsx       # 迷你模式
│   │
│   ├── pages/                   # 页面组件（对应导航项）
│   │   ├── LocalMusic.tsx       # 本地音乐
│   │   ├── Albums.tsx           # 专辑
│   │   ├── Playlists.tsx        # 歌单列表
│   │   ├── PlaylistDetail.tsx   # 歌单详情
│   │   ├── AlbumDetail.tsx      # 专辑详情
│   │   ├── RecentlyPlayed.tsx   # 最近播放
│   │   ├── Liked.tsx            # 我喜欢的
│   │   ├── Search.tsx           # 搜索结果
│   │   ├── Lyrics.tsx           # 歌词界面
│   │   └── Settings.tsx         # 设置
│   │
│   ├── stores/                  # Zustand 状态管理
│   │   ├── playerStore.ts       # 播放控制（低频：当前曲目、音量、模式）
│   │   └── uiStore.ts           # UI 状态（导航、主题、迷你模式）
│   │
│   ├── hooks/                   # 自定义 Hooks
│   │   └── useTheme.ts          # 主题切换
│   │
│   ├── utils/                   # 工具函数
│   │   ├── AudioEngine.ts       # Web Audio API 播放引擎
│   │   ├── lrcParser.ts         # LRC 歌词解析
│   │   └── colorExtract.ts      # 封面主色提取
│   │
│   ├── types/                   # TypeScript 类型定义
│   │   └── index.ts             # 公共类型（Track, Playlist, Album 等）
│   │
│   └── styles/                  # 样式
│       ├── global.css           # 全局样式 + 布局
│       └── themes.css           # 主题 CSS 变量
│
├── assets/                      # 静态资源
│   ├── icon.ico                 # 应用图标（多尺寸）
│   └── tray-icon.png            # 托盘图标
│
├── docs/                        # 文档
│   ├── plans/                   # 执行方案
│   └── ARCHITECTURE.md          # 本文件
│
├── SPEC.md                      # 产品规格
├── PLAN.md                      # 执行方案索引
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tsconfig.node.json
```

---

## 2. 主进程模块职责

### 主进程语言：TypeScript

> 参考外部 Mentor 架构审查建议

主进程使用 TypeScript（.ts），通过 `electron-vite` 编译为 CommonJS。
主进程与渲染进程共享 `src/types/` 目录，实现端到端类型安全。

```ts
// electron/main.ts — 用 import 引入类型
import type { Track, Playlist } from '../src/types'
```

### 依赖注入模式

每个模块通过 `init(deps)` 接收依赖，不用全局变量：

```js
// 模块内部
let db = null
let getMainWindow = null

function init(deps) {
  db = deps.db
  getMainWindow = deps.getMainWindow
}

module.exports = { init, /* ... */ }
```

### 模块职责表

| 模块 | 职责 | 依赖 |
|------|------|------|
| `main.js` | 入口协调者：生命周期、初始化顺序、单实例锁 | 所有模块 |
| `window-manager.js` | 窗口创建/销毁/尺寸调整、无边框配置 | — |
| `ipc-router.js` | 注册所有 IPC 通道，分发到 db/workers | db/*, workers/*, window-manager |
| `tray.js` | 系统托盘：图标、右键菜单、点击恢复 | window-manager |
| `protocol.js` | 注册 qinplayer:// 协议，拦截请求返回音频流 | — |
| `preload.js` | contextBridge 暴露 IPC API 给渲染进程 | — |
| `db/database.js` | SQLite 初始化、表结构创建 | better-sqlite3 |
| `db/songs.js` | 歌曲 CRUD：增删改查、搜索、播放次数、收藏 | database |
| `db/playlists.js` | 歌单 CRUD：创建/删除/重命名/排序 | database |
| `db/settings.js` | 设置键值对读写、音乐文件夹管理 | database |
| `workers/scanner.js` | Worker 线程：扫描文件夹、解析 ID3、增量更新 | music-metadata |

### 初始化顺序

```
app.whenReady()
  ├─ 1. database.init()          ← 数据库最先
  ├─ 2. protocol.register()      ← 自定义协议
  ├─ 3. windowManager.init()     ← 窗口管理
  ├─ 4. ipcRouter.init()         ← IPC 路由（依赖 db + window）
  ├─ 5. tray.create()            ← 托盘（依赖 window）
  └─ 6. windowManager.create()   ← 创建主窗口
```

---

## 3. 渲染进程组件层级

```
App.tsx
├── TitleBar.tsx                    ← 标题栏（拖拽区 + 窗口控制按钮）
├── [isMiniMode ? MiniPlayer : main layout]
│   ├── Sidebar.tsx                 ← 导航栏
│   │   ├── 搜索框
│   │   ├── NavItem: 最近播放
│   │   ├── NavItem: 本地音乐
│   │   ├── NavItem: 专辑
│   │   ├── NavItem: 歌单
│   │   ├── NavItem: 我喜欢的
│   │   └── NavItem: 设置
│   │
│   └── Content.tsx                 ← 内容区（根据 activeNav 路由）
│       ├── LocalMusic.tsx → SongList.tsx
│       ├── Albums.tsx → AlbumGrid.tsx → AlbumDetail.tsx → SongList.tsx
│       ├── Playlists.tsx → PlaylistDetail.tsx → SongList.tsx
│       ├── RecentlyPlayed.tsx → SongList.tsx
│       ├── Liked.tsx → SongList.tsx
│       ├── Search.tsx → SongList.tsx
│       ├── Lyrics.tsx → LyricsPanel.tsx
│       └── Settings.tsx
│
└── PlayerBar.tsx                   ← 播放控制条（常驻底部）
    ├── 歌曲信息（封面 + 歌名 + 歌手）
    ├── 控制按钮（上一首/播放/下一首）
    ├── 进度条
    ├── 播放模式
    └── 音量滑块
```

### 组件复用规则

- `SongList.tsx` — 被 6 个页面复用（本地音乐、歌单详情、专辑详情、最近播放、收藏、搜索）
- `AlbumGrid.tsx` — 被专辑页面复用
- `ContextMenu.tsx` — 通用右键菜单，任何列表都能用
- `LyricsPanel.tsx` — 歌词滚动面板，歌词页面专用

---

## 4. 数据流设计

### 播放流程

```
用户点击歌曲
  → SongList.onClick(track)
  → playerStore.setCurrentTrack(track)
  → AudioEngine.load(qinplayer://audio?path=xxx)
  → AudioEngine.play()
  → PlayerBar 监听 isPlaying → 更新 UI
  → Media Session API 更新系统媒体信息
  → 写入 recently_played 表
```

### 进度条更新（高频，不走 Zustand）

```
AudioEngine.audioElement
  → timeupdate 事件（每秒触发约 4 次）
  → PlayerBar 内部 useRef + requestAnimationFrame 直接更新 DOM
  → 不触发 React re-render
  → 用户拖拽时才通过 Zustand Action 修改 audioEngine.currentTime
```

### 扫描流程

```
用户选择文件夹
  → 渲染进程调用 electronAPI.selectFolder()
  → 主进程打开文件夹对话框
  → 返回路径 → 渲染进程调用 electronAPI.scanFolder(path)
  → 主进程启动 Worker Threads
  → Worker 扫描 + 解析 ID3
  → Worker 通过 postMessage 发送进度/结果
  → 主进程通过 IPC 推送给渲染进程
  → 渲染进程更新进度条 + 写入数据库
```

---

## 5. IPC 通信协议

### IPC 强类型约束

> 参考外部 Mentor 架构审查建议

禁止裸字符串通道名和 any 返回值。所有 IPC 通道在 `src/types/ipc.ts` 中定义类型映射：

```ts
// src/types/ipc.ts（主进程与渲染进程共享）
import type { Track, Playlist, Album } from './index'

export interface IpcChannels {
  'select-folder': { args: void; return: string | null }
  'scan-folder': { args: { folderPath: string }; return: void }
  'songs:getAll': { args: void; return: Track[] }
  'songs:search': { args: { keyword: string }; return: Track[] }
  'songs:like': { args: { songId: number }; return: void }
  'songs:unlike': { args: { songId: number }; return: void }
  'songs:getLiked': { args: void; return: Track[] }
  'songs:getRecent': { args: void; return: Track[] }
  'playlists:create': { args: { name: string }; return: Playlist }
  'playlists:rename': { args: { id: number; name: string }; return: void }
  'playlists:delete': { args: { id: number }; return: void }
  'playlists:getAll': { args: void; return: Playlist[] }
  'playlists:getSongs': { args: { id: number; sortBy: string; order: string }; return: Track[] }
  'playlists:addSong': { args: { playlistId: number; songId: number }; return: void }
  'playlists:removeSong': { args: { playlistId: number; songId: number }; return: void }
  'settings:get': { args: { key: string }; return: string | null }
  'settings:set': { args: { key: string; value: string }; return: void }
  'settings:getFolders': { args: void; return: string[] }
  'settings:addFolder': { args: { path: string }; return: void }
  'settings:removeFolder': { args: { path: string }; return: void }
  'set-auto-launch': { args: { enabled: boolean }; return: void }
  'get-auto-launch': { args: void; return: boolean }
}

// 类型辅助工具
export type IpcChannel = keyof IpcChannels
export type IpcArgs<T extends IpcChannel> = IpcChannels[T]['args']
export type IpcReturn<T extends IpcChannel> = IpcChannels[T]['return']
```

### 渲染进程 → 主进程（invoke/handle）

| 通道 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `select-folder` | — | `string \| null` | 打开文件夹选择对话框 |
| `scan-folder` | `folderPath: string` | `void`（异步推送） | 启动 Worker 扫描 |
| `songs:getAll` | — | `Track[]` | 获取所有歌曲 |
| `songs:search` | `{ keyword: string }` | `Track[]` | 搜索歌名/歌手 |
| `songs:like` | `{ songId: number }` | `void` | 收藏 |
| `songs:unlike` | `{ songId: number }` | `void` | 取消收藏 |
| `songs:getLiked` | — | `Track[]` | 获取收藏列表 |
| `songs:getRecent` | — | `Track[]` | 最近播放 50 首 |
| `playlists:create` | `{ name: string }` | `Playlist` | 创建歌单 |
| `playlists:rename` | `{ id, name }` | `void` | 重命名 |
| `playlists:delete` | `{ id }` | `void` | 删除歌单 |
| `playlists:getAll` | — | `Playlist[]` | 所有歌单 |
| `playlists:getSongs` | `{ id, sortBy, order }` | `Track[]` | 歌单内歌曲 |
| `playlists:addSong` | `{ playlistId, songId }` | `void` | 添加歌曲到歌单 |
| `playlists:removeSong` | `{ playlistId, songId }` | `void` | 从歌单移除 |
| `settings:get` | `{ key: string }` | `string \| null` | 读取设置 |
| `settings:set` | `{ key, value }` | `void` | 写入设置 |
| `settings:getFolders` | — | `string[]` | 音乐文件夹列表 |
| `settings:addFolder` | `{ path }` | `void` | 添加文件夹 |
| `settings:removeFolder` | `{ path }` | `void` | 移除文件夹 |
| `set-auto-launch` | `{ enabled: boolean }` | `void` | 开机自启 |
| `get-auto-launch` | — | `boolean` | 查询自启状态 |

### 主进程 → 渲染进程（send/on）

| 通道 | 数据 | 说明 |
|------|------|------|
| `scan:progress` | `{ percent, currentFile }` | 扫描进度 |
| `scan:song-found` | `Track` | 发现新歌曲 |
| `scan:done` | `{ total }` | 扫描完成 |
| `scan:error` | `{ message }` | 扫描错误 |
| `theme-changed` | `'dark' \| 'light'` | 系统主题变化 |
| `tray:prev` | — | 托盘：上一首 |
| `tray:play-pause` | — | 托盘：播放/暂停 |
| `tray:next` | — | 托盘：下一首 |

---

## 6. Zustand Store 设计

### playerStore（低频状态）

```ts
interface Track {
  id: number
  filePath: string
  title: string
  artist: string
  album: string
  duration: number
  coverPath: string | null
  playCount: number
}

interface PlayerState {
  // 状态
  isPlaying: boolean
  currentTrack: Track | null
  playlist: Track[]
  volume: number              // 0-1
  playMode: 'sequential' | 'loop' | 'shuffle'

  // actions
  setPlaying: (v: boolean) => void
  setCurrentTrack: (t: Track | null) => void
  setPlaylist: (list: Track[]) => void
  setVolume: (v: number) => void
  setPlayMode: (m: PlayMode) => void
  nextTrack: () => void
  prevTrack: () => void
}
```

### uiStore（低频状态）

```ts
interface UIState {
  activeNav: string              // 当前导航项
  isMiniMode: boolean            // 迷你模式
  theme: 'dark' | 'light' | 'system'
  sidebarCollapsed: boolean

  setActiveNav: (nav: string) => void
  setMiniMode: (v: boolean) => void
  setTheme: (t: Theme) => void
  toggleSidebar: () => void
}
```

### 不放 Zustand 的状态

| 状态 | 原因 | 处理方式 |
|------|------|----------|
| `currentTime` | 高频更新（~4次/秒），会导致全量 re-render | PlayerBar 内部 useRef + timeupdate |
| `scanProgress` | 临时状态，扫描结束就不需要了 | 组件内部 useState |

---

## 7. TypeScript 类型定义

```ts
// src/types/index.ts

// 歌曲
export interface Track {
  id: number
  filePath: string
  fileName: string
  title: string
  artist: string
  album: string
  duration: number
  coverPath: string | null
  mtime: number
  playCount: number
  createdAt: string
}

// 歌单
export interface Playlist {
  id: number
  name: string
  createdAt: string
  songCount?: number
}

// 专辑
export interface Album {
  name: string
  artist: string
  coverPath: string | null
  songs: Track[]
}

// 歌词行
export interface LyricLine {
  time: number   // 秒
  text: string
}

// 播放模式
export type PlayMode = 'sequential' | 'loop' | 'shuffle'

// 主题
export type Theme = 'dark' | 'light' | 'system'

// 排序方式
export type SortBy = 'added' | 'playCount'
export type SortOrder = 'asc' | 'desc'
```

---

## 8. CSS 变量系统

```css
/* themes.css — 所有颜色通过变量引用，不要硬编码 */

[data-theme="dark"] {
  /* 背景 */
  --bg-primary: #121212;       /* 最深底色 */
  --bg-secondary: #1a1a1a;     /* 卡片/侧边栏 */
  --bg-tertiary: #2a2a2a;      /* hover/active */
  
  /* 文字 */
  --text-primary: #e0e0e0;     /* 主文字 */
  --text-secondary: #999999;   /* 次要文字 */
  --text-muted: #666666;       /* 更淡 */
  
  /* 强调色 */
  --accent: #6366f1;           /* 主强调色（靛蓝） */
  --accent-hover: #818cf8;     /* hover */
  
  /* 边框 */
  --border: #2a2a2a;
  
  /* 播放条 */
  --player-bg: #1a1a1a;
}

[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f7;
  --bg-tertiary: #e8e8ed;
  --text-primary: #1d1d1f;
  --text-secondary: #86868b;
  --text-muted: #aeaeb2;
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --border: #d2d2d7;
  --player-bg: #f5f5f7;
}
```

---

## 9. 关键设计决策记录

### SQLite 多线程安全

> ⚠️ 参考外部 Mentor 架构审查建议

`better-sqlite3` 是同步阻塞的，不支持多线程同时写入。
**黄金法则：Worker 线程绝对不允许直接操作 SQLite。**

标准数据流：
```
Worker（CPU 密集型）
  → 只负责读取文件系统、解析 ID3 标签
  → 解析完成后，将纯 JSON 数据通过 parentPort.postMessage() 发给主进程

主进程（I/O 密集型）
  → 接收 JSON 数据
  → 开启 SQLite 事务（Transaction）
  → 批量 INSERT 操作
```

### 打包后路径解析

> ⚠️ 参考外部 Mentor 架构审查建议

开发环境的 `__dirname` 在打包为 .exe（压缩进 app.asar）后会失效。

| 资源类型 | 正确路径 | 错误路径 |
|----------|----------|----------|
| 静态资源（图标、托盘图） | `path.join(app.getAppPath(), 'assets', 'icon.ico')` | `__dirname + '/assets/icon.ico'` |
| 用户数据（SQLite .db） | `path.join(app.getPath('userData'), 'qinplayer.db')` | 项目代码目录内 |
| 用户设置 | `app.getPath('userData')` | `process.cwd()` |

**关键**：数据库必须存 `app.getPath('userData')`（Windows: `AppData\Roaming\QinPlayer`），
绝对不能存项目目录，否则应用更新会丢失用户数据。

### 迷你模式：单窗口变形

> 参考外部 Mentor 架构审查建议

全局仅维护一个 BrowserWindow 实例。不销毁重建窗口（会导致 Zustand 状态丢失、IPC 复杂度翻倍、音频可能中断）。

```ts
// window-manager.ts
enterMiniMode() → win.setSize(300, 80) + win.setAlwaysOnTop(true) + IPC 通知前端切路由
exitMiniMode()  → win.setSize(1000, 680) + win.setAlwaysOnTop(false) + IPC 通知前端恢复路由
```

### 自定义协议特权注册（CORS 避坑）

> ⚠️ 参考外部 Mentor Phase 1 避坑指南

`qinplayer://` 协议必须在 `app.whenReady()` **之前**注册为特权协议，
否则 Web Audio API 的 `createMediaElementSource` 会报跨域错误并强制静音。

```ts
// electron/main.ts — 在最顶部，app.whenReady 之前
import { app, protocol } from 'electron'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'qinplayer',
    privileges: {
      secure: true,           // 视为 HTTPS 安全上下文
      supportFetchAPI: true,  // 支持 Fetch API
      corsEnabled: true,      // 允许跨域
      stream: true            // 支持流式传输（对音频极其重要）
    }
  }
])
```

### Range Requests（拖动进度条避坑）

> ⚠️ 参考外部 Mentor Phase 1 避坑指南

拖动进度条时浏览器发送 `Range: bytes=xxx-` 请求。
`protocol.handle` 必须解析 Range header，返回 206 Partial Content。

```ts
protocol.handle('qinplayer', async (request) => {
  const url = new URL(request.url)
  const filePath = decodeURIComponent(url.searchParams.get('path') || '')

  if (!fs.existsSync(filePath)) return new Response('Not Found', { status: 404 })

  const stat = fs.statSync(filePath)
  const range = request.headers.get('range')

  if (range) {
    // 解析 Range header
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
    const chunksize = (end - start) + 1

    const stream = fs.createReadStream(filePath, { start, end })
    const webStream = require('stream').Readable.toWeb(stream)

    return new Response(webStream, {
      status: 206,  // Partial Content
      headers: {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Type': 'audio/mpeg',
      }
    })
  } else {
    // 正常从头播放
    const stream = fs.createReadStream(filePath)
    const webStream = require('stream').Readable.toWeb(stream)
    return new Response(webStream, {
      headers: {
        'Content-Length': stat.size.toString(),
        'Content-Type': 'audio/mpeg'
      }
    })
  }
})
```

### 主进程异步 I/O（窗口卡死避坑）

> ⚠️ 参考外部 Mentor Phase 1 避坑指南

主进程绝对不能用 `readdirSync`/`statSync`，会阻塞事件循环导致窗口"未响应"。
即使是 Phase 1 的简单扫描，也必须用 `fs/promises` 异步 API 或 `fast-glob`。

### AudioContext 解锁

> ⚠️ 参考外部 Mentor Phase 1 避坑指南

现代浏览器（包括 Electron Chromium）要求用户交互后才能播放音频。
在 `play()` 方法中必须检查并调用 `audioContext.resume()`：

```ts
play(): Promise<void> {
  if (this.audioContext.state === 'suspended') {
    this.audioContext.resume()  // 关键：解锁音频上下文
  }
  return this.audioElement.play()
}
```

| 决策 | 选择 | 原因 |
|------|------|------|
| 主进程语言 | TypeScript + electron-vite | 端到端类型安全，编译为 CommonJS |
| 渲染进程语言 | TypeScript (.tsx) | 类型安全，IDE 补全 |
| 状态管理 | Zustand（切片） | 比 Redux 简洁，性能好 |
| 进度条更新 | useRef + timeupdate | 不放 Zustand，避免高频 re-render |
| 本地文件加载 | qinplayer:// 协议 | 绕过 CORS，支持 Range Requests |
| 媒体扫描 | Worker Threads | 不阻塞 UI |
| 数据库 | better-sqlite3 (同步) | 性能高，API 简单。Worker 只解析不写库 |
| 数据库路径 | app.getPath('userData') | 防止更新丢数据 |
| 歌词滚动 | CSS transform + GPU | 60fps，不用 scrollTop |
| 歌词背景 | 主色渐变 | 不用模糊，避免低分辨率糊感 |
| 组件路由 | 条件渲染（不用 react-router） | 单窗口应用，不需要 URL 路由 |
| 模块通信 | 依赖注入 init(deps) | 避免全局变量，方便测试 |
| 迷你模式 | 单窗口变形（setSize） | 保留 Zustand 状态，音频不中断 |
| IPC 类型 | IpcChannels 接口映射 | 编译期检查，杜绝 any |

---

*架构文档创建于 2026-06-08*
*随开发迭代更新*
