// =============================================================================
// QinPlayer — Mini 歌曲菜单 IPC
// =============================================================================
// 职责：校验受限菜单动作，优先显示主题子窗口，失败时回退 Electron 原生菜单
// =============================================================================

import { app, BrowserWindow, Menu, screen, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import type {
  NativeTrackMenuAction,
  NativeTrackMenuDisplayEntry,
  NativeTrackMenuEntry,
  NativeTrackMenuWindowInit,
} from '../../src/types/ipc'
import { handleIpc } from './typedIpc'

const MENU_WINDOW_WIDTH = 176
const MENU_ITEM_HEIGHT = 30
// shell 上下 16px + 菜单上下 8px + 上下边框 2px。
const MENU_WINDOW_CHROME_HEIGHT = 26
const MENU_WINDOW_GUTTER = 4
const MENU_READY_TIMEOUT_MS = 2000

const ACTION_LABELS: Record<NativeTrackMenuAction, string> = {
  play: '播放',
  'insert-next': '下一首播放',
  'remove-priority': '从接下来移除',
  'remove-playlist': '从播放列表移除',
  'open-location': '打开文件所在目录',
  'show-info': '歌曲信息',
}

interface MenuRequest {
  entries: NativeTrackMenuEntry[]
  theme: 'dark' | 'light'
  reducedMotion: boolean
}

interface ActiveMenu {
  child: BrowserWindow | null
  entries: NativeTrackMenuEntry[]
  init: NativeTrackMenuWindowInit
  resolve: (action: NativeTrackMenuAction | null) => void
  timeout: ReturnType<typeof setTimeout> | null
  settled: boolean
  fallback: boolean
  cleanup: () => void
}

function parseEntries(value: unknown): NativeTrackMenuEntry[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null

  const actions = new Set<NativeTrackMenuAction>()
  const parsed: NativeTrackMenuEntry[] = []
  for (const entry of value) {
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

function parseRequest(payload: unknown): MenuRequest | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const { entries, theme, reducedMotion } = payload as {
    entries?: unknown
    theme?: unknown
    reducedMotion?: unknown
  }
  const parsedEntries = parseEntries(entries)
  if (!parsedEntries || (theme !== 'dark' && theme !== 'light') || typeof reducedMotion !== 'boolean') return null

  return { entries: parsedEntries, theme, reducedMotion }
}

function parseResolvedAction(payload: unknown): NativeTrackMenuAction | null | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const { action } = payload as { action?: unknown }
  if (action === null) return null
  return typeof action === 'string' && Object.prototype.hasOwnProperty.call(ACTION_LABELS, action)
    ? action as NativeTrackMenuAction
    : undefined
}

function getMenuPosition(width: number, height: number): { x: number; y: number } {
  const anchor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(anchor)
  const maxX = workArea.x + workArea.width - width - MENU_WINDOW_GUTTER
  const maxY = workArea.y + workArea.height - height - MENU_WINDOW_GUTTER
  return {
    x: Math.max(workArea.x + MENU_WINDOW_GUTTER, Math.min(anchor.x, maxX)),
    y: Math.max(workArea.y + MENU_WINDOW_GUTTER, Math.min(anchor.y, maxY)),
  }
}

function getMenuUrl(): string {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
  return `${rendererUrl.replace(/\/$/, '')}/mini-context-menu.html`
}

export function registerContextMenuIPC(getMainWindow: () => BrowserWindow | null): void {
  let activeMenu: ActiveMenu | null = null

  const settle = (menu: ActiveMenu, action: NativeTrackMenuAction | null): void => {
    if (menu.settled || activeMenu !== menu) return
    menu.settled = true
    activeMenu = null
    if (menu.timeout) clearTimeout(menu.timeout)
    menu.cleanup()
    const child = menu.child
    menu.child = null
    if (child && !child.isDestroyed()) {
      try {
        child.destroy()
      } catch (error) {
        console.warn('[IPC] 销毁 Mini 菜单窗口失败:', error)
      }
    }
    menu.resolve(action)
  }

  const openNativeFallback = (menu: ActiveMenu, owner: BrowserWindow): void => {
    if (menu.settled || activeMenu !== menu || menu.fallback) return
    menu.fallback = true
    if (menu.timeout) clearTimeout(menu.timeout)
    menu.cleanup()
    const child = menu.child
    menu.child = null
    if (child && !child.isDestroyed()) child.destroy()

    try {
      const template: MenuItemConstructorOptions[] = menu.entries.map(({ action, enabled }) => ({
        label: ACTION_LABELS[action],
        enabled,
        click: () => settle(menu, action),
      }))
      const nativeMenu = Menu.buildFromTemplate(template)
      if (owner.isDestroyed() || owner.webContents.isDestroyed()) {
        settle(menu, null)
        return
      }
      nativeMenu.popup({ window: owner, callback: () => settle(menu, null) })
    } catch (error) {
      console.error('[IPC] 弹出原生歌曲菜单失败:', error)
      settle(menu, null)
    }
  }

  handleIpc('context-menu:show-track', async (event, payload: unknown): Promise<NativeTrackMenuAction | null> => {
    const owner = getMainWindow()
    if (
      !owner
      || owner.isDestroyed()
      || owner.webContents.isDestroyed()
      || event.sender !== owner.webContents
    ) {
      console.warn('[IPC] Mini 菜单拒绝非当前窗口请求')
      return null
    }

    const request = parseRequest(payload)
    if (!request) {
      console.warn('[IPC] Mini 菜单参数无效')
      return null
    }
    if (activeMenu) return null

    return await new Promise<NativeTrackMenuAction | null>((resolve) => {
      const displayEntries: NativeTrackMenuDisplayEntry[] = request.entries.map((entry) => ({
        ...entry,
        label: ACTION_LABELS[entry.action],
      }))
      const height = request.entries.length * MENU_ITEM_HEIGHT + MENU_WINDOW_CHROME_HEIGHT
      const init: NativeTrackMenuWindowInit = {
        entries: displayEntries,
        theme: request.theme,
        reducedMotion: request.reducedMotion,
      }
      const menu: ActiveMenu = {
        child: null,
        entries: request.entries,
        init,
        resolve,
        timeout: null,
        settled: false,
        fallback: false,
        cleanup: () => {},
      }
      activeMenu = menu

      try {
        const position = getMenuPosition(MENU_WINDOW_WIDTH, height)
        const child = new BrowserWindow({
          parent: owner,
          show: false,
          x: position.x,
          y: position.y,
          width: MENU_WINDOW_WIDTH,
          height,
          transparent: true,
          frame: false,
          resizable: false,
          movable: false,
          minimizable: false,
          maximizable: false,
          skipTaskbar: true,
          backgroundColor: '#00000000',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: join(__dirname, '../preload/contextMenu.js'),
          },
        })
        menu.child = child

        const handleChildClosed = () => settle(menu, null)
        const handleRenderGone = () => settle(menu, null)
        const handleLoadFailure = () => openNativeFallback(menu, owner)
        const handleOwnerClosed = () => settle(menu, null)
        menu.cleanup = () => {
          child.removeListener('closed', handleChildClosed)
          child.webContents.removeListener('render-process-gone', handleRenderGone)
          child.webContents.removeListener('did-fail-load', handleLoadFailure)
          owner.removeListener('closed', handleOwnerClosed)
        }
        child.once('closed', handleChildClosed)
        child.webContents.once('render-process-gone', handleRenderGone)
        child.webContents.once('did-fail-load', handleLoadFailure)
        owner.once('closed', handleOwnerClosed)
        menu.timeout = setTimeout(() => openNativeFallback(menu, owner), MENU_READY_TIMEOUT_MS)

        const load = app.isPackaged
          ? child.loadFile(join(__dirname, '../renderer/mini-context-menu.html'))
          : child.loadURL(getMenuUrl())
        void load.catch(() => openNativeFallback(menu, owner))
      } catch (error) {
        console.error('[IPC] 创建 Mini 菜单窗口失败:', error)
        openNativeFallback(menu, owner)
      }
    })
  })

  handleIpc('context-menu:window-get-init', (event): NativeTrackMenuWindowInit | null => {
    const child = activeMenu?.child
    if (!child || child.isDestroyed() || event.sender !== child.webContents) {
      console.warn('[IPC] Mini 菜单初始化拒绝非活动窗口请求')
      return null
    }
    return activeMenu.init
  })

  handleIpc('context-menu:window-ready', (event): void => {
    const menu = activeMenu
    const child = menu?.child
    if (!menu || !child || child.isDestroyed() || event.sender !== child.webContents) {
      console.warn('[IPC] Mini 菜单 ready 拒绝非活动窗口请求')
      return
    }
    if (menu.timeout) clearTimeout(menu.timeout)
    child.once('blur', () => settle(menu, null))
    child.show()
    child.focus()
  })

  handleIpc('context-menu:window-resolve', (event, payload: unknown): void => {
    const menu = activeMenu
    const child = menu?.child
    if (!menu || !child || child.isDestroyed() || event.sender !== child.webContents) {
      console.warn('[IPC] Mini 菜单结果拒绝非活动窗口请求')
      return
    }

    const action = parseResolvedAction(payload)
    if (action === undefined) {
      console.warn('[IPC] Mini 菜单结果参数无效')
      return
    }
    if (action !== null && !menu.entries.some((entry) => entry.action === action && entry.enabled)) {
      console.warn('[IPC] Mini 菜单拒绝未启用动作')
      return
    }
    settle(menu, action)
  })
}
