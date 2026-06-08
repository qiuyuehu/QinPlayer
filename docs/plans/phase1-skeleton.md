# Phase 1: 骨架期（MVP Core）

> 跑通 Vite + Electron + React + TS 基础工程，实现无边框窗口、自定义协议、Web Audio API 基础播放。

---

## Task 1.1: 初始化项目（electron-vite）

**目标**：创建 Electron + React + Vite + TypeScript 项目骨架

**文件**：
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`（主进程 TS 配置）
- Create: `index.html`
- Create: `electron/main.ts`（主进程入口，TypeScript）
- Create: `electron/preload.ts`（预加载脚本，TypeScript）
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles/global.css`
- Create: `src/types/index.ts`（公共类型定义）
- Create: `src/types/ipc.ts`（IPC 通道类型映射）

**步骤**：

1. 用 `npm create @quick-start/electron` 初始化项目骨架（选择 React + TypeScript 模板）
2. 配置 `electron.vite.config.ts`（主进程 + preload + 渲染进程三入口）
3. 创建 `src/types/index.ts` — 定义 Track、Playlist、Album 等核心类型
4. 创建 `src/types/ipc.ts` — 定义 IpcChannels 映射（参考 ARCHITECTURE.md）
5. 创建 `src/App.tsx`（根组件，占位）
6. 创建 `src/styles/global.css`（基础样式）
7. 运行 `npm install`
8. 运行 `npm run dev` 验证窗口弹出
9. 验证主进程 .ts 文件被正确编译为 .js（检查 out 目录）

**验证**：窗口弹出，显示 "QinPlayer" 占位文字，主进程 TypeScript 编译正常

---

## Task 1.2: 无边框窗口 + 暗色标题栏

**目标**：去掉原生标题栏，用自定义标题栏，暗色主题

**文件**：
- Modify: `electron/main.ts`（BrowserWindow 配置）
- Create: `src/components/TitleBar.tsx`（自定义标题栏组件）
- Modify: `src/App.tsx`（引入 TitleBar）
- Modify: `src/styles/global.css`（标题栏样式）

**步骤**：

1. `electron/main.js` — BrowserWindow 添加：
   ```js
   titleBarStyle: 'hidden',
   titleBarOverlay: { color: '#0a0a0f', symbolColor: '#e8e8ef', height: 36 },
   backgroundColor: '#0a0a0f',
   ```
2. 创建 `TitleBar.tsx` — 最小化/最大化/关闭按钮
3. 关闭按钮点击 → 最小化到托盘（Phase 3 实现托盘，暂时直接隐藏窗口）
4. `-webkit-app-region: drag` 实现拖拽，按钮设 `no-drag`
5. 验证：窗口无原生标题栏，自定义标题栏可拖拽，按钮可点击

**验证**：无原生标题栏，自定义标题栏可拖拽，最小化/关闭按钮工作

---

## Task 1.3: 布局框架（左右分栏）

**目标**：搭建左侧导航栏 + 右侧内容区 + 底部播放控制条的布局

**文件**：
- Create: `src/components/Sidebar.tsx`（左侧导航栏）
- Create: `src/components/Content.tsx`（右侧内容区）
- Create: `src/components/PlayerBar.tsx`（底部播放控制条占位）
- Modify: `src/App.tsx`（组装布局）
- Modify: `src/styles/global.css`（布局样式）

**步骤**：

1. `App.tsx` — 三段式布局：TitleBar + (Sidebar + Content) + PlayerBar
2. `Sidebar.tsx` — 导航项列表（搜索、最近播放、本地音乐、专辑、歌单、我喜欢的、设置）
3. `Content.tsx` — 占位，显示当前选中的导航项名称
4. `PlayerBar.tsx` — 占位，显示 "播放控制条"
5. CSS Grid 或 Flexbox 实现响应式布局
6. 左侧宽度固定 ~220px，右侧自适应

**验证**：窗口显示左侧导航栏 + 右侧内容区 + 底部控制条，布局稳定

---

## Task 1.4: 主题系统基础

**目标**：实现亮色/暗色/跟随系统三套主题，CSS 变量驱动

**文件**：
- Create: `src/styles/themes.css`（CSS 变量定义）
- Modify: `src/styles/global.css`（引入 themes.css）
- Create: `src/hooks/useTheme.ts`（主题切换 hook）
- Modify: `src/App.tsx`（应用主题）

**步骤**：

1. `themes.css` — 定义 CSS 变量：
   ```css
   [data-theme="dark"] {
     --bg-primary: #121212;
     --bg-secondary: #1a1a1a;
     --text-primary: #e0e0e0;
     --text-secondary: #999999;
     --accent: #6366f1;
   }
   [data-theme="light"] {
     --bg-primary: #ffffff;
     --bg-secondary: #f5f5f7;
     --text-primary: #1d1d1f;
     --text-secondary: #86868b;
     --accent: #6366f1;
   }
   ```
