// =============================================================================
// QinPlayer — 主进程入口
// =============================================================================
// 职责：应用生命周期管理、窗口创建、协议注册、IPC 路由
// 注意：主进程通过 electron-vite 编译为 CommonJS，但源码用 TypeScript 编写
// =============================================================================

import { app, BrowserWindow, ipcMain, protocol, dialog, shell, nativeTheme } from 'electron'
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

  // 打开文件夹（用系统资源管理器）
  ipcMain.handle('open-folder', async (_event, folderPath: string) => {
    await shell.openPath(folderPath)
  })

  // 读取 .lrc 歌词文件内容
  ipcMain.handle('read-lrc-file', async (_event, lrcPath: string): Promise<string | null> => {
    const fs = require('fs') as typeof import('fs')
    try {
      if (fs.existsSync(lrcPath)) {
        return fs.readFileSync(lrcPath, 'utf-8')
      }
      return null
    } catch (err) {
      console.error('[IPC] 读取歌词文件失败:', lrcPath, err)
      return null
    }
  })

  // 主题切换 → 更新标题栏颜色（Windows 原生 overlay）
  ipcMain.on('theme-changed', (_event, theme: 'dark' | 'light') => {
    if (!mainWindow) return
    if (theme === 'light') {
      mainWindow.setTitleBarOverlay({
        color: '#f5f5f7',
        symbolColor: '#1d1d1f',
        height: 36
      })
    } else {
      mainWindow.setTitleBarOverlay({
        color: '#1a1a1a',
        symbolColor: '#e8e8ef',
        height: 36
      })
    }
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
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.searchParams.get('path') || '')
      const host = url.hostname  // 'audio' 或 'cover'

      const fs = require('fs') as typeof import('fs')
      const { Readable } = require('stream') as typeof import('stream')

      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Not Found', { status: 404 })
      }

      const stat = fs.statSync(filePath)

      // 根据类型确定 Content-Type
      let contentType: string
      if (host === 'cover') {
        // 封面图片
        const ext = filePath.toLowerCase()
        if (ext.endsWith('.png')) contentType = 'image/png'
        else contentType = 'image/jpeg'
      } else {
        // 音频文件
        const ext = filePath.toLowerCase()
        if (ext.endsWith('.flac')) contentType = 'audio/flac'
        else if (ext.endsWith('.wav')) contentType = 'audio/wav'
        else if (ext.endsWith('.ogg')) contentType = 'audio/ogg'
        else if (ext.endsWith('.m4a') || ext.endsWith('.aac')) contentType = 'audio/mp4'
        else contentType = 'audio/mpeg'
      }

      const range = request.headers.get('range')

      if (range) {
        // ---- Range Request（拖动进度条 / 缓冲）----
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
        const chunkSize = (end - start) + 1

        const stream = fs.createReadStream(filePath, { start, end })
        const webStream = Readable.toWeb(stream) as ReadableStream

        return new Response(webStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize.toString(),
            'Content-Type': contentType
          }
        })
      } else {
        // ---- 完整文件请求 ----
        const stream = fs.createReadStream(filePath)
        const webStream = Readable.toWeb(stream) as ReadableStream

        return new Response(webStream, {
          headers: {
            'Content-Length': stat.size.toString(),
            'Content-Type': contentType
          }
        })
      }
    } catch (err) {
      console.error('[Protocol] 处理异常:', err)
      return new Response('Internal Error', { status: 500 })
    }
  })
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

      // 创建 Worker 线程（用户手动扫描 = 全量模式）
      const workerPath = join(__dirname, 'scanner.js')
      scanWorker = new Worker(workerPath, {
        workerData: {
          folderPaths: [folderPath],
          coversDir,
          mode: 'full',           // 用户手动选择文件夹时走全量扫描
          existingFiles: {}        // 全量模式不需要已有文件映射
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
 * 使用 upsert：新歌插入，已有歌曲更新元数据和封面（保留 play_count）
 */
function insertSong(song: ScanResult): void {
  const db = getDatabase()
  db.prepare(`
    INSERT INTO songs (file_path, file_name, title, artist, album, duration, cover_path, mtime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      album = excluded.album,
      duration = excluded.duration,
      cover_path = COALESCE(excluded.cover_path, songs.cover_path),
      mtime = excluded.mtime
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
// 增量扫描相关辅助函数
// ---------------------------------------------------------------------------

/**
 * 从数据库获取所有歌曲的 file_path + mtime（增量对比用）
 * 返回 Map<filePath, mtime>
 */
function getExistingSongs(): Record<string, number> {
  const db = getDatabase()
  const rows = db.prepare('SELECT file_path, mtime FROM songs').all() as { file_path: string; mtime: number }[]
  const map: Record<string, number> = {}
  for (const row of rows) {
    map[row.file_path] = row.mtime
  }
  return map
}

/**
 * 清理已删除的歌曲记录
 * 对比数据库中的 file_path 和文件系统实际存在的文件，删除不存在的记录
 */
function cleanDeletedSongs(existingPaths: string[]): number {
  const db = getDatabase()
  const dbSongs = db.prepare('SELECT id, file_path FROM songs').all() as { id: number; file_path: string }[]
  const pathSet = new Set(existingPaths)

  let deletedCount = 0
  const deleteStmt = db.prepare('DELETE FROM songs WHERE id = ?')
  for (const song of dbSongs) {
    if (!pathSet.has(song.file_path)) {
      deleteStmt.run(song.id)
      deletedCount++
    }
  }

  if (deletedCount > 0) {
    console.log(`[增量扫描] 已清理 ${deletedCount} 条已删除文件的记录`)
  }
  return deletedCount
}

/**
 * 启动增量扫描（应用启动时自动调用）
 * 从数据库读取已注册的音乐文件夹和已有歌曲，启动 Worker 做增量扫描
 */
function startIncrementalScan(): void {
  try {
    const db = getDatabase()

    // 1. 读取已注册的音乐文件夹
    const folders = db.prepare('SELECT path FROM music_folders ORDER BY id').all() as { path: string }[]
    if (folders.length === 0) {
      console.log('[增量扫描] 没有已注册的音乐文件夹，跳过')
      return
    }

    const folderPaths = folders.map(f => f.path)

    // 2. 读取已有歌曲的 file_path + mtime
    const existingFiles = getExistingSongs()
    console.log(`[增量扫描] 启动：${folderPaths.length} 个文件夹，${Object.keys(existingFiles).length} 首已有歌曲`)

    // 3. 封面缓存目录
    const coversDir = join(app.getPath('userData'), 'covers')

    // 4. 创建增量扫描 Worker
    const workerPath = join(__dirname, 'scanner.js')
    const worker = new Worker(workerPath, {
      workerData: {
        folderPaths,
        coversDir,
        mode: 'incremental',
        existingFiles
      }
    })

    // 5. 监听 Worker 消息（复用已有 IPC 事件，渲染进程无需改动）
    worker.on('message', (msg: { type: string; data: unknown }) => {
      switch (msg.type) {
        case 'song':
          // 新增/更新的歌曲，写入数据库
          insertSong(msg.data as ScanResult)
          // 推送给渲染进程
          mainWindow?.webContents.send('scan:song-found', msg.data)
          break

        case 'progress':
          mainWindow?.webContents.send('scan:progress', msg.data)
          break

        case 'existing-paths':
          // Worker 发送了文件系统中实际存在的所有文件路径，清理已删除的记录
          const { paths } = msg.data as { paths: string[] }
          cleanDeletedSongs(paths)
          break

        case 'done':
          console.log('[增量扫描] 完成')
          mainWindow?.webContents.send('scan:done', msg.data)
          break

        case 'error':
          console.error('[增量扫描] 错误:', msg.data)
          break

        case 'log':
          console.log('[增量扫描]', msg.data)
          break
      }
    })

    worker.on('error', (err) => {
      console.error('[增量扫描] Worker 异常:', err)
    })
  } catch (err) {
    console.error('[增量扫描] 启动失败:', err)
  }
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

  // 7. 启动增量扫描（后台自动检测新增/修改的歌曲）
  // 窗口创建后再启动，确保渲染进程已准备好接收事件
  startIncrementalScan()

  // 8. 监听系统主题变化（nativeTheme），主动通知渲染进程
  // 渲染进程的 matchMedia 也能监听，但主进程监听更可靠（双重保险）
  nativeTheme.on('updated', () => {
    const systemTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    mainWindow?.webContents.send('theme:system-changed', systemTheme)
  })

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
