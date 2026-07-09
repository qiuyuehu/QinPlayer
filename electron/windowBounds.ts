// =============================================================================
// QinPlayer — 窗口位置与尺寸持久化
// =============================================================================
// 职责：读取、保存、校验并修正主窗口 bounds，避免窗口恢复到屏幕外
// =============================================================================

import { screen } from 'electron'
import { getDatabase } from './db/database'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState {
  isMaximized: boolean
  isMinimized: boolean
}

const WINDOW_BOUNDS_KEY = 'windowBounds'
const WINDOW_STATE_KEY = 'windowState'
const MIN_WIDTH = 800
const MIN_HEIGHT = 600
const MIN_TITLEBAR_VISIBLE = 60

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseWindowBounds(value: string): WindowBounds | null {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object') return null

    const candidate = parsed as Partial<WindowBounds>
    if (
      !isFiniteNumber(candidate.x) ||
      !isFiniteNumber(candidate.y) ||
      !isFiniteNumber(candidate.width) ||
      !isFiniteNumber(candidate.height)
    ) {
      return null
    }

    return {
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
    }
  } catch {
    return null
  }
}

function parseWindowState(value: string): WindowState | null {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object') return null

    const candidate = parsed as Partial<WindowState>
    if (typeof candidate.isMaximized !== 'boolean' || typeof candidate.isMinimized !== 'boolean') {
      return null
    }

    return {
      isMaximized: candidate.isMaximized,
      isMinimized: candidate.isMinimized,
    }
  } catch {
    return null
  }
}

export function loadWindowBounds(): WindowBounds | null {
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(WINDOW_BOUNDS_KEY) as { value: string } | undefined
    if (!row?.value) return null
    return parseWindowBounds(row.value)
  } catch (err) {
    console.warn('[WindowBounds] 读取窗口 bounds 失败:', err)
    return null
  }
}

export function saveWindowBounds(bounds: WindowBounds): void {
  try {
    const db = getDatabase()
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      WINDOW_BOUNDS_KEY,
      JSON.stringify(bounds)
    )
  } catch (err) {
    console.warn('[WindowBounds] 保存窗口 bounds 失败:', err)
  }
}

export function loadWindowState(): WindowState | null {
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(WINDOW_STATE_KEY) as { value: string } | undefined
    if (!row?.value) return null
    return parseWindowState(row.value)
  } catch (err) {
    console.warn('[WindowBounds] 读取窗口状态失败:', err)
    return null
  }
}

export function saveWindowState(state: WindowState): void {
  try {
    const db = getDatabase()
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      WINDOW_STATE_KEY,
      JSON.stringify(state)
    )
  } catch (err) {
    console.warn('[WindowBounds] 保存窗口状态失败:', err)
  }
}

export function normalizeWindowBounds(bounds: WindowBounds): WindowBounds | null {
  const displays = screen.getAllDisplays()
  if (displays.length === 0) return null

  const candidate: WindowBounds = {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(bounds.width, MIN_WIDTH),
    height: Math.max(bounds.height, MIN_HEIGHT),
  }

  const validDisplay = displays.find((display) => {
    const { x, y, width: displayWidth, height: displayHeight } = display.workArea
    const titlebarBottom = candidate.y + MIN_TITLEBAR_VISIBLE
    return candidate.x + candidate.width > x
      && titlebarBottom > y
      && candidate.x < x + displayWidth
      && candidate.y < y + displayHeight
  })

  if (!validDisplay) return null

  const { x, y, width: workWidth, height: workHeight } = validDisplay.workArea
  const clampedX = Math.max(x, Math.min(candidate.x, x + workWidth - candidate.width))
  const clampedY = Math.max(y, Math.min(candidate.y, y + workHeight - candidate.height))

  return { x: clampedX, y: clampedY, width: candidate.width, height: candidate.height }
}
