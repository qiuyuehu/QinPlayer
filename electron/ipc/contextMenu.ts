// =============================================================================
// QinPlayer — 原生歌曲菜单 IPC
// =============================================================================
// 职责：校验受限菜单动作，绑定当前主窗口弹出原生菜单，并返回单次选择结果
// =============================================================================

import { ipcMain, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { NativeTrackMenuAction, NativeTrackMenuEntry } from '../../src/types/ipc'

const ACTION_LABELS: Record<NativeTrackMenuAction, string> = {
  play: '播放',
  'insert-next': '下一首播放',
  'remove-priority': '从接下来移除',
  'remove-playlist': '从播放列表移除',
  'open-location': '打开文件所在目录',
  'show-info': '歌曲信息',
}

function parseEntries(payload: unknown): NativeTrackMenuEntry[] | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const entries = (payload as { entries?: unknown }).entries
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 8) return null

  const actions = new Set<NativeTrackMenuAction>()
  const parsed: NativeTrackMenuEntry[] = []
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null
    const { action, enabled } = entry as { action?: unknown; enabled?: unknown }
    if (
      typeof action !== 'string'
      || !Object.prototype.hasOwnProperty.call(ACTION_LABELS, action)
      || typeof enabled !== 'boolean'
    ) return null

    const typedAction = action as NativeTrackMenuAction
    if (actions.has(typedAction)) return null
    actions.add(typedAction)
    parsed.push({ action: typedAction, enabled })
  }
  return parsed
}

export function registerContextMenuIPC(getMainWindow: () => BrowserWindow | null): void {
  let menuPending = false

  ipcMain.handle('context-menu:show-track', async (event, payload: unknown): Promise<NativeTrackMenuAction | null> => {
    const currentWindow = getMainWindow()
    if (
      !currentWindow
      || currentWindow.isDestroyed()
      || currentWindow.webContents.isDestroyed()
      || event.sender !== currentWindow.webContents
    ) {
      console.warn('[IPC] 原生歌曲菜单拒绝非当前窗口请求')
      return null
    }

    const entries = parseEntries(payload)
    if (!entries) {
      console.warn('[IPC] 原生歌曲菜单参数无效')
      return null
    }
    if (menuPending) return null
    menuPending = true

    return await new Promise<NativeTrackMenuAction | null>((resolve) => {
      let settled = false
      const settle = (action: NativeTrackMenuAction | null): void => {
        if (settled) return
        settled = true
        menuPending = false
        resolve(action)
      }

      try {
        const template: MenuItemConstructorOptions[] = entries.map(({ action, enabled }) => ({
          label: ACTION_LABELS[action],
          enabled,
          click: () => settle(action),
        }))
        const menu = Menu.buildFromTemplate(template)
        if (currentWindow.isDestroyed() || currentWindow.webContents.isDestroyed()) {
          settle(null)
          return
        }
        menu.popup({ window: currentWindow, callback: () => settle(null) })
      } catch (error) {
        console.error('[IPC] 弹出原生歌曲菜单失败:', error)
        settle(null)
      }
    })
  })
}
