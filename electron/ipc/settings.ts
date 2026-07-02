// =============================================================================
// QinPlayer — 设置相关 IPC Handler
// =============================================================================
// 职责：设置键值对读写、音乐文件夹管理
// =============================================================================

import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'
import { getDatabase } from '../db/database'
import { join, sep } from 'path'
import type { FeatureFlags } from '../../src/types/ipc'
import { DEFAULT_FEATURE_FLAGS, parseFeatureFlagsText } from '../../src/utils/featureFlags'

let featureFlags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS }

export async function loadFeatureFlags(): Promise<FeatureFlags> {
  const flagsPath = join(app.getPath('userData'), 'feature-flags.json')

  try {
    const text = await readFile(flagsPath, 'utf-8')
    featureFlags = parseFeatureFlagsText(text)
  } catch {
    // ★ feature-flags.json 是可选覆盖；缺失、损坏或不可读时保持默认全开。
    featureFlags = { ...DEFAULT_FEATURE_FLAGS }
  }

  return { ...featureFlags }
}

export function getFeatureFlags(): FeatureFlags {
  return { ...featureFlags }
}

// ---------------------------------------------------------------------------
// 注册所有设置相关 IPC 通道
// ---------------------------------------------------------------------------

export function registerSettingsIPC(getMainWindow: () => BrowserWindow | null): void {
  // --- config:getFeatureFlags — 获取启动时读取的功能开关快照 ---
  ipcMain.handle('config:getFeatureFlags', () => getFeatureFlags())

  // --- settings:get — 读取单个设置 ---
  ipcMain.handle('settings:get', (_event, { key }: { key: string }) => {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value || null
  })

  // --- settings:set — 写入单个设置 ---
  ipcMain.handle('settings:set', (_event, { key, value }: { key: string; value: string }) => {
    const db = getDatabase()
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  })

  // --- settings:getFolders — 获取所有音乐文件夹 ---
  ipcMain.handle('settings:getFolders', () => {
    const db = getDatabase()
    const rows = db.prepare('SELECT path FROM music_folders ORDER BY id').all() as { path: string }[]
    return rows.map(r => r.path)
  })

  // --- settings:addFolder — 添加音乐文件夹（打开文件夹选择对话框） ---
  ipcMain.handle('settings:addFolder', async () => {
    const win = getMainWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const folderPath = result.filePaths[0]
    const db = getDatabase()
    db.prepare('INSERT OR IGNORE INTO music_folders (path) VALUES (?)').run(folderPath)
    console.log('[IPC] 音乐文件夹已添加:', folderPath)
    return folderPath
  })

  // --- settings:removeFolder — 移除音乐文件夹 ---
  ipcMain.handle('settings:removeFolder', (_event, { path }: { path: string }) => {
    const db = getDatabase()

    // 构建 LIKE 模式：确保文件夹路径以路径分隔符结尾，再加通配符
    // Windows: C:\Music → C:\Music\%
    let folderPrefix = path
    if (!folderPrefix.endsWith(sep) && !folderPrefix.endsWith('/') && !folderPrefix.endsWith('\\')) {
      folderPrefix += sep
    }
    const pattern = folderPrefix + '%'

    // 删除该文件夹下的所有歌曲（外键 CASCADE 自动清理歌单/收藏/播放记录）
    const result = db.prepare('DELETE FROM songs WHERE file_path LIKE ?').run(pattern)
    console.log(`[IPC] 已清理歌曲: ${result.changes} 首 (pattern: ${pattern})`)

    // 删除文件夹记录
    db.prepare('DELETE FROM music_folders WHERE path = ?').run(path)
    console.log('[IPC] 音乐文件夹已移除:', path)

    return { deletedSongs: result.changes }
  })

  console.log('[IPC] 设置相关通道已注册')
}
