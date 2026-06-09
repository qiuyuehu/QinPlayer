// =============================================================================
// QinPlayer — 设置相关 IPC Handler
// =============================================================================
// 职责：设置键值对读写、音乐文件夹管理
// =============================================================================

import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'

// ---------------------------------------------------------------------------
// 注册所有设置相关 IPC 通道
// ---------------------------------------------------------------------------

export function registerSettingsIPC(): void {
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

  // --- settings:addFolder — 添加音乐文件夹 ---
  ipcMain.handle('settings:addFolder', (_event, { path }: { path: string }) => {
    const db = getDatabase()
    db.prepare('INSERT OR IGNORE INTO music_folders (path) VALUES (?)').run(path)
    console.log('[IPC] 音乐文件夹已添加:', path)
  })

  // --- settings:removeFolder — 移除音乐文件夹 ---
  ipcMain.handle('settings:removeFolder', (_event, { path }: { path: string }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM music_folders WHERE path = ?').run(path)
    console.log('[IPC] 音乐文件夹已移除:', path)
  })

  console.log('[IPC] 设置相关通道已注册')
}
