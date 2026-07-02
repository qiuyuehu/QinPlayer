// =============================================================================
// QinPlayer — 系统托盘模块
// =============================================================================
// 职责：创建系统托盘、右键菜单、点击恢复窗口
// 设计：关闭窗口时隐藏到托盘继续播放，不退出应用
// =============================================================================

import { Tray, Menu, app, nativeImage } from 'electron'
import { join } from 'path'

// ---------------------------------------------------------------------------
// 全局引用
// ---------------------------------------------------------------------------

let tray: Tray | null = null
let getMainWindow: () => Electron.BrowserWindow | null
let getIsPlaying: () => boolean
let setIsQuitting: () => void
let onPlayPause: () => void
let onPrev: () => void
let onNext: () => void

// ---------------------------------------------------------------------------
// 创建托盘
// ---------------------------------------------------------------------------

export function createTray(
  mainWindowGetter: () => Electron.BrowserWindow | null,
  isPlayingGetter: () => boolean,
  setIsQuittingFn: () => void,
  playPauseHandler: () => void,
  prevHandler: () => void,
  nextHandler: () => void
): void {
  // 保存回调引用
  getMainWindow = mainWindowGetter
  getIsPlaying = isPlayingGetter
  setIsQuitting = setIsQuittingFn
  onPlayPause = playPauseHandler
  onPrev = prevHandler
  onNext = nextHandler

  // 托盘图标路径
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'assets/tray-icon.png')
    : join(__dirname, '../../assets/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  // 创建托盘
  tray = new Tray(icon)
  tray.setToolTip('QinPlayer')

  // 更新右键菜单
  updateMenu()

  // 点击托盘图标 → 显示主窗口
  tray.on('click', () => {
    const win = getMainWindow()
    if (win) {
      win.show()
      win.focus()
    }
  })
}

// ---------------------------------------------------------------------------
// 更新右键菜单（播放状态变化时调用）
// ---------------------------------------------------------------------------

export function updateMenu(): void {
  if (!tray) return

  const isPlaying = getIsPlaying()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isPlaying ? '暂停' : '播放',
      click: onPlayPause
    },
    { type: 'separator' },
    {
      label: '上一首',
      click: onPrev
    },
    {
      label: '下一首',
      click: onNext
    },
    { type: 'separator' },
    {
      label: '显示主窗口',
      click: () => {
        const win = getMainWindow()
        if (win) {
          win.show()
          win.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        setIsQuitting()
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

// ---------------------------------------------------------------------------
// 销毁托盘
// ---------------------------------------------------------------------------

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
