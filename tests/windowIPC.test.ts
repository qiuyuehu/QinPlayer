import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  on: vi.fn(),
  handle: vi.fn(),
}))

const boundsMock = vi.hoisted(() => ({
  loadWindowBounds: vi.fn(),
  loadWindowState: vi.fn(),
  normalizeWindowBounds: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { on: electronMock.on, handle: electronMock.handle },
  dialog: {},
  shell: {},
  app: {},
  BrowserWindow: class {},
}))

vi.mock('../electron/db/database', () => ({
  getDatabase: vi.fn(),
  getDatabasePath: vi.fn(() => 'C:\\profile\\qinplayer.db'),
}))

vi.mock('../electron/db/databaseImport', () => ({
  importDatabaseBackup: vi.fn(),
}))

vi.mock('../electron/windowBounds', () => boundsMock)

import { registerWindowIPC } from '../electron/ipc/window'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'

function createWindow() {
  return {
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: vi.fn(() => false),
    setAlwaysOnTop: vi.fn(),
    setResizable: vi.fn(),
    setMinimumSize: vi.fn(),
    hide: vi.fn(),
    setSize: vi.fn(),
    setBounds: vi.fn(),
    center: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    webContents: { reload: vi.fn() },
  }
}

describe('Mini 窗口 IPC', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  let windowMock: ReturnType<typeof createWindow>
  let setMiniMode: ReturnType<typeof vi.fn>
  let saveCurrentWindowBoundsNow: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
    windowMock = createWindow()
    setMiniMode = vi.fn()
    saveCurrentWindowBoundsNow = vi.fn()
    electronMock.on.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    })
    boundsMock.loadWindowState.mockReturnValue(null)
    boundsMock.loadWindowBounds.mockReturnValue(null)
    boundsMock.normalizeWindowBounds.mockReturnValue(null)
  })

  function register(flags = { ...DEFAULT_FEATURE_FLAGS }) {
    registerWindowIPC(
      () => windowMock as never,
      () => flags,
      setMiniMode,
      saveCurrentWindowBoundsNow,
    )
  }

  function setMiniModeFromRenderer(isMini: unknown) {
    handlers.get('window:set-mini-mode')?.({}, isMini)
  }

  it('进入 Mini 应该先锁定拉伸，再设置固定尺寸', () => {
    register()

    setMiniModeFromRenderer(true)

    expect(saveCurrentWindowBoundsNow).toHaveBeenCalledTimes(1)
    expect(setMiniMode).toHaveBeenCalledWith(true)
    expect(windowMock.setResizable).toHaveBeenCalledWith(false)
    expect(windowMock.setSize).toHaveBeenCalledWith(400, 150)
    expect(windowMock.setResizable.mock.invocationCallOrder[0]).toBeLessThan(
      windowMock.setSize.mock.invocationCallOrder[0],
    )
  })

  it.each(['true', 1, null, undefined])('非法 Mini payload %s 应该记录并忽略', (value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    register()

    setMiniModeFromRenderer(value)

    expect(setMiniMode).not.toHaveBeenCalled()
    expect(windowMock.setSize).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[IPC] window:set-mini-mode 参数无效:', value)
    warn.mockRestore()
  })

  it('退出 Mini 应该先恢复拉伸，再按保存的 bounds 恢复窗口', () => {
    const bounds = { x: 80, y: 90, width: 1100, height: 720 }
    boundsMock.loadWindowBounds.mockReturnValue(bounds)
    boundsMock.normalizeWindowBounds.mockReturnValue(bounds)
    register({ ...DEFAULT_FEATURE_FLAGS, windowSizePersist: true })

    setMiniModeFromRenderer(false)

    expect(setMiniMode).toHaveBeenCalledWith(false)
    expect(windowMock.setResizable).toHaveBeenCalledWith(true)
    expect(windowMock.setBounds).toHaveBeenCalledWith(bounds)
    expect(windowMock.setResizable.mock.invocationCallOrder[0]).toBeLessThan(
      windowMock.setBounds.mock.invocationCallOrder[0],
    )
  })

  it('无保存 bounds 时退出 Mini 应该保留默认尺寸恢复分支', () => {
    register({ ...DEFAULT_FEATURE_FLAGS, windowSizePersist: false })

    setMiniModeFromRenderer(false)

    expect(windowMock.setResizable).toHaveBeenCalledWith(true)
    expect(windowMock.setSize).toHaveBeenCalledWith(1000, 680)
    expect(windowMock.center).toHaveBeenCalledTimes(1)
  })
})
