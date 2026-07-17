import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  workers: [] as Array<{
    listeners: Map<string, (...args: unknown[]) => void>
  }>,
  getDatabase: vi.fn(),
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler)
    }),
    on: vi.fn(),
  },
  dialog: {
    showSaveDialog: mocks.showSaveDialog,
    showOpenDialog: mocks.showOpenDialog,
  },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
  app: { getPath: vi.fn(() => 'C:\\profile'), isPackaged: false },
  BrowserWindow: class {},
}))

vi.mock('worker_threads', () => {
  class WorkerMock {
    listeners = new Map<string, (...args: unknown[]) => void>()

    constructor() {
      mocks.workers.push(this)
    }

    on(event: string, listener: (...args: unknown[]) => void) {
      this.listeners.set(event, listener)
      return this
    }
  }

  return { default: { Worker: WorkerMock }, Worker: WorkerMock }
})

vi.mock('../electron/db/database', () => ({
  getDatabase: mocks.getDatabase,
  getDatabasePath: vi.fn(() => 'C:\\profile\\qinplayer.db'),
}))

vi.mock('../electron/db/databaseImport', () => ({
  importDatabaseBackup: vi.fn(),
}))

vi.mock('../electron/windowBounds', () => ({
  loadWindowBounds: vi.fn(),
  loadWindowState: vi.fn(),
  normalizeWindowBounds: vi.fn(),
}))

import { registerScanIPC } from '../electron/ipc/scan'
import { registerWindowIPC } from '../electron/ipc/window'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'

function createWindow() {
  return {
    webContents: {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      reload: vi.fn(),
    },
  }
}

describe('IPC 结构化错误脱敏', () => {
  let windowMock: ReturnType<typeof createWindow>

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.workers.length = 0
    windowMock = createWindow()
    mocks.getDatabase.mockReturnValue({
      prepare: vi.fn(() => ({ run: vi.fn(), all: vi.fn(() => []) })),
      pragma: vi.fn(),
    })
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:\\export\\backup.db' })
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
  })

  it('scan-folder 启动失败不应向 Renderer 泄露异常路径', async () => {
    registerScanIPC(() => windowMock as never)
    mocks.getDatabase.mockImplementationOnce(() => {
      throw new Error('C:\\secret\\library.db: database locked')
    })

    const result = await mocks.handlers.get('scan-folder')!({}, 'C:\\Music') as {
      success: boolean
      error?: string
    }

    expect(result.success).toBe(false)
    expect(result.error).toBe('扫描启动失败，请重试')
    expect(result.error).not.toContain('C:\\secret')
  })

  it('db:export 失败不应向 Renderer 泄露源或目标路径', async () => {
    registerWindowIPC(
      () => windowMock as never,
      () => ({ ...DEFAULT_FEATURE_FLAGS }),
      vi.fn(),
      vi.fn(),
    )
    mocks.getDatabase.mockImplementationOnce(() => {
      throw new Error('C:\\profile\\qinplayer.db: export failed')
    })

    const result = await mocks.handlers.get('db:export')!({}) as {
      success: boolean
      error?: string
    }

    expect(result.success).toBe(false)
    expect(result.error).toBe('数据库导出失败，请重试')
    expect(result.error).not.toContain('C:\\profile')
    expect(result.error).not.toContain('C:\\export')
  })

  it('单文件扫描错误事件不应暴露文件路径或 Worker 异常', async () => {
    registerScanIPC(() => windowMock as never)
    await mocks.handlers.get('scan-folder')!({}, 'C:\\Music')

    mocks.workers[0].listeners.get('message')!({
      type: 'file-error',
      data: {
        file: 'C:\\secret\\song.mp3',
        message: 'parser secret stack marker',
      },
    })

    expect(windowMock.webContents.send).toHaveBeenLastCalledWith(
      'scan:error',
      { message: '部分文件扫描失败，请检查文件权限' },
    )
  })

  it('Worker 终止错误事件不应暴露异常路径', async () => {
    registerScanIPC(() => windowMock as never)
    await mocks.handlers.get('scan-folder')!({}, 'C:\\Music')

    mocks.workers[0].listeners.get('error')!(new Error('C:\\secret\\worker.js stack marker'))

    expect(windowMock.webContents.send).toHaveBeenLastCalledWith(
      'scan:error',
      { message: '扫描失败，请重试' },
    )
  })
})
