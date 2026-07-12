// =============================================================================
// QinPlayer — 均衡器相关 IPC Handler
// =============================================================================
// 职责：均衡器设置的读写持久化（存入 SQLite settings 表的 eq_gains 字段）
// 数据格式：eq_gains 为 JSON 数组字符串，如 "[0,2,4,0,0,0,0,0,0,0]"
// =============================================================================

import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'

// 均衡器默认增益（10段全部为 0dB，平直响应）
const DEFAULT_EQ_GAINS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const EQ_GAIN_MIN = -12
const EQ_GAIN_MAX = 12

function isValidEqGains(gains: unknown): gains is number[] {
  return Array.isArray(gains)
    && gains.length === DEFAULT_EQ_GAINS.length
    && gains.every((gain) => typeof gain === 'number' && Number.isFinite(gain) && gain >= EQ_GAIN_MIN && gain <= EQ_GAIN_MAX)
}

// ---------------------------------------------------------------------------
// 注册均衡器相关 IPC 通道
// ---------------------------------------------------------------------------

export function registerEqIPC(): void {
  // --- eq:get — 读取均衡器增益设置 ---
  ipcMain.handle('eq:get', () => {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('eq_gains') as { value: string } | undefined
    // 返回 JSON 数组字符串，未设置则返回 null
    return row?.value || null
  })

  // --- eq:save — 保存均衡器增益设置 ---
  ipcMain.handle('eq:save', (_event, payload: unknown) => {
    const gains = typeof payload === 'object' && payload !== null
      ? (payload as { gains?: unknown }).gains
      : undefined
    if (!isValidEqGains(gains)) {
      console.error('[IPC] eq:save 参数无效:', gains)
      return { success: false, error: '均衡器增益必须是 10 个 -12 到 12 的有限数值' }
    }

    const db = getDatabase()
    const jsonStr = JSON.stringify(gains)
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('eq_gains', jsonStr)
    console.log('[IPC] 均衡器设置已保存:', jsonStr)
    return { success: true }
  })

  console.log('[IPC] 均衡器通道已注册')
}

/** 获取均衡器默认增益值（供其他模块使用） */
export function getDefaultEqGains(): number[] {
  return [...DEFAULT_EQ_GAINS]
}
