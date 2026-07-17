// =============================================================================
// QinPlayer — 系统托盘模块
// =============================================================================
// 职责：创建系统托盘、右键菜单、点击恢复窗口
// 设计：关闭窗口时隐藏到托盘继续播放，不退出应用
// =============================================================================

import { Tray, Menu, app, nativeImage } from 'electron'
import { join } from 'path'
import type { FeatureFlags } from '../src/types/ipc'

interface TrayWindow {
  show: () => void
  focus: () => void
}

interface TrayHandle<TMenu> {
  setToolTip: (tooltip: string) => void
  setContextMenu: (menu: TMenu) => void
  on: (event: 'click', listener: () => void) => unknown
  destroy: () => void
}

export interface TrayControllerAdapter<TMenu = unknown> {
  createTray: () => TrayHandle<TMenu>
  buildMenu: (template: Electron.MenuItemConstructorOptions[]) => TMenu
}

export interface TrayControllerBindings {
  getMainWindow: () => TrayWindow | null
  getIsPlaying: () => boolean
  quit: () => void
  playPause: () => void
  previous: () => void
  next: () => void
  flags: FeatureFlags
}

interface ActiveTray<TMenu> {
  tray: TrayHandle<TMenu>
  bindings: TrayControllerBindings
}

function showMainWindow(getMainWindow: TrayControllerBindings['getMainWindow']): void {
  const win = getMainWindow()
  if (!win) return
  win.show()
  win.focus()
}

function buildTrayTemplate(bindings: TrayControllerBindings): Electron.MenuItemConstructorOptions[] {
  const playbackItems: Electron.MenuItemConstructorOptions[] = bindings.flags.playback
    ? [
        {
          label: bindings.getIsPlaying() ? '暂停' : '播放',
          click: bindings.playPause,
        },
        { type: 'separator' },
        {
          label: '上一首',
          click: bindings.previous,
        },
        {
          label: '下一首',
          click: bindings.next,
        },
        { type: 'separator' },
      ]
    : []

  return [
    ...playbackItems,
    {
      label: '显示主窗口',
      click: () => showMainWindow(bindings.getMainWindow),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: bindings.quit,
    },
  ]
}

export function createTrayController<TMenu>(adapter: TrayControllerAdapter<TMenu>) {
  let active: ActiveTray<TMenu> | null = null

  const destroy = (): void => {
    if (!active) return
    const current = active
    active = null
    current.tray.destroy()
  }

  const updateMenu = (): void => {
    if (!active) return
    const menu = adapter.buildMenu(buildTrayTemplate(active.bindings))
    active.tray.setContextMenu(menu)
  }

  const create = (bindings: TrayControllerBindings): void => {
    destroy()
    const tray = adapter.createTray()
    active = { tray, bindings }
    tray.setToolTip('QinPlayer')
    updateMenu()
    tray.on('click', () => showMainWindow(bindings.getMainWindow))
  }

  return { create, updateMenu, destroy }
}

const electronTrayController = createTrayController<Electron.Menu>({
  createTray: () => {
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, 'assets/tray-icon.png')
      : join(__dirname, '../../assets/tray-icon.png')
    const icon = nativeImage.createFromPath(iconPath)
    return new Tray(icon)
  },
  buildMenu: (template) => Menu.buildFromTemplate(template),
})

// ---------------------------------------------------------------------------
// 创建托盘
// ---------------------------------------------------------------------------

export function createTray(
  mainWindowGetter: () => Electron.BrowserWindow | null,
  isPlayingGetter: () => boolean,
  quitAppFn: () => void,
  playPauseHandler: () => void,
  prevHandler: () => void,
  nextHandler: () => void,
  flags: FeatureFlags
): void {
  electronTrayController.create({
    getMainWindow: mainWindowGetter,
    getIsPlaying: isPlayingGetter,
    quit: quitAppFn,
    playPause: playPauseHandler,
    previous: prevHandler,
    next: nextHandler,
    flags,
  })
}

// ---------------------------------------------------------------------------
// 更新右键菜单（播放状态变化时调用）
// ---------------------------------------------------------------------------

export function updateMenu(): void {
  electronTrayController.updateMenu()
}

// ---------------------------------------------------------------------------
// 销毁托盘
// ---------------------------------------------------------------------------

export function destroyTray(): void {
  electronTrayController.destroy()
}
