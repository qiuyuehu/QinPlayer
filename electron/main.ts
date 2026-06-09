// =============================================================================
// QinPlayer — 主进程入口
// =============================================================================
// 职责：应用生命周期管理、窗口创建、协议注册、IPC 路由
// 注意：主进程通过 electron-vite 编译为 CommonJS，但源码用 TypeScript 编写
// =============================================================================

import { app, BrowserWindow, ipcMain, protocol, dialog } from 'electron'
import { join } from 'path'
import { readdir, stat } from 'fs/promises'

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
// 文件夹扫描 IPC
// ---------------------------------------------------------------------------

// 支持的音频文件格式
const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac', '.wma']

/**
 * 递归扫描目录中的音频文件（异步，不阻塞事件循环）
 * 使用 fs/promises 而非 readdirSync/statSync
 */
async function scanDirectory(dir: string, fileList: string[] = []): Promise<string[]> {
  const entries = await readdir(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const fileStat = await stat(fullPath)
    if (fileStat.isDirectory()) {
      await scanDirectory(fullPath, fileList)
    } else {
      const ext = fullPath.toLowerCase().slice(fullPath.lastIndexOf('.'))
      if (AUDIO_EXTENSIONS.includes(ext)) {
        fileList.push(fullPath)
      }
    }
  }
  return fileList
}

function registerScanIPC(): void {
  // 打开文件夹选择对话框
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  // 扫描文件夹中的音频文件（异步，不阻塞 UI）
  ipcMain.handle('scan-folder', async (_event, folderPath: string) => {
    try {
      const files = await scanDirectory(folderPath)
      return { success: true, files }
    } catch (e) {
      return { success: false, files: [], error: String(e) }
    }
  })
}

// ---------------------------------------------------------------------------
// 应用生命周期
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  // 1. 注册自定义协议拦截
  registerProtocol()

  // 2. 注册窗口控制 IPC
  registerWindowIPC()

  // 3. 注册文件夹扫描 IPC
  registerScanIPC()

  // 4. 创建主窗口
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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
