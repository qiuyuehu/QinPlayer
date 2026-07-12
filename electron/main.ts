// =============================================================================
// QinPlayer — 主进程入口
// =============================================================================
// 职责：应用生命周期管理、窗口创建、协议注册、IPC 路由
// 注意：主进程通过 electron-vite 编译为 CommonJS，但源码用 TypeScript 编写
//
// 模块拆分：
//   electron/ipc/protocol.ts — qinplayer:// 协议拦截
//   electron/ipc/window.ts   — 窗口控制、数据库导入导出、迷你模式
//   electron/ipc/scan.ts     — 文件夹扫描、Worker 管理、增量扫描
//   electron/ipc/songs.ts    — 歌曲 CRUD、收藏、最近播放
//   electron/ipc/playlists.ts — 歌单管理
//   electron/ipc/settings.ts — 设置、音乐文件夹管理
//   electron/tray.ts         — 系统托盘
//   electron/db/database.ts  — SQLite 数据库
// =============================================================================

import { app, BrowserWindow, ipcMain, protocol, nativeTheme, nativeImage } from 'electron'
import { join } from 'path'
import { initDatabase, closeDatabase } from './db/database'
import { registerSongsIPC } from './ipc/songs'
import { registerPlaylistsIPC } from './ipc/playlists'
import { getFeatureFlags, loadFeatureFlags, registerSettingsIPC } from './ipc/settings'
import { registerWindowIPC } from './ipc/window'
import { registerProtocol } from './ipc/protocol'
import { registerScanIPC, startIncrementalScan } from './ipc/scan'
import { registerEqIPC } from './ipc/eq'
import { registerListeningIPC } from './ipc/listening'
import { createTray, updateMenu, destroyTray } from './tray'
import { loadWindowBounds, loadWindowState, normalizeWindowBounds, saveWindowBounds, saveWindowState } from './windowBounds'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { FeatureFlags } from '../src/types/ipc'

// ---------------------------------------------------------------------------
// 全局引用
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null
let isPlaying = false  // 播放状态（托盘菜单需要）
let isQuitting = false  // 是否正在退出（关闭窗口时判断：退出 vs 最小化到托盘）
let currentFeatureFlags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS }
let isMiniMode = false  // 迷你模式期间暂停正常窗口 bounds 持久化
let boundsTimer: ReturnType<typeof setTimeout> | null = null

/** 获取主窗口引用（供各 IPC 模块使用） */
function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/** 获取播放状态（托盘模块调用） */
function getIsPlaying(): boolean {
  return isPlaying
}

/** 设置退出标记（托盘"退出"菜单调用） */
function setIsQuitting(): void {
  isQuitting = true
}

function canSaveWindowBounds(win: BrowserWindow): boolean {
  return currentFeatureFlags.windowSizePersist
    && !isMiniMode
    && !win.isMaximized()
    && !win.isMinimized()
    && win.isVisible()
}

function saveCurrentWindowStateNow(): void {
  if (mainWindow && currentFeatureFlags.windowSizePersist && !isMiniMode) {
    saveWindowState({
      isMaximized: mainWindow.isMaximized(),
      isMinimized: mainWindow.isMinimized(),
    })
  }
}

function saveCurrentWindowBoundsNow(): void {
  if (boundsTimer) {
    clearTimeout(boundsTimer)
    boundsTimer = null
  }

  if (mainWindow && canSaveWindowBounds(mainWindow)) {
    saveWindowBounds(mainWindow.getBounds())
  }

  saveCurrentWindowStateNow()
}

function debounceSaveWindowBounds(): void {
  if (!mainWindow || !currentFeatureFlags.windowSizePersist || isMiniMode) return
  if (boundsTimer) clearTimeout(boundsTimer)

  boundsTimer = setTimeout(() => {
    boundsTimer = null
    if (mainWindow && canSaveWindowBounds(mainWindow)) {
      saveWindowBounds(mainWindow.getBounds())
    }
  }, 500)
}

// ---------------------------------------------------------------------------
// 单实例锁（防止用户重复打开多个窗口）
// ---------------------------------------------------------------------------
// 如果已经有实例在运行，第二个实例直接退出，并把已有窗口激活到前台
// ---------------------------------------------------------------------------

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 用户又双击了 exe，把已有窗口拉到前台
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

// ---------------------------------------------------------------------------
// GPU 硬件加速优化（为后续视频/动画效果铺垫）
// ---------------------------------------------------------------------------
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('enable-webgl')
app.commandLine.appendSwitch('enable-accelerated-2d-canvas')

// ---------------------------------------------------------------------------
// 自定义协议注册（必须在 app.whenReady 之前！）
// ---------------------------------------------------------------------------
// qinplayer:// 协议用于加载本地音频文件，绕过浏览器 CORS 限制
// 注册为特权协议后，渲染进程可以直接用 fetch() 请求本地文件
// ---------------------------------------------------------------------------

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'qinplayer',
    privileges: {
      secure: true,           // 视为安全协议（https 级别）
      supportFetchAPI: true,  // 支持 fetch API
      corsEnabled: true,      // 启用 CORS（避免音频被跨域静音）
      stream: true            // 支持流式响应（Range Requests 需要）
    }
  }
])

// ---------------------------------------------------------------------------
// 窗口创建
// ---------------------------------------------------------------------------