2. `useTheme.ts` — 读取/设置 `data-theme` 属性，支持 'dark' | 'light' | 'system'
3. `App.tsx` — 根元素设置 `data-theme`
4. 验证：手动切换主题，UI 颜色变化

**验证**：切换 dark/light/system，所有区域颜色正确切换

---

## Task 1.5: Zustand Store 初始化

**目标**：创建状态管理 Store，切片设计

**文件**：
- Create: `src/stores/playerStore.ts`（播放控制状态）
- Create: `src/stores/uiStore.ts`（UI 状态）

**步骤**：

1. `playerStore.ts`：
   ```ts
   // 播放控制 Store — 管理低频状态（播放/暂停、当前曲目、音量、模式）
   // 注意：currentTime 不放这里，高频更新会导致 re-render
   interface PlayerState {
     isPlaying: boolean
     currentTrack: Track | null
     playlist: Track[]
     volume: number
     playMode: 'sequential' | 'loop' | 'shuffle'
     // actions
     setPlaying: (v: boolean) => void
     setCurrentTrack: (t: Track | null) => void
     setVolume: (v: number) => void
     setPlayMode: (m: PlayMode) => void
   }
   ```
2. `uiStore.ts`：
   ```ts
   // UI Store — 管理界面状态
   interface UIState {
     activeNav: string        // 当前选中的导航项
     isMiniMode: boolean      // 迷你模式
     theme: 'dark' | 'light' | 'system'
     sidebarCollapsed: boolean
     // actions
     setActiveNav: (nav: string) => void
     setMiniMode: (v: boolean) => void
     setTheme: (t: Theme) => void
   }
   ```
3. 导出 Store，后续任务使用

**验证**：Store 可在组件中调用，状态变更触发 re-render

---

## Task 1.6: 导航栏交互

**目标**：点击导航项切换右侧内容区

**文件**：
- Modify: `src/components/Sidebar.tsx`（点击事件）
- Modify: `src/components/Content.tsx`（根据 activeNav 渲染不同页面）
- Create: `src/pages/LocalMusic.tsx`（本地音乐页面占位）
- Create: `src/pages/Albums.tsx`（专辑页面占位）
- Create: `src/pages/Playlists.tsx`（歌单页面占位）
- Create: `src/pages/RecentlyPlayed.tsx`（最近播放占位）
- Create: `src/pages/Liked.tsx`（我喜欢的占位）
- Create: `src/pages/Settings.tsx`（设置页面占位）
- Create: `src/pages/Search.tsx`（搜索页面占位）

**步骤**：

1. `Sidebar.tsx` — 每个导航项 onClick 设置 `uiStore.setActiveNav('xxx')`
2. `Content.tsx` — 根据 `activeNav` 条件渲染对应页面组件
3. 创建 7 个页面占位组件，每个只显示页面标题
4. 高亮当前选中的导航项

**验证**：点击不同导航项，右侧内容区切换显示对应页面标题

---

## Task 1.7: 自定义协议 qinplayer://

**目标**：注册自定义协议，主进程拦截请求返回本地音频文件

**文件**：
- Modify: `electron/main.ts`（注册 protocol.handle）
- Modify: `electron/preload.ts`（暴露音频 URL 构造方法）

> ⚠️ 两个暗礁必须在这里规避：
> 1. 协议必须在 app.whenReady() 之前注册为特权协议（见下方代码）
> 2. protocol.handle 必须处理 Range Requests（拖动进度条需要 206 响应）

**步骤**：

1. `main.ts` — **在 `app.whenReady()` 之前**注册特权协议：
   ```ts
   // 必须在 app.whenReady 之前！否则 Web Audio API 会报跨域静音
   protocol.registerSchemesAsPrivileged([
     {
       scheme: 'qinplayer',
       privileges: {
         secure: true,
         supportFetchAPI: true,
         corsEnabled: true,
         stream: true
       }
     }
   ])
   ```

