// =============================================================================
// QinPlayer — 主进程入口
// =============================================================================
// 职责：应用生命周期管理、窗口创建、协议注册、IPC 路由
// 注意：主进程通过 electron-vite 编译为 CommonJS，但源码用 TypeScript 编写
// =============================================================================

import { app, BrowserWindow, ipcMain, protocol, dialog } from 'electron'
import { join } from 'path'
import { initDatabase, closeDatabase, getDatabase } from './db/database'
import { registerSongsIPC } from './ipc/songs'
import { registerPlaylistsIPC } from './ipc/playlists'
import { registerSettingsIPC } from './ipc/settings'

// ---------------------------------------------------------------------------
// 全局引用
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null

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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    title: 'QinPlayer',
    backgroundColor: '#1a1a1a',  // 暗色背景，防止窗口加载时闪白

    // 无边框窗口 + 暗色标题栏覆盖
    // nativeTheme.themeSource='dark' 对 Windows 原生标题栏不生效，
    // 必须用 titleBarStyle:'hidden' + titleBarOverlay 自定义
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a1a',        // 标题栏背景色（与暗色主题一致）
      symbolColor: '#e8e8ef',  // 最小化/最大化/关闭按钮颜色
      height: 36               // 标题栏高度
    },

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

  // 开发模式加载 Vite 开发服务器，打包后加载本地文件
  if (!app.isPackaged) {
    const port = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
    mainWindow.loadURL(port)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 窗口关闭时的处理（Phase 3 实现托盘后改为最小化到托盘）
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---------------------------------------------------------------------------
// 窗口控制 IPC
// ---------------------------------------------------------------------------

function registerWindowIPC(): void {
  // 最小化窗口
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })

  // 最大化/还原切换
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  // 关闭窗口（Phase 3 改为最小化到托盘）
  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })
}

// ---------------------------------------------------------------------------
// 协议拦截（在 app.whenReady 中注册）
// ---------------------------------------------------------------------------
// qinplayer://audio?path=xxx → 主进程拦截 → 读取本地文件 → 返回音频流
// 支持 Range Requests（拖动进度条需要 206 响应）
// ---------------------------------------------------------------------------

function registerProtocol(): void {
  protocol.handle('qinplayer', (request) => {
    console.log('[Protocol] 收到请求:', request.url)

    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.searchParams.get('path') || '')
      console.log('[Protocol] 解析文件路径:', filePath)

      // 同步检查文件是否存在（protocol.handle 回调中允许同步操作）
      const fs = require('fs') as typeof import('fs')
      const { Readable } = require('stream') as typeof import('stream')

      if (!filePath) {
        console.log('[Protocol] 错误：路径为空')
        return new Response('Missing path', { status: 400 })
      }

      if (!fs.existsSync(filePath)) {
        console.log('[Protocol] 错误：文件不存在')
        return new Response('Not Found', { status: 404 })
      }

      const stat = fs.statSync(filePath)
      console.log('[Protocol] 文件大小:', stat.size, 'bytes')

      const range = request.headers.get('range')

      if (range) {
        // ---- Range Request（拖动进度条 / 缓冲）----
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
        const chunkSize = (end - start) + 1
        console.log('[Protocol] Range Request:', start, '-', end)

        const stream = fs.createReadStream(filePath, { start, end })
        const webStream = Readable.toWeb(stream) as ReadableStream

        return new Response(webStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize.toString(),
            'Content-Type': 'audio/mpeg'
          }
        })
      } else {
        // ---- 完整文件请求（从头播放）----
        console.log('[Protocol] 完整文件请求')
        const stream = fs.createReadStream(filePath)
        const webStream = Readable.toWeb(stream) as ReadableStream

        return new Response(webStream, {
          headers: {
            'Content-Length': stat.size.toString(),
            'Content-Type': 'audio/mpeg'
          }
        })
      }
    } catch (err) {
      console.error('[Protocol] 处理异常:', err)
      return new Response('Internal Error', { status: 500 })
    }
  })
  console.log('[Protocol] qinplayer:// 协议已注册')
}

