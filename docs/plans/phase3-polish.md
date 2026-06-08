# Phase 3: 打磨期（UX Polish）

> Media Session API、歌词 GPU 滚动、切歌淡入淡出、主题完善、迷你模式、系统托盘、打包发布。

---

## Task 3.1: Media Session API

**目标**：接管系统媒体控制（任务栏 + 键盘多媒体键）

**文件**：
- Modify: `src/components/PlayerBar.tsx`（Media Session 设置）
- Modify: `src/utils/AudioEngine.ts`

**步骤**：

1. 切歌时更新 `navigator.mediaSession.metadata`：
   ```ts
   navigator.mediaSession.metadata = new MediaMetadata({
     title: track.title,
     artist: track.artist,
     album: track.album,
     artwork: [{ src: track.coverUrl, sizes: '512x512' }]
   })
   ```
2. 注册 action handlers：
   ```ts
   navigator.mediaSession.setActionHandler('play', () => audioEngine.play())
   navigator.mediaSession.setActionHandler('pause', () => audioEngine.pause())
   navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack())
   navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack())
   ```
3. 播放/暂停状态同步：
   ```ts
   navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
   ```

**验证**：键盘多媒体键可控制播放，任务栏显示歌曲信息

---

## Task 3.2: 切歌淡入淡出

**目标**：切歌时音量平滑过渡，不突兀

**文件**：
- Modify: `src/utils/AudioEngine.ts`（fadeIn/fadeOut 实现）

**步骤**：