2. `main.ts` — 在 `app.whenReady()` 中注册协议拦截：
   ```js
   const { protocol } = require('electron')
   const fs = require('fs')
   const path = require('path')

   protocol.handle('qinplayer', (request) => {
     const url = new URL(request.url)
     const filePath = decodeURIComponent(url.searchParams.get('path') || '')

     if (!fs.existsSync(filePath)) return new Response('Not Found', { status: 404 })

     const stat = fs.statSync(filePath)
     const range = request.headers.get('range')

     if (range) {
       // 处理拖动进度条的 Range 请求
       const parts = range.replace(/bytes=/, '').split('-')
       const start = parseInt(parts[0], 10)
       const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
       const chunksize = (end - start) + 1
       const stream = fs.createReadStream(filePath, { start, end })
       const webStream = require('stream').Readable.toWeb(stream)
       return new Response(webStream, {
         status: 206,
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
3. `preload.ts` — 暴露方法：
   ```js
   contextBridge.exposeInMainWorld('electronAPI', {
     // 将本地文件路径转为自定义协议 URL
     getAudioUrl: (filePath) => `qinplayer://audio?path=${encodeURIComponent(filePath)}`
   })
   ```
4. 验证：在渲染进程中用 `<audio src="qinplayer://audio?path=...">` 能播放本地文件，拖动进度条正常

**验证**：audio 标签通过自定义协议能加载并播放本地 mp3 文件，拖动进度条不卡顿不从头播放

---

## Task 1.8: Web Audio API 播放引擎

**目标**：封装 Web Audio API 播放器核心，支持播放/暂停/音量

**文件**：
- Create: `src/utils/AudioEngine.ts`（播放引擎封装）

> ⚠️ AudioContext 解锁：用户第一次交互（点击播放按钮）后必须调 `audioContext.resume()`，否则静音。

**步骤**：

1. `AudioEngine.ts` — 封装类：
   ```ts
   // 播放引擎 — 基于 Web Audio API
   // 使用 GainNode 控制音量，预留淡入淡出接口
   class AudioEngine {
     private audioContext: AudioContext
     private gainNode: GainNode
     private audioElement: HTMLAudioElement
     private sourceNode: MediaElementAudioSourceNode

     constructor() {
       this.audioContext = new AudioContext()
       this.gainNode = this.audioContext.createGain()
       this.gainNode.connect(this.audioContext.destination)
     }

     // 加载音频（通过自定义协议）
     load(protocolUrl: string): void

     // 播放（必须先解锁 AudioContext）
     async play(): Promise<void> {
       if (this.audioContext.state === 'suspended') {
         await this.audioContext.resume()  // 关键：用户交互后解锁
       }
       return this.audioElement.play()
     }

     // 暂停
     pause(): void

     // 设置音量 (0-1)
     setVolume(vol: number): void

     // 获取当前播放时间
     get currentTime(): number

     // 设置播放位置（拖动进度条）
     set currentTime(t: number)

     // 获取总时长
     get duration(): number

     // 淡入淡出（Phase 3 实现）
     fadeIn(duration: number): void
     fadeOut(duration: number): void
   }
   ```
2. 方法实现：play/pause/setVolume 基础功能
3. currentTime 用 `useRef` + `timeupdate` 在组件层处理，不走 Zustand

**验证**：能加载本地 mp3，播放/暂停/调音量正常

---

## Task 1.9: 播放控制条 UI

**目标**：底部播放控制条，显示歌曲信息 + 播放按钮 + 进度条 + 音量

**文件**：
- Modify: `src/components/PlayerBar.tsx`（完整实现）
- Modify: `src/styles/global.css`（播放控制条样式）

**步骤**：

1. `PlayerBar.tsx` 布局：
   - 左侧：封面缩略图 + 歌名 + 歌手
   - 中间：上一首 / 播放暂停 / 下一首 + 进度条
   - 右侧：播放模式切换 + 音量滑块
2. 播放按钮 — 使用 `playerStore.isPlaying` 状态切换图标
3. 进度条 — `useRef` + `timeupdate` 直接更新 DOM，不走 Zustand
4. 音量滑块 — `playerStore.setVolume` → `audioEngine.setVolume`
5. 播放模式 — 顺序/单曲循环/随机，点击切换

**验证**：控制条 UI 完整，按钮可点击，进度条可拖动

---

## Task 1.10: 导入音乐文件夹

**目标**：选择文件夹，扫描其中的音频文件

**文件**：
- Modify: `electron/main.ts`（IPC: 选择文件夹）
- Modify: `electron/preload.ts`（暴露选择文件夹方法）
- Modify: `src/pages/LocalMusic.tsx`（文件夹选择 UI）

> ⚠️ 绝对不能用 readdirSync/statSync！会阻塞事件循环导致窗口"未响应"。
> 必须用 fs/promises 异步 API。

**步骤**：

1. `main.ts` — IPC Handler（**必须异步**）：
   ```js
   const { dialog } = require('electron')

   // 打开文件夹选择对话框
   ipcMain.handle('select-folder', async () => {
     const result = await dialog.showOpenDialog(mainWindow, {
       properties: ['openDirectory']
     })
     if (result.canceled) return null
     return result.filePaths[0]
   })

   // 扫描文件夹（异步，不阻塞 UI）
   import { readdir, stat } from 'fs/promises'

   async function scanDirectory(dir: string, fileList: string[] = []): Promise<string[]> {
     const files = await readdir(dir)
     for (const file of files) {
       const fullPath = path.join(dir, file)
       const fileStat = await stat(fullPath)
       if (fileStat.isDirectory()) {
         await scanDirectory(fullPath, fileList)
       } else {
         const ext = path.extname(fullPath).toLowerCase()
         if (['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac', '.wma'].includes(ext)) {
           fileList.push(fullPath)
         }
       }
     }
     return fileList
   }

   ipcMain.handle('scan-folder', async (event, folderPath) => {
     try {
       const files = await scanDirectory(folderPath)
       return { success: true, files }
     } catch (e) {
       return { success: false, files: [] }
     }
   })
   ```
2. `preload.ts` — 暴露 `selectFolder()` 和 `scanFolder(path)`
3. `LocalMusic.tsx` — "添加音乐文件夹"按钮，点击后调用 IPC
4. 扫描结果暂存本地 state，Phase 2 存入 SQLite

**验证**：能选择文件夹，扫描 2000+ 首歌时不卡 UI，音频文件列表正常显示

---

## Task 1.11: 基础歌曲列表渲染

**目标**：将扫描到的歌曲显示为列表（序号、歌名、文件名、时长）

**文件**：
- Create: `src/components/SongList.tsx`（歌曲列表组件）
- Modify: `src/pages/LocalMusic.tsx`（使用 SongList）

**步骤**：

1. `SongList.tsx` — 列表视图：
   - 表头：序号 / 歌名 / 歌手 / 专辑 / 时长
   - 行：每首歌一行，点击播放
   - 双击播放 + 高亮当前播放的歌曲
2. 点击歌曲 → `playerStore.setCurrentTrack(track)` → `audioEngine.load(url)` → `audioEngine.play()`
3. 歌曲信息暂用文件名，Phase 2 解析 ID3 标签

**验证**：歌曲列表渲染，点击可播放，当前歌曲高亮

---

## Task 1.12: 播放控制条与播放引擎联动

**目标**：控制条的按钮实际控制播放引擎

**文件**：
- Modify: `src/components/PlayerBar.tsx`（绑定 AudioEngine）
- Modify: `src/App.tsx`（初始化 AudioEngine，全局可用）

**步骤**：

1. `App.tsx` — 创建 AudioEngine 实例，通过 Context 或 ref 传递
2. `PlayerBar.tsx` — 播放/暂停按钮调用 `audioEngine.play()/pause()`
3. 进度条拖动 → `audioEngine.currentTime = value`
4. 音量滑块 → `audioEngine.setVolume(value)`
5. 上一首/下一首 → 从 playlist 中切换 currentTrack

**验证**：播放控制条完整控制播放，进度条实时更新

---

## Task 1.13: 音频输出设备切换

**目标**：在设置页面选择音频输出设备

**文件**：
- Modify: `electron/main.js`（IPC: 获取音频设备列表）
- Modify: `electron/preload.js`（暴露方法）
- Modify: `src/pages/Settings.tsx`（设备选择 UI）
- Modify: `src/utils/AudioEngine.ts`（setSinkId）

**步骤**：

1. `main.js` — 通过 `session.getAllInstances()` 获取音频设备（或让渲染进程直接用 `navigator.mediaDevices.enumerateDevices()`）
2. `AudioEngine.ts` — 添加 `setOutputDevice(deviceId: string)` 方法，使用 `AudioContext.setSinkId()`
3. `Settings.tsx` — "播放" 分类下添加设备下拉框

**验证**：能列出音频设备，切换后声音从对应设备输出

---

## Task 1.14: Phase 1 收尾 — 代码清理 + 注释

**目标**：确保所有代码有中文注释，结构清晰

**文件**：所有 Phase 1 创建的文件

**步骤**：

1. 每个文件顶部添加文件说明注释
2. 关键函数/类添加 JSDoc 注释
3. 复杂逻辑添加行内注释
4. 检查 TypeScript 类型定义是否完整
5. 运行 `npx tsc --noEmit` 验证无类型错误

**验证**：tsc 无错误，代码注释完整

---

## Task 1.15: Phase 1 提交

**目标**：Git 提交 Phase 1 所有代码

**步骤**：

1. `git init`（如果是新仓库）
2. 创建 `.gitignore`（node_modules, dist, release, .hermes）
3. `git add . && git commit -m "feat: Phase 1 - 骨架期完成"`
4. 不推送到远程，等主人测试确认

**验证**：git log 显示提交记录

---

*Phase 1 完成后，进入 Phase 2 数据期*
