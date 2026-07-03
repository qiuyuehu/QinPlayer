# Phase 3: 打磨期（UX Polish）

> Media Session API、歌词 GPU 滚动、切歌淡入淡出、迷你模式、系统托盘、打包发布。
>
> ⚠️ Phase 3 涉及大量 OS 原生 API 与底层操作，以下暗礁必须在编码前规避。
> 技术补充来源：外部 Mentor Phase 3 避坑指南

---

## 🚨 暗礁清单（编码前必读）

### 暗礁 1：Media Session 封面图协议陷阱
- **现象**：任务栏媒体控制台歌曲名正常，但封面图空白或裂图
- **根因**：OS 原生媒体服务（Windows SMTC）不认识 `qinplayer://` 协议
- **规避**：设置 MediaMetadata 前，将封面图 fetch 转换为 Blob URL

### 暗礁 2：Canvas 提取主色的性能与跨域双重暴击
- **现象**：切歌时 UI 卡顿 100-200ms，或控制台抛 SecurityError
- **根因**：对 1000x1000 封面 getImageData + K-Means 是重 CPU 操作；Canvas 安全校验苛刻
- **规避**：缩小到 50x50 离屏 Canvas 采样 + crossOrigin='anonymous'

### 暗礁 3：SQLite 导出时 WAL 幽灵数据丢失
- **现象**：导出 .db 备份后恢复，最近数据全丢
- **根因**：WAL 模式下最新数据在 .db-wal 文件，不在 .db 里
- **规避**：导出前执行 `db.pragma('wal_checkpoint(TRUNCATE)')` 强制落盘

### 暗礁 4：迷你模式置顶与拖拽冲突
- **现象**：迷你窗口无法拖拽移动，或被其他窗口盖住
- **根因**：未开启置顶 + MiniPlayer 未设置拖拽区域
- **规避**：setAlwaysOnTop + setMinimumSize + -webkit-app-region: drag

### 暗礁 5：LRC 多时间戳格式遗漏
- **现象**：间奏重复歌词不滚动
- **根因**：`[00:12.34][00:15.67]同一句歌词` 格式只解析了第一个时间戳
- **规避**：正则 `/\\[(\\d{2}):(\\d{2})\\.(\\d{2,3})\\]/g` 提取所有时间戳，生成多条记录

### 暗礁 6：切歌淡入淡出快速点击音量归零
- **现象**：疯狂点下一首，音量永久变 0
- **根因**：多个 linearRampToValueAtTime 在 AudioContext 时间轴上打架
- **规避**：每次 fade 前调用 `gain.cancelScheduledValues(currentTime)` 清理调度

---

## Task 3.1: Media Session API

**目标**：接管系统媒体控制（任务栏 + 键盘多媒体键）

**文件**：
- Create: `src/utils/mediaSession.ts`（Media Session 管理模块）
- Modify: `src/hooks/useAudioSync.ts`（切歌时调用更新）

**步骤**：

