// =============================================================================
// QinPlayer — 窗口控制 IPC Handler
// =============================================================================
// 职责：窗口最小化/最大化/关闭、数据库导入导出、歌词读取、迷你模式、主题
// =============================================================================

import { dialog, shell, BrowserWindow } from 'electron'
import { app } from 'electron'
import { getDatabase, getDatabasePath } from '../db/database'
import { importDatabaseBackup } from '../db/databaseImport'
import { loadWindowBounds, loadWindowState, normalizeWindowBounds } from '../windowBounds'
import type { FeatureFlags } from '../../src/types/ipc'
import { handleIpc, isBooleanIpcPayload, onIpc } from './typedIpc'

const MINI_PLAYER_WIDTH = 400
const MINI_PLAYER_HEIGHT = 150

// ---------------------------------------------------------------------------
// 注册窗口控制相关 IPC 通道
// ---------------------------------------------------------------------------

export function registerWindowIPC(
  getMainWindow: () => BrowserWindow | null,
  getFeatureFlags: () => FeatureFlags,
  setMiniMode: (isMini: boolean) => void,
  saveCurrentWindowBoundsNow: () => void
): void {
  // --- 窗口控制 ---

  // 最小化窗口
  onIpc('window:minimize', () => {
    getMainWindow()?.minimize()
  })

  // 最大化/还原切换
  onIpc('window:maximize', () => {
    const win = getMainWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  // 关闭窗口（最小化到托盘）
  onIpc('window:close', () => {
    getMainWindow()?.close()
  })

  // 设置窗口置顶（歌词页使用；迷你模式仍走自己的逻辑）
  onIpc('window:set-always-on-top', (_event, flag: boolean) => {
    if (typeof flag !== 'boolean') return
    const mainWindow = getMainWindow()
    if (!mainWindow) return

    if (flag) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
    } else {
      mainWindow.setAlwaysOnTop(false)
    }
  })

  // --- 文件操作 ---

  // 打开文件夹（用系统资源管理器）
  handleIpc('open-folder', async (_event, folderPath: string) => {
    await shell.openPath(folderPath)
  })

  // 打开文件所在目录并选中文件（歌曲信息弹窗用）
  handleIpc('open-file-location', (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  // --- 数据库导入导出 ---

  // 导出数据库备份
  // 1. 弹出保存对话框让用户选择路径
  // 2. WAL checkpoint 确保所有数据落盘（⚠️ 暗礁 3）
  // 3. 复制 .db 文件到目标路径
  handleIpc('db:export', async () => {
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
      await fs.promises.copyFile(getDatabasePath(), result.filePath)

      console.log('[备份] 导出成功:', result.filePath)
      return { success: true, path: result.filePath }
    } catch (err) {
      console.error('[备份] 导出失败:', err)
      return { success: false, error: '数据库导出失败，请重试' }
    }
  })

  // 导入数据库备份（第一步：选择文件）
  handleIpc('db:import-select', async () => {
    const mainWindow = getMainWindow()
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '导入备份',
      filters: [{ name: '数据库文件', extensions: ['db'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 导入数据库备份（第二步：验证、可恢复发布并在成功后重启）
  handleIpc('db:import-apply', async (_event, backupPath: string) => {
    const mainWindow = getMainWindow()
    if (typeof backupPath !== 'string' || backupPath.trim().length === 0) {
      return { success: false, error: '数据库导入路径无效' }
    }
    try {
      const result = await importDatabaseBackup(backupPath)
      if (!result.success) {
        console.error('[备份] 导入未完成:', result.error)
        return result.fatal
          ? { success: false, error: '数据库导入失败，请完全退出应用后重试', fatal: true }
          : { success: false, error: '数据库导入失败，请检查备份文件后重试' }
      }

      // 开发模式：重新加载页面（不杀 Vite dev server）
      // 打包后：真正重启应用
      if (app.isPackaged) {
        app.relaunch()
        app.exit(0)
      } else {
        mainWindow?.webContents.reload()
      }

      return { success: true }
    } catch (error) {
      console.error('[备份] 导入失败:', error)
      return { success: false, error: '数据库导入失败，请重试' }
    }
  })

  // --- 歌词文件读取 ---

  handleIpc('read-lrc-file', async (_event, lrcPath: string): Promise<string | null> => {
    const fs = require('fs') as typeof import('fs')
    try {
      // 异步检查文件是否可读。
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

  onIpc('theme-changed', (_event, theme: 'dark' | 'light') => {
    if (theme !== 'dark' && theme !== 'light') {
      console.warn('[IPC] theme-changed 参数无效:', theme)
      return
    }
    // frame: false 模式下没有原生按钮，不需要 setTitleBarOverlay
    console.log('[Main] 主题切换:', theme)
  })

  // --- 迷你模式 ---

  onIpc('window:set-mini-mode', (_event, isMini: boolean) => {
    if (!isBooleanIpcPayload(isMini)) {
      console.warn('[IPC] window:set-mini-mode 参数无效:', isMini)
      return
    }
    const mainWindow = getMainWindow()
    if (!mainWindow) return
    const flags = getFeatureFlags()

    if (isMini) {
      // 进入迷你模式前先保存正常窗口 bounds，并暂停持久化。
      saveCurrentWindowBoundsNow()
      setMiniMode(true)
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      }
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
      mainWindow.setResizable(false)
      mainWindow.setMinimumSize(MINI_PLAYER_WIDTH, MINI_PLAYER_HEIGHT)
      mainWindow.hide()
      mainWindow.setSize(MINI_PLAYER_WIDTH, MINI_PLAYER_HEIGHT)
      mainWindow.show()
    } else {
      // 退出迷你模式时按 feature flag 恢复正常窗口 bounds。
      setMiniMode(false)
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setResizable(true)
      mainWindow.setMinimumSize(800, 600)
      mainWindow.hide()

      const savedState = flags.windowSizePersist ? loadWindowState() : null
      if (flags.windowSizePersist) {
        const savedBounds = loadWindowBounds()
        const normalizedBounds = savedBounds ? normalizeWindowBounds(savedBounds) : null
        if (normalizedBounds) {
          mainWindow.setBounds(normalizedBounds)
        } else {
          mainWindow.setSize(1000, 680)
          mainWindow.center()
        }
      } else {
        mainWindow.setSize(1000, 680)
        mainWindow.center()
      }

      mainWindow.show()
      if (savedState?.isMaximized) {
        mainWindow.maximize()
      }
    }
  })

  console.log('[IPC] 窗口控制通道已注册')
}
