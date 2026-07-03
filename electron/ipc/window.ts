// =============================================================================
// QinPlayer — 窗口控制 IPC Handler
// =============================================================================
// 职责：窗口最小化/最大化/关闭、数据库导入导出、歌词读取、迷你模式、主题
// =============================================================================

import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { app } from 'electron'
import { initDatabase, closeDatabase, getDatabase } from '../db/database'

// ---------------------------------------------------------------------------
// 注册窗口控制相关 IPC 通道
// ---------------------------------------------------------------------------

export function registerWindowIPC(getMainWindow: () => BrowserWindow | null): void {
  // --- 窗口控制 ---

  // 最小化窗口
  ipcMain.on('window:minimize', () => {
    getMainWindow()?.minimize()
  })

  // 最大化/还原切换
  ipcMain.on('window:maximize', () => {
    const win = getMainWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  // 关闭窗口（最小化到托盘）
  ipcMain.on('window:close', () => {
    getMainWindow()?.close()
  })

  // --- 文件操作 ---

  // 打开文件夹（用系统资源管理器）
  ipcMain.handle('open-folder', async (_event, folderPath: string) => {
    await shell.openPath(folderPath)
  })

  // 打开文件所在目录并选中文件（歌曲信息弹窗用）
  ipcMain.handle('open-file-location', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  // --- 数据库导入导出 ---

  // 导出数据库备份
  // 1. 弹出保存对话框让用户选择路径
  // 2. WAL checkpoint 确保所有数据落盘（⚠️ 暗礁 3）
  // 3. 复制 .db 文件到目标路径
  ipcMain.handle('db:export', async () => {
    const mainWindow = getMainWindow()
    try {
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: '导出备份',
        defaultPath: 'QinPlayer-备份.db',
        filters: [{ name: '数据库文件', extensions: ['db'] }]
      })
      if (result.canceled || !result.filePath) return { success: false, canceled: true }

      const db = getDatabase()
      // 强制 WAL 日志合并到主 .db 文件，防止导出后丢数据
      db.pragma('wal_checkpoint(TRUNCATE)')

      const fs = require('fs') as typeof import('fs')
      const dbPath = join(app.getPath('userData'), 'qinplayer.db')
      fs.copyFileSync(dbPath, result.filePath)

      console.log('[备份] 导出成功:', result.filePath)
      return { success: true, path: result.filePath }
    } catch (err) {
      console.error('[备份] 导出失败:', err)
      return { success: false, error: String(err) }
    }
  })

  // 导入数据库备份（第一步：选择文件）
  ipcMain.handle('db:import-select', async () => {
    const mainWindow = getMainWindow()
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '导入备份',
      filters: [{ name: '数据库文件', extensions: ['db'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 导入数据库备份（第二步：替换并重启）
  // 关闭当前数据库 → 替换 .db 文件 → 重启应用
  ipcMain.handle('db:import-apply', (_event, backupPath: string) => {
    const mainWindow = getMainWindow()
    try {
      const fs = require('fs') as typeof import('fs')
      const dbPath = join(app.getPath('userData'), 'qinplayer.db')

      // 关闭当前数据库连接
      closeDatabase()

      // 用备份文件替换当前数据库
      fs.copyFileSync(backupPath, dbPath)

      // 删除 WAL 和 SHM 残留文件（旧数据库的，防止恢复后数据混乱）
      const walPath = dbPath + '-wal'
      const shmPath = dbPath + '-shm'
      try { if (fs.existsSync(walPath)) fs.unlinkSync(walPath) } catch { /* 忽略 */ }
      try { if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath) } catch { /* 忽略 */ }

      // 重新初始化数据库连接
      initDatabase()

      console.log('[备份] 导入成功，正在重启...')

      // 开发模式：重新加载页面（不杀 Vite dev server）
      // 打包后：真正重启应用
      if (app.isPackaged) {
        app.relaunch()
        app.exit(0)
      } else {
        mainWindow?.webContents.reload()
      }

      return { success: true }
    } catch (err) {
      console.error('[备份] 导入失败:', err)
      return { success: false, error: String(err) }
    }
  })

  // --- 歌词文件读取 ---

  ipcMain.handle('read-lrc-file', async (_event, lrcPath: string): Promise<string | null> => {
    const fs = require('fs') as typeof import('fs')
    try {
      // 异步检查文件是否存在（替代 existsSync）
      await fs.promises.access(lrcPath, fs.constants.R_OK)
      // 异步读取文件内容（替代 readFileSync）
      return await fs.promises.readFile(lrcPath, 'utf-8')
    } catch (err: unknown) {
      // 文件不存在返回 null（正常情况，歌曲可能没有歌词）
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') return null
      console.error('[IPC] 读取歌词文件失败:', lrcPath, err)
      return null
    }
  })

  // --- 主题切换 ---

  ipcMain.on('theme-changed', (_event, theme: 'dark' | 'light') => {
    // frame: false 模式下没有原生按钮，不需要 setTitleBarOverlay
    console.log('[Main] 主题切换:', theme)
  })

  // --- 迷你模式 ---

  ipcMain.on('window:set-mini-mode', (_event, isMini: boolean) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return
    if (isMini) {
      // 进入迷你模式（先隐藏再改大小，避免 Windows 显示尺寸提示）
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
      mainWindow.setMinimumSize(350, 150)
      mainWindow.hide()
      mainWindow.setSize(350, 150)
      mainWindow.show()
    } else {
      // 退出迷你模式
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setMinimumSize(800, 600)
      mainWindow.hide()
      mainWindow.setSize(1000, 680)
      mainWindow.center()
      mainWindow.show()
    }
  })

  console.log('[IPC] 窗口控制通道已注册')
}