// ---------------------------------------------------------------------------
// 文件夹扫描 IPC（使用 Worker Threads）
// ---------------------------------------------------------------------------
// ⚠️ 绝对不要在主进程主线程同步读取和解析大量音频文件的 ID3 标签！
// 使用 Worker Threads 在独立线程中扫描，通过 postMessage 传递结果
// ---------------------------------------------------------------------------

import { Worker } from 'worker_threads'

let scanWorker: Worker | null = null

function registerScanIPC(): void {
  // 打开文件夹选择对话框
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  // 启动 Worker 扫描文件夹
  ipcMain.handle('scan-folder', async (_event, folderPath: string) => {
    try {
      const db = getDatabase()

      // 保存文件夹到数据库
      db.prepare('INSERT OR IGNORE INTO music_folders (path) VALUES (?)').run(folderPath)

      // 封面缓存目录
      const coversDir = join(app.getPath('userData'), 'covers')

      // 创建 Worker 线程
      const workerPath = join(__dirname, 'scanner.js')
      scanWorker = new Worker(workerPath, {
        workerData: {
          folderPaths: [folderPath],
          coversDir
        }
      })

      // 监听 Worker 消息
      scanWorker.on('message', (msg: { type: string; data: unknown }) => {
        switch (msg.type) {
          case 'song':
            // Worker 解析完一首歌，写入数据库
            insertSong(msg.data as ScanResult)
            // 推送给渲染进程更新 UI
            mainWindow?.webContents.send('scan:song-found', msg.data)
            break

          case 'progress':
            // 推送扫描进度
            mainWindow?.webContents.send('scan:progress', msg.data)
            break

          case 'done':
            // 扫描完成
            mainWindow?.webContents.send('scan:done', msg.data)
            scanWorker = null
            break

          case 'error':
            // 扫描错误
            console.error('[Scanner] 错误:', msg.data)
            mainWindow?.webContents.send('scan:error', msg.data)
            break

          case 'log':
            console.log('[Scanner]', msg.data)
            break
        }
      })

      scanWorker.on('error', (err) => {
        console.error('[Scanner] Worker 异常:', err)
        mainWindow?.webContents.send('scan:error', { message: err.message })
        scanWorker = null
      })

      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })
}

// ---------------------------------------------------------------------------
// 数据库写入辅助函数
// ---------------------------------------------------------------------------

interface ScanResult {
  filePath: string
  fileName: string
  title: string | null
  artist: string | null
  album: string | null
  duration: number | null
  coverPath: string | null
  mtime: number
}

/**
 * 将 Worker 解析的歌曲数据写入数据库
 * 使用 INSERT OR IGNORE 避免重复插入
 */
function insertSong(song: ScanResult): void {
  const db = getDatabase()
  db.prepare(`
    INSERT OR IGNORE INTO songs (file_path, file_name, title, artist, album, duration, cover_path, mtime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    song.filePath,
    song.fileName,
    song.title,
    song.artist,
    song.album,
    song.duration,
    song.coverPath,
    song.mtime
  )
}

// ---------------------------------------------------------------------------
// 应用生命周期
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  // 1. 初始化数据库（最先，其他模块可能依赖数据库）
  initDatabase()

  // 2. 注册自定义协议拦截
  registerProtocol()

  // 3. 注册窗口控制 IPC
  registerWindowIPC()

  // 4. 注册文件夹扫描 IPC
  registerScanIPC()

  // 5. 注册数据库相关 IPC（歌曲/歌单/设置）
  registerSongsIPC()
  registerPlaylistsIPC()
  registerSettingsIPC()

  // 6. 创建主窗口
  createWindow()

  // macOS：点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出（macOS 除外，Phase 3 加入托盘后行为会变）
app.on('window-all-closed', () => {
  // 关闭数据库连接
  closeDatabase()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