function createWindow(flags: FeatureFlags): void {
  // 打包后 assets 在 resources/assets/，开发时在项目根目录
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'assets/icon.ico')
    : join(__dirname, '../../assets/icon.ico')
  
  console.log('[Main] 图标路径:', iconPath, 'exists:', require('fs').existsSync(iconPath))

  let savedBounds: Partial<ReturnType<BrowserWindow['getBounds']>> = {}
  const savedState = flags.windowSizePersist ? loadWindowState() : null
  if (flags.windowSizePersist) {
    const loadedBounds = loadWindowBounds()
    if (loadedBounds) {
      const normalizedBounds = normalizeWindowBounds(loadedBounds)
      if (normalizedBounds) savedBounds = normalizedBounds
    }
  }

  mainWindow = new BrowserWindow({
    width: savedBounds.width || 1000,
    height: savedBounds.height || 680,
    ...(savedBounds.x !== undefined && { x: savedBounds.x }),
    ...(savedBounds.y !== undefined && { y: savedBounds.y }),
    minWidth: 800,
    minHeight: 600,
    title: 'QinPlayer',
    icon: nativeImage.createFromPath(iconPath),
    backgroundColor: '#1a1a1a',  // 暗色背景，防止窗口加载时闪白

    // 完全无边框窗口（不使用 titleBarOverlay，避免原生按钮）
    frame: false,
    titleBarStyle: 'hidden',

    webPreferences: {
      nodeIntegration: false,   // 禁用 Node.js 集成（安全）
      contextIsolation: true,   // 启用上下文隔离（安全）
      preload: join(__dirname, '../preload/index.js')  // 预加载脚本
    }
  })

  // 隐藏菜单栏（我们用自定义标题栏）
  mainWindow.setMenuBarVisibility(false)

  // 监听最大化/还原状态变化，通知渲染进程更新图标
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false)
  })

  if (flags.windowSizePersist) {
    mainWindow.on('resize', debounceSaveWindowBounds)
    mainWindow.on('move', debounceSaveWindowBounds)
    mainWindow.on('maximize', saveCurrentWindowStateNow)
    mainWindow.on('unmaximize', saveCurrentWindowStateNow)
    mainWindow.on('minimize', saveCurrentWindowStateNow)
    mainWindow.on('restore', saveCurrentWindowStateNow)
  }

  if (savedState?.isMaximized) {
    mainWindow.maximize()
  } else if (savedState?.isMinimized) {
    mainWindow.minimize()
  }

  // 关闭窗口时保存 bounds，并按托盘规则隐藏或退出
  mainWindow.on('close', (e) => {
    saveCurrentWindowBoundsNow()

    if (flags.tray && !isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // 开发模式加载 Vite 开发服务器，打包后加载本地文件
  if (!app.isPackaged) {
    const port = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
    mainWindow.loadURL(port)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 窗口关闭时的处理
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---------------------------------------------------------------------------
// 应用生命周期
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // 1. 初始化数据库（最先，其他模块可能依赖数据库）
  await initDatabase()

  // 1.1 读取功能开关（必须早于窗口、托盘和渲染进程水合）
  const featureFlags = await loadFeatureFlags()
  currentFeatureFlags = featureFlags

  // 2. 注册自定义协议拦截
  registerProtocol()

  // 3. 注册各模块 IPC 通道
  registerWindowIPC(
    getMainWindow,
    () => currentFeatureFlags,
    (isMini) => { isMiniMode = isMini },
    saveCurrentWindowBoundsNow
  )
  registerScanIPC(getMainWindow)
  registerSongsIPC()
  registerPlaylistsIPC()
  registerSettingsIPC(getMainWindow)
  registerEqIPC()
  registerListeningIPC(() => currentFeatureFlags)

  // 4. 创建主窗口
  createWindow(featureFlags)

  // 5. 启动增量扫描（后台自动检测新增/修改的歌曲）
  startIncrementalScan(getMainWindow)

  // 6. 监听系统主题变化（nativeTheme），主动通知渲染进程
  nativeTheme.on('updated', () => {
    const systemTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    mainWindow?.webContents.send('theme:system-changed', systemTheme)
  })

  // 7. 创建系统托盘
  if (featureFlags.tray) {
    createTray(
      getMainWindow,
      getIsPlaying,
      setIsQuitting,
      () => {
        if (!getFeatureFlags().playback) return
        // 播放/暂停：切换状态并通知渲染进程
        isPlaying = !isPlaying
        mainWindow?.webContents.send('tray:play-pause')
        updateMenu()
      },
      () => {
        if (!getFeatureFlags().playback) return
        // 上一首
        mainWindow?.webContents.send('tray:prev')
      },
      () => {
        if (!getFeatureFlags().playback) return
        // 下一首
        mainWindow?.webContents.send('tray:next')
      },
      featureFlags
    )
  }

  // 播放状态同步（渲染进程通知主进程）
  ipcMain.on('player:playing-changed', (_event, playing: boolean) => {
    isPlaying = playing
    updateMenu()
  })

  // 开机自启动
  ipcMain.handle('get-auto-launch', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.on('set-auto-launch', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
  })

  // macOS：点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(currentFeatureFlags)
    }
  })
})

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  closeDatabase()
  destroyTray()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