1. `fadeOut(duration)`：
   ```ts
   fadeOut(duration: number = 0.5) {
     const currentVol = this.gainNode.gain.value
     this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime)
     this.gainNode.gain.setValueAtTime(currentVol, this.audioContext.currentTime)
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
4. 设置页面可开关淡入淡出

**验证**：切歌时音量平滑过渡，无爆音

---

## Task 3.3: 歌词解析

**目标**：解析 .lrc 文件为时间轴数组

**文件**：
- Create: `src/utils/lrcParser.ts`（LRC 解析器）

**步骤**：

1. 解析标准 LRC 格式：
   ```
   [00:12.34]第一行歌词
   [00:15.67]第二行歌词
   ```
2. 支持偏移量：`[offset:500]`
3. 返回结构：
   ```ts
   interface LyricLine {
     time: number    // 秒
     text: string    // 歌词文本
   }
   ```
4. 按时间排序

**验证**：解析 .lrc 文件，返回正确的时间轴数组

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

1. `colorExtract.ts` — 从封面图提取 2-3 个主色：
   - 用 Canvas 绘制封面图
   - `getImageData` 获取像素数据
   - 简单的 K-Means 或频率统计提取主色
   - 返回 RGB 数组
2. 生成 CSS 渐变：
   ```css
   background: linear-gradient(135deg, rgb(r1,g1,b1), rgb(r2,g2,b2), rgb(r3,g3,b3));
   ```
3. 无封面时使用默认渐变（深灰系列）

**验证**：歌词背景随封面颜色变化，无封面时显示默认渐变

---

## Task 3.6: 主题完善 — 跟随系统

**目标**：跟随系统主题自动切换

**文件**：
- Modify: `src/hooks/useTheme.ts`
- Modify: `electron/main.ts`（nativeTheme 监听）

**步骤**：

1. `main.js` — 监听系统主题变化：
   ```js
   const { nativeTheme } = require('electron')
   nativeTheme.on('updated', () => {
     mainWindow.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
   })
   ```
2. `useTheme.ts` — 'system' 模式下监听 IPC 消息切换主题
3. 验证：切换 Windows 主色，QinPlayer 自动跟随

**验证**：系统主题变化时 QinPlayer 自动切换

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
2. 主窗口按钮触发迷你模式：
   - `uiStore.setMiniMode(true)`
   - 主进程调整窗口大小为 300×80
   - 隐藏 Sidebar + Content，只显示 MiniPlayer + PlayerBar
3. 迷你模式下双击恢复主窗口

**验证**：迷你模式显示正确，控制功能正常，可恢复主窗口

---

## Task 3.8: 系统托盘

**目标**：最小化到托盘，托盘右键控制播放

**文件**：
- Modify: `electron/tray.ts`（Tray 实现）

**步骤**：

1. 创建 Tray：
   ```js
   const { Tray, Menu, nativeImage } = require('electron')
   let tray = null

   function createTray() {
     const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'))
     tray = new Tray(icon)
     const contextMenu = Menu.buildFromTemplate([
       { label: '上一首', click: () => mainWindow.webContents.send('tray:prev') },
       { label: '播放/暂停', click: () => mainWindow.webContents.send('tray:play-pause') },
       { label: '下一首', click: () => mainWindow.webContents.send('tray:next') },
       { type: 'separator' },
       { label: '显示主窗口', click: () => mainWindow.show() },
       { label: '退出', click: () => { app.isQuitting = true; app.quit() } }
     ])
     tray.setToolTip('QinPlayer')
     tray.setContextMenu(contextMenu)
     tray.on('click', () => mainWindow.show())
   }
   ```
2. 关闭窗口时隐藏到托盘（不退出）：
   ```js
   mainWindow.on('close', (e) => {
     if (!app.isQuitting) {
       e.preventDefault()
       mainWindow.hide()
     }
   })
   ```
3. 渲染进程监听托盘事件，执行对应操作

**验证**：最小化到托盘，右键菜单功能正常，点击托盘恢复窗口

---

## Task 3.9: 设置页面完善

**目标**：设置页面所有功能实现

**文件**：
- Modify: `src/pages/Settings.tsx`

**分类**：
- **通用**：主题切换、开机自启动
- **播放**：音频输出设备、默认播放模式、淡入淡出开关
- **文件管理**：音乐文件夹路径（增删）、歌词搜索规则、歌词偏移量
- **数据**：存储位置自定义、导入/导出数据
- **关于**：版本号、GitHub 链接、检查更新

**验证**：所有设置项可操作，修改后生效并持久化

---

## Task 3.10: 歌曲信息弹窗

**目标**：右键"歌曲信息"弹出详情弹窗

**文件**：
- Create: `src/components/SongInfoDialog.tsx`

**显示内容**：
- 歌名、歌手、专辑
- 文件路径
- 文件大小
- 格式（mp3/flac/wav 等）
- 时长
- 播放次数

**验证**：弹窗显示完整歌曲信息

---

## Task 3.11: 开机自启动

**目标**：设置中开关开机自启动

**文件**：
- Modify: `electron/main.ts`（注册自启动）
- Modify: `src/pages/Settings.tsx`

**步骤**：

1. `main.js`：
   ```js
   const { app } = require('electron')
   // 设置开机自启动
   ipcMain.handle('set-auto-launch', (event, enabled) => {
     app.setLoginItemSettings({ openAtLogin: enabled })
   })
   ipcMain.handle('get-auto-launch', () => {
     return app.getLoginItemSettings().openAtLogin
   })
   ```
2. `Settings.tsx` — 开关绑定

**验证**：开关自启动后，重启电脑验证

---

## Task 3.12: 导入/导出数据

**目标**：备份和恢复歌单、设置等数据

**文件**：
- Modify: `electron/main.ts`（IPC: 导入/导出）
- Modify: `src/pages/Settings.tsx`

**步骤**：

1. 导出：复制 SQLite 数据库文件到用户选择的位置
2. 导入：用户选择 .db 文件，替换当前数据库，重启应用
3. 弹窗确认操作

**验证**：导出后删除歌单，导入恢复，数据完整

---

## Task 3.13: 动画打磨

**目标**：关键交互动画，提升质感

**动画清单**：
- 导航项切换 — 内容区淡入（opacity 0→1，200ms）
- 歌曲列表 — 行选中高亮过渡（background-color transition）
- 迷你模式切换 — 窗口大小平滑过渡
- 歌词滚动 — CSS transform 平滑滚动
- 播放/暂停按钮 — 图标切换动画（rotation 或 scale）
- 音量条 — hover 时显示数值气泡

**验证**：所有动画 60fps 流畅，无卡顿

---

## Task 3.14: 打包发布

**目标**：用 electron-builder 打包成 exe 安装包

**文件**：
- Modify: `package.json`（build 配置）
- Create: `assets/icon.ico`（应用图标，256/48/32/16 多尺寸）
- Create: `assets/tray-icon.png`（托盘图标，16×16）

**步骤**：

1. 生成应用图标（用 Pillow 或在线工具）
2. `package.json` build 配置：
   ```json
   {
     "build": {
       "appId": "com.qinplayer.app",
       "productName": "QinPlayer",
       "directories": { "output": "release" },
       "files": ["dist/**/*", "electron/**/*", "assets/**/*"],
       "win": {
         "icon": "assets/icon.ico",
         "signAndEditExecutable": false,
         "target": [{ "target": "nsis", "arch": ["x64"] }]
       },
       "nsis": {
         "oneClick": false,
         "allowToChangeInstallationDirectory": true,
         "createDesktopShortcut": true
       }
     }
   }
   ```
3. 打包命令：`npm run build && npm run dist`
4. 测试安装包

**验证**：exe 安装后正常运行，图标正确，所有功能正常

---

## Task 3.15: Phase 3 收尾 — 提交 + 开发日志

**目标**：最终提交，写开发日志

**步骤**：

1. 代码清理 + 注释补全
2. `git commit -m "feat: Phase 3 - 打磨期完成"`
3. 写开发日志：`C:\Agent\kaifarizhi\2026-06-xx_QinPlayer-开发日志.md`
4. 更新 SPEC.md 时间戳
5. 创建 GitHub Release（等主人确认后）

**验证**：所有功能正常，代码干净，日志完整

---

*QinPlayer v1.0.0 开发完成*
