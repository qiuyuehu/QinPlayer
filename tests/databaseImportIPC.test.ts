import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const importDatabaseBackup = vi.fn()
  const app = {
    isPackaged: false,
    relaunch: vi.fn(),
    exit: vi.fn(),
    getPath: vi.fn(() => 'C:\\profile'),
  }
  return { handlers, importDatabaseBackup, app }
})

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler)
    }),
  },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
  app: mocks.app,
  BrowserWindow: class {},
}))

vi.mock('../electron/db/database', () => ({
  getDatabase: vi.fn(),
  getDatabasePath: vi.fn(() => 'C:\\profile\\qinplayer.db'),
}))

vi.mock('../electron/db/databaseImport', () => ({
  importDatabaseBackup: mocks.importDatabaseBackup,
}))

vi.mock('../electron/windowBounds', () => ({
  loadWindowBounds: vi.fn(),
  loadWindowState: vi.fn(),
  normalizeWindowBounds: vi.fn(),
}))

import { registerWindowIPC } from '../electron/ipc/window'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'

function createWindow() {
  return {
    webContents: { reload: vi.fn() },
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
  }
}

describe('数据库导入 IPC', () => {
  let windowMock: ReturnType<typeof createWindow>

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.app.isPackaged = false
    windowMock = createWindow()
    registerWindowIPC(
      () => windowMock as never,
      () => ({ ...DEFAULT_FEATURE_FLAGS }),
      vi.fn(),
      vi.fn(),
    )
  })

  function apply(value: unknown) {
    return mocks.handlers.get('db:import-apply')!({}, value)
  }

  it.each([undefined, null, 1, '', '   '])('非法参数 %s 不应调用 importer 或重启', async (value) => {
    const result = await apply(value)

    expect(result).toMatchObject({ success: false })
    expect(result.error).toContain('数据库')
    expect(mocks.importDatabaseBackup).not.toHaveBeenCalled()
    expect(windowMock.webContents.reload).not.toHaveBeenCalled()
    expect(mocks.app.relaunch).not.toHaveBeenCalled()
    expect(mocks.app.exit).not.toHaveBeenCalled()
  })

  it('importer 普通失败不应 reload 或 relaunch', async () => {
    mocks.importDatabaseBackup.mockResolvedValue({ success: false, error: '候选数据库无效' })

    const result = await apply('C:\\backup.db')

    expect(result).toEqual({ success: false, error: '数据库导入失败，请检查备份文件后重试' })
    expect(windowMock.webContents.reload).not.toHaveBeenCalled()
    expect(mocks.app.relaunch).not.toHaveBeenCalled()
    expect(mocks.app.exit).not.toHaveBeenCalled()
  })

  it('importer 返回含路径的结构化失败时应该固定文案并保留 fatal 标记', async () => {
    mocks.importDatabaseBackup.mockResolvedValue({
      success: false,
      error: 'ENOENT C:\\Users\\owner\\QinPlayer\\qinplayer.db',
      fatal: true,
    })

    const result = await apply('C:\\backup.db')

    expect(result).toEqual({
      success: false,
      error: '数据库导入失败，请完全退出应用后重试',
      fatal: true,
    })
    expect(result.error).not.toContain('C:\\Users')
    expect(windowMock.webContents.reload).not.toHaveBeenCalled()
    expect(mocks.app.relaunch).not.toHaveBeenCalled()
  })

  it('开发模式只在 importer 成功完成后 reload 一次', async () => {
    const order: string[] = []
    mocks.importDatabaseBackup.mockImplementation(async () => {
      order.push('import-complete')
      return { success: true }
    })
    windowMock.webContents.reload.mockImplementation(() => { order.push('reload') })

    const result = await apply('C:\\backup.db')

    expect(result).toEqual({ success: true })
    expect(order).toEqual(['import-complete', 'reload'])
    expect(windowMock.webContents.reload).toHaveBeenCalledTimes(1)
    expect(mocks.app.relaunch).not.toHaveBeenCalled()
  })

  it('打包模式成功后只 relaunch/exit 一次，不 reload', async () => {
    mocks.app.isPackaged = true
    mocks.importDatabaseBackup.mockResolvedValue({ success: true })

    const result = await apply('C:\\backup.db')

    expect(result).toEqual({ success: true })
    expect(mocks.app.relaunch).toHaveBeenCalledTimes(1)
    expect(mocks.app.exit).toHaveBeenCalledWith(0)
    expect(windowMock.webContents.reload).not.toHaveBeenCalled()
  })

  it('importer 抛出时返回固定中文错误且不泄露异常内容', async () => {
    mocks.importDatabaseBackup.mockRejectedValue(new Error('secret stack marker'))

    const result = await apply('C:\\backup.db')

    expect(result).toMatchObject({ success: false })
    expect(result.error).toContain('数据库导入失败')
    expect(result.error).not.toContain('secret stack marker')
    expect(windowMock.webContents.reload).not.toHaveBeenCalled()
    expect(mocks.app.relaunch).not.toHaveBeenCalled()
  })
})