1. 封面图转换为 Blob URL（⚠️ 暗礁 1）：
   ```ts
   async function getArtworkUrl(coverPath: string | null): Promise<string> {
     if (!coverPath) return ''  // 无封面不设置 artwork
     const url = `qinplayer://cover?path=${encodeURIComponent(coverPath)}`
     try {
       const response = await fetch(url)
       const blob = await response.blob()
       return URL.createObjectURL(blob)  // blob:http://... — OS 能识别
     } catch {
       return ''  // 降级：不显示封面
     }
   }
   ```

2. 切歌时更新 metadata：
   ```ts
   async function updateMediaSession(track: Track) {
     const artworkUrl = await getArtworkUrl(track.coverPath)
     navigator.mediaSession.metadata = new MediaMetadata({
       title: track.title,
       artist: track.artist,
       album: track.album,
       artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }] : []
     })
   }
   ```

3. 注册 action handlers（play/pause/prev/next）
4. 播放/暂停状态同步：`navigator.mediaSession.playbackState`

**验证**：键盘多媒体键可控制播放，任务栏显示歌曲信息+封面图

---

## Task 3.2: 切歌淡入淡出

**目标**：切歌时音量平滑过渡，不突兀

**文件**：
- Modify: `src/utils/AudioEngine.ts`（fadeIn/fadeOut 实现）
- Modify: `src/pages/Settings.tsx`（淡入淡出开关）

**步骤**：

1. `fadeOut(duration)`：
   ```ts
   fadeOut(duration: number = 0.5) {
     // ⚠️ 暗礁 6：先清理之前的调度，防止快速切歌音量归零
     this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime)
     this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.audioContext.currentTime)
     this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration)
   }
   ```

2. `fadeIn(duration)`：
   ```ts
   fadeIn(duration: number = 0.5) {
     this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime)
     this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime)
     this.gainNode.gain.linearRampToValueAtTime(this._volume, this.audioContext.currentTime + duration)
   }
   ```

3. 切歌流程：fadeOut → 切换歌曲 → load → play → fadeIn
4. 设置页面可开关淡入淡出（持久化到 settings 表）

**验证**：切歌时音量平滑过渡，快速连点下一首不会音量归零

---

## Task 3.3: 歌词解析

**目标**：解析 .lrc 文件为时间轴数组

**文件**：
- Create: `src/utils/lrcParser.ts`（LRC 解析器）

**步骤**：

1. 解析标准 LRC 格式：`[00:12.34]第一行歌词`
2. ⚠️ 暗礁 5：支持多时间戳格式 `[00:12.34][00:15.67]同一句歌词`：
   ```ts
   // 正则提取所有时间戳
   const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g
   // 对每个时间戳生成一条独立的 LyricLine 记录
   ```
3. 支持偏移量：`[offset:500]`
4. 返回结构：`LyricLine { time: number; text: string }[]`
5. 按时间排序

**验证**：解析含多时间戳的 .lrc 文件，间奏重复歌词正确滚动

---

## Task 3.4: 歌词界面 — 左右分屏

**目标**：歌词界面左侧大封面+歌曲信息，右侧歌词滚动

**文件**：
- Create: `src/pages/Lyrics.tsx`（歌词页面）
- Create: `src/components/LyricsPanel.tsx`（歌词滚动面板）
- Modify: `src/components/Content.tsx`（歌词页面入口）
- Modify: `src/styles/global.css`（歌词样式）

**步骤**：

1. `Lyrics.tsx` — 左右分屏布局：
   - 左侧（40%）：大封面 + 歌名 + 歌手 + 专辑
   - 右侧（60%）：歌词滚动面板
2. `LyricsPanel.tsx`：
   - 歌词逐行渲染
   - 当前行高亮放大（scale 1.1 + 颜色变化）
   - 自动滚动到当前行
   - **用 CSS `transform: translateY()` + `will-change: transform`，不用 scrollTop**
3. 歌词时间轴偏移设置（±0.5s），兼容不准的 LRC 文件

**验证**：歌词界面显示，逐行滚动，当前行高亮，GPU 加速流畅

---

## Task 3.5: 歌词背景 — 主色渐变

**目标**：从封面提取主色，生成渐变背景

**文件**：
- Create: `src/utils/colorExtract.ts`（主色提取）
- Modify: `src/pages/Lyrics.tsx`（应用渐变背景）

**步骤**：

1. `colorExtract.ts` — ⚠️ 暗礁 2：性能优化 + 跨域处理：
   ```ts
   export async function extractColors(imageUrl: string): Promise<string[]> {
     return new Promise((resolve) => {
       const img = new Image()
       img.crossOrigin = 'anonymous'  // 关键：防止 Canvas 污染
       img.src = imageUrl

       img.onload = () => {
         const canvas = document.createElement('canvas')
         const ctx = canvas.getContext('2d')
         // ⚠️ 缩小到 50x50 采样，计算量降低 99%
         canvas.width = 50
         canvas.height = 50
         ctx?.drawImage(img, 0, 0, 50, 50)

         try {
           const imageData = ctx?.getImageData(0, 0, 50, 50).data
           // 颜色统计算法（频率统计，不需要 K-Means）
           // ...
           resolve(['rgb(r1,g1,b1)', 'rgb(r2,g2,b2)'])
         } catch {
           resolve(['rgb(18,18,18)', 'rgb(26,26,26)'])  // 降级默认色
         }
       }
       img.onerror = () => resolve(['rgb(18,18,18)', 'rgb(26,26,26)'])
     })
   }
   ```

2. 生成 CSS 渐变：`linear-gradient(135deg, ...)`
3. 无封面时使用默认渐变（中性灰黑系列，不偏蓝紫）

**验证**：歌词背景随封面颜色变化，切歌不卡顿，无封面时显示默认渐变

---

## Task 3.6: 系统主题跟随（nativeTheme 监听）

**目标**：'跟随系统'模式下，Windows 主题变化时自动切换

**说明**：主题切换 UI 和 CSS 变量已在 Phase 2 完成，本 Task 只需补充主进程监听

**文件**：
- Modify: `electron/main.ts`（nativeTheme 监听）

**步骤**：

1. 主进程监听系统主题变化：
   ```ts
   import { nativeTheme } from 'electron'
   nativeTheme.on('updated', () => {
     mainWindow?.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
   })
   ```
2. 渲染进程 useTheme.ts 已有 system 模式监听（matchMedia），两套机制互补

**验证**：切换 Windows 深色/浅色模式，QinPlayer 自动跟随

---

## Task 3.7: 迷你模式

**目标**：300×80 迷你控制条

**文件**：
- Create: `src/components/MiniPlayer.tsx`（迷你播放器）
- Modify: `src/App.tsx`（迷你模式切换）
- Modify: `electron/main.ts`（窗口尺寸调整，单窗口变形方案）

> ⚠️ 不销毁重建窗口！用 win.setSize() + 前端路由切换。
> 参考 ARCHITECTURE.md "迷你模式：单窗口变形" 章节。

**步骤**：

1. `MiniPlayer.tsx` — 布局：
   - 左侧：封面缩略图 50×50
   - 中间：歌名 + 歌手（单行截断）
   - 右侧：上一首 / 播放暂停 / 下一首
2. ⚠️ 暗礁 4：窗口管理：
   ```ts
   // 进入迷你模式
   win.setAlwaysOnTop(true, 'screen-saver')  // 置顶
   win.setMinimumSize(300, 80)               // 解除 800x600 限制
   win.setSize(300, 80)

   // 退出迷你模式
   win.setAlwaysOnTop(false)
   win.setMinimumSize(800, 600)
   win.setSize(1000, 680)
   ```
3. ⚠️ 暗礁 4：拖拽区域：
   ```css
   .mini-player { -webkit-app-region: drag; }
   .mini-player button { -webkit-app-region: no-drag; }
   ```
4. 主窗口按钮触发迷你模式 → uiStore.setMiniMode(true) → 主进程调整窗口
5. 迷你模式下双击恢复主窗口

**验证**：迷你模式显示正确，可拖拽移动，置顶不被盖住，控制功能正常

---

## Task 3.8: 系统托盘

**目标**：最小化到托盘，托盘右键控制播放

**文件**：
- Create: `electron/tray.ts`（Tray 模块）
- Modify: `electron/main.ts`（引入 tray + 关闭窗口拦截）

**步骤**：

1. 创建 Tray（16×16 图标 + 右键菜单：上一首/播放暂停/下一首/显示主窗口/退出）
2. 关闭窗口时隐藏到托盘（不退出）：
   ```ts
   mainWindow.on('close', (e) => {
     if (!app.isQuitting) {
       e.preventDefault()
       mainWindow.hide()
     }
   })
   ```
3. 渲染进程监听 tray:prev / tray:play-pause / tray:next 事件
4. 托盘图标需要 assets/tray-icon.png（16×16）

**验证**：最小化到托盘，右键菜单功能正常，点击托盘恢复窗口

---

## Task 3.9: 设置页面完善

**目标**：设置页面所有功能实现

**说明**：主题切换 + 音频设备已在 Phase 2 完成，本 Task 补充剩余项

**文件**：
- Modify: `src/pages/Settings.tsx`
- Modify: `electron/main.ts`（开机自启 IPC）

**待实现**：

| 分类 | 内容 | 状态 |
|------|------|------|
| 通用 — 主题 | 亮色/暗色/跟随系统 | ✅ Phase 2 已完成 |
| 通用 — 自启 | 开机自启动开关 | ⬜ 新增 |
| 播放 — 设备 | 音频输出设备 | ✅ Phase 2 已完成 |
| 播放 — 模式 | 默认播放模式 | ⬜ 新增 |
| 播放 — 淡入淡出 | 开关 | ⬜ Task 3.2 后新增 |
| 文件管理 | 音乐文件夹增删 | ⬜ 新增 |
| 文件管理 | 歌词时间轴偏移 | ⬜ Task 3.3 后新增 |
| 数据 | 导入/导出 | ⬜ Task 3.12 |
| 关于 | 版本号 + GitHub | ⬜ 新增 |

**验证**：所有设置项可操作，修改后生效并持久化

---

## Task 3.10: 歌曲信息弹窗

**目标**：右键"歌曲信息"弹出详情弹窗

**说明**：SongInfoDialog.tsx 已存在，需确认功能完整性

**文件**：
- Modify: `src/components/SongInfoDialog.tsx`

**显示内容**：
- 歌名、歌手、专辑
- 文件路径（可点击打开目录）
- 文件大小、格式（mp3/flac/wav）
- 时长、播放次数

**验证**：弹窗显示完整歌曲信息

---

## Task 3.11: 导入/导出数据

**目标**：备份和恢复歌单、设置等数据

**文件**：
- Modify: `electron/main.ts`（IPC: 导入/导出）
- Modify: `src/pages/Settings.tsx`

**步骤**：

1. ⚠️ 暗礁 3：导出前强制 WAL 落盘：
   ```ts
   ipcMain.handle('db:export', async (_event, destPath: string) => {
     const db = getDatabase()
     // 1. 强制 WAL 日志合并到主 .db 文件
     db.pragma('wal_checkpoint(TRUNCATE)')
     // 2. 复制文件（此时 .db 包含所有数据）
     fs.copyFileSync(dbPath, destPath)
     return { success: true }
   })
   ```
2. 导入：用户选择 .db 文件，替换当前数据库，重启应用
3. 弹窗确认操作

**验证**：导出后删除歌单，导入恢复，数据完整（包括最近播放记录）

---

## Task 3.12: 动画打磨

**目标**：关键交互动画，提升质感

**动画清单**：
- 导航项切换 — 内容区淡入（opacity 0→1，200ms）
- 歌曲列表 — 行选中高亮过渡（background-color transition）
- 迷你模式切换 — 窗口大小平滑过渡
- 歌词滚动 — CSS transform 平滑滚动
- 播放/暂停按钮 — 图标切换动画（scale）
- 音量条 — hover 时显示数值气泡

**验证**：所有动画 60fps 流畅，无卡顿

---

## Task 3.13: 打包发布

**目标**：用 electron-builder 打包成 exe 安装包

**文件**：
- Modify: `package.json`（build 配置）
- Create: `assets/icon.ico`（应用图标，256/48/32/16 多尺寸）
- Create: `assets/tray-icon.png`（托盘图标，16×16）

**步骤**：

1. 生成应用图标（多尺寸 ico）
2. `package.json` build 配置：
   ```json
   {
     "build": {
       "appId": "com.qinplayer.app",
       "productName": "QinPlayer",
       "directories": { "output": "release" },
       "files": ["out/**/*", "assets/**/*"],
       "win": {
         "icon": "assets/icon.ico",
         "target": [{ "target": "nsis", "arch": ["x64"] }]
       },
       "nsis": {
         "oneClick": false,
         "allowToChangeInstallationDirectory": true,
         "perMachine": false,
         "createDesktopShortcut": true
       }
     }
   }
   ```
   ⚠️ `perMachine: false` → 安装到 AppData，不需要管理员权限，自动更新不会因权限失败
3. 打包命令：`npm run build && electron-builder`
4. 测试安装包

**验证**：exe 安装后正常运行，图标正确，所有功能正常

---

## Task 3.14: Phase 3 收尾 — 提交 + 开发日志

**目标**：最终提交，写开发日志

**步骤**：

1. 代码清理 + 注释补全
2. `npx tsc --noEmit` 验证
3. `git commit -m "feat: Phase 3 - 打磨期完成"`
4. 写开发日志：`C:\Agent\kaifarizhi\2026-06-xx_QinPlayer-Phase3.md`
5. 更新 SPEC.md 时间戳
6. 创建 GitHub Release（等主人确认后）

**验证**：所有功能正常，代码干净，日志完整

---

## 执行顺序建议

按依赖关系分组，组内可并行：

**第一批（无依赖）**：
- Task 3.1 Media Session API
- Task 3.2 淡入淡出
- Task 3.3 歌词解析
- Task 3.6 nativeTheme 监听

**第二批（依赖第一批）**：
- Task 3.4 歌词界面（依赖 3.3）
- Task 3.5 主色渐变（依赖 3.4）
- Task 3.7 迷你模式
- Task 3.8 系统托盘

**第三批（收尾）**：
- Task 3.9 设置页面完善（依赖 3.2 + 3.3）
- Task 3.10 歌曲信息弹窗
- Task 3.11 导入/导出数据
- Task 3.12 动画打磨（依赖所有 UI 任务）
- Task 3.13 打包发布（最后）
- Task 3.14 收尾

---

*Phase 3 计划更新于 2026-06-09*
*融入外部 Mentor Phase 3 避坑指南*
