import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  buildFromTemplate: vi.fn(),
  popup: vi.fn(),
  BrowserWindow: vi.fn(),
  getCursorScreenPoint: vi.fn(),
  getDisplayNearestPoint: vi.fn(),
  isPackaged: false,
}))

vi.mock('electron', () => ({
  app: { get isPackaged() { return electronMock.isPackaged } },
  ipcMain: { handle: electronMock.handle },
  Menu: { buildFromTemplate: electronMock.buildFromTemplate },
  BrowserWindow: electronMock.BrowserWindow,
  screen: {
    getCursorScreenPoint: electronMock.getCursorScreenPoint,
    getDisplayNearestPoint: electronMock.getDisplayNearestPoint,
  },
}))

import { registerContextMenuIPC } from '../electron/ipc/contextMenu'
import type { NativeTrackMenuAction, NativeTrackMenuEntry } from '../src/types/ipc'

type Listener = (...args: unknown[]) => void

function createEmitter() {
  const listeners = new Map<string, Listener[]>()
  return {
    once: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    }),
    removeListener: vi.fn((event: string, listener: Listener) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== listener))
    }),
    emit(event: string, ...args: unknown[]) {
      const eventListeners = listeners.get(event) ?? []
      listeners.delete(event)
      eventListeners.forEach((listener) => listener(...args))
    },
  }
}

interface FakeWebContents extends ReturnType<typeof createEmitter> {
  isDestroyed: () => boolean
}

interface FakeWindow extends ReturnType<typeof createEmitter> {
  webContents: FakeWebContents
  isDestroyed: () => boolean
  destroy: () => void
  show: () => void
  focus: () => void
  loadURL: (url: string) => Promise<void>
  loadFile: (path: string) => Promise<void>
}

interface CapturedTemplateItem {
  label: string
  enabled: boolean
  click: () => void
}

interface CapturedPopupOptions {
  window: FakeWindow
  callback: () => void
}

const ALL_ENTRIES: NativeTrackMenuEntry[] = [
  { action: 'play', enabled: true },
  { action: 'insert-next', enabled: false },
  { action: 'remove-priority', enabled: true },
  { action: 'remove-playlist', enabled: true },
  { action: 'open-location', enabled: true },
  { action: 'show-info', enabled: true },
]

function createWindow(): FakeWindow {
  let destroyed = false
  const windowEmitter = createEmitter()
  const webContentsEmitter = createEmitter()
  return {
    ...windowEmitter,
    webContents: { ...webContentsEmitter, isDestroyed: () => destroyed },
    isDestroyed: () => destroyed,
    destroy: vi.fn(() => { destroyed = true }),
    show: vi.fn(),
    focus: vi.fn(),
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
  }
}

describe('Mini 歌曲菜单 IPC', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  let owner: FakeWindow | null
  let child: FakeWindow

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    handlers.clear()
    electronMock.isPackaged = false
    owner = createWindow()
    child = createWindow()
    electronMock.handle.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    })
    electronMock.BrowserWindow.mockImplementation(function () { return child })
    electronMock.buildFromTemplate.mockReturnValue({ popup: electronMock.popup })
    electronMock.getCursorScreenPoint.mockReturnValue({ x: 100, y: 100 })
    electronMock.getDisplayNearestPoint.mockReturnValue({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    registerContextMenuIPC(() => owner as never)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  function show(
    entries: NativeTrackMenuEntry[] = ALL_ENTRIES,
    eventSender: FakeWebContents = owner!.webContents,
    payload: Record<string, unknown> = {},
  ) {
    return handlers.get('context-menu:show-track')?.({ sender: eventSender }, {
      entries,
      theme: 'dark',
      reducedMotion: false,
      ...payload,
    }) as Promise<NativeTrackMenuAction | null>
  }

  function getInit(eventSender: FakeWebContents = child.webContents) {
    return handlers.get('context-menu:window-get-init')?.({ sender: eventSender })
  }

  function ready(eventSender: FakeWebContents = child.webContents) {
    return handlers.get('context-menu:window-ready')?.({ sender: eventSender })
  }

  function resolveAction(action: unknown, eventSender: FakeWebContents = child.webContents) {
    return handlers.get('context-menu:window-resolve')?.({ sender: eventSender }, { action })
  }

  function template(): CapturedTemplateItem[] {
    return electronMock.buildFromTemplate.mock.calls.at(-1)?.[0] as CapturedTemplateItem[]
  }

  function popupOptions(): CapturedPopupOptions {
    return electronMock.popup.mock.calls.at(-1)?.[0] as CapturedPopupOptions
  }

  it('合法请求应该创建受限透明子窗口，并在 ready 后显示', async () => {
    const result = show()

    expect(electronMock.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      parent: owner,
      show: false,
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      width: 176,
      height: 206,
      webPreferences: expect.objectContaining({
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: expect.stringContaining('contextMenu.js'),
      }),
    }))
    expect(child.loadURL).toHaveBeenCalledWith('http://localhost:5173/mini-context-menu.html')
    expect(getInit()).toEqual({
      entries: ALL_ENTRIES.map((entry) => ({
        ...entry,
        label: expect.any(String),
      })),
      theme: 'dark',
      reducedMotion: false,
    })

    ready()
    expect(child.show).toHaveBeenCalledTimes(1)
    expect(child.focus).toHaveBeenCalledTimes(1)
    resolveAction('play')
    await expect(result).resolves.toBe('play')
  })

  it('单条菜单应该使用相同公式计算窗口高度', async () => {
    const result = show([{ action: 'play', enabled: true }])

    expect(electronMock.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      width: 176,
      height: 56,
    }))
    resolveAction(null)
    await expect(result).resolves.toBeNull()
  })

  it('主窗口 sender 和 payload 不合法时应该拒绝', async () => {
    const otherSender = createWindow().webContents
    await expect(show(ALL_ENTRIES, otherSender)).resolves.toBeNull()
    await expect(show(ALL_ENTRIES, owner!.webContents, { theme: 'system' })).resolves.toBeNull()
    await expect(show(ALL_ENTRIES, owner!.webContents, { reducedMotion: 'false' })).resolves.toBeNull()
    await expect(show([{ action: 'play', enabled: true }, { action: 'play', enabled: false }])).resolves.toBeNull()
    expect(electronMock.BrowserWindow).not.toHaveBeenCalled()
  })

  it('内部通道只接受 active child sender，且只返回固定 label', async () => {
    const result = show([{ action: 'play', enabled: true }])
    const otherSender = createWindow().webContents

    expect(getInit(otherSender)).toBeNull()
    ready(otherSender)
    resolveAction('play', otherSender)
    expect(child.show).not.toHaveBeenCalled()

    expect(getInit()).toEqual({
      entries: [{ action: 'play', enabled: true, label: '播放' }],
      theme: 'dark',
      reducedMotion: false,
    })
    resolveAction('play')
    await expect(result).resolves.toBe('play')
  })

  it('disabled 或未知 action 不应该完成选择', async () => {
    const result = show([{ action: 'play', enabled: false }])

    resolveAction('play')
    resolveAction('unknown')
    await Promise.resolve()
    expect(child.destroy).not.toHaveBeenCalled()

    resolveAction(null)
    await expect(result).resolves.toBeNull()
  })

  it('pending 时第二次请求返回 null，settle 后允许新请求', async () => {
    const first = show([{ action: 'play', enabled: true }])
    await expect(show([{ action: 'show-info', enabled: true }])).resolves.toBeNull()
    expect(electronMock.BrowserWindow).toHaveBeenCalledTimes(1)

    resolveAction(null)
    await expect(first).resolves.toBeNull()
    child = createWindow()
    const second = show([{ action: 'show-info', enabled: true }])
    resolveAction('show-info')
    await expect(second).resolves.toBe('show-info')
  })

  it.each(['closed', 'render-process-gone', 'blur'] as const)('%s 应该单次 settle 并释放 pending', async (event) => {
    const first = show([{ action: 'play', enabled: true }])
    if (event === 'blur') ready()
    if (event === 'render-process-gone') child.webContents.emit(event)
    else child.emit(event)
    await expect(first).resolves.toBeNull()

    child = createWindow()
    const second = show([{ action: 'show-info', enabled: true }])
    resolveAction('show-info')
    await expect(second).resolves.toBe('show-info')
  })

  it('子窗口加载失败或 ready 超时应该降级到固定 label 的原生菜单', async () => {
    const first = show([{ action: 'play', enabled: true }])
    child.loadURL.mockRejectedValueOnce(new Error('load failed'))
    child.webContents.emit('did-fail-load')

    expect(template()).toEqual([{ label: '播放', enabled: true, click: expect.any(Function) }])
    template()[0].click()
    await expect(first).resolves.toBe('play')

    child = createWindow()
    const second = show([{ action: 'show-info', enabled: true }])
    vi.advanceTimersByTime(2000)
    expect(template()).toEqual([{ label: '歌曲信息', enabled: true, click: expect.any(Function) }])
    popupOptions().callback()
    await expect(second).resolves.toBeNull()
  })

  it.each(['build', 'popup'] as const)('原生 fallback %s 抛错后应该返回 null', async (stage) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = show([{ action: 'play', enabled: true }])
    if (stage === 'build') {
      electronMock.buildFromTemplate.mockImplementationOnce(() => { throw new Error('build failed') })
    } else {
      electronMock.popup.mockImplementationOnce(() => { throw new Error('popup failed') })
    }
    child.webContents.emit('did-fail-load')

    await expect(result).resolves.toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('四边位置应该 clamp 到当前显示器工作区内', async () => {
    electronMock.getDisplayNearestPoint.mockReturnValue({ workArea: { x: 10, y: 20, width: 300, height: 260 } })
    electronMock.getCursorScreenPoint.mockReturnValue({ x: 999, y: 999 })
    const result = show([{ action: 'play', enabled: true }])

    expect(electronMock.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({ x: 130, y: 220 }))
    resolveAction(null)
    await expect(result).resolves.toBeNull()
  })

  it('专用 preload 才能访问内部通道，主 preload 保留唯一公开 invoke', () => {
    const mainPreload = readFileSync(resolve('electron/preload.ts'), 'utf8')
    const dedicatedPreload = readFileSync(resolve('electron/contextMenuPreload.ts'), 'utf8')

    expect(mainPreload.match(/'context-menu:show-track'/g)).toHaveLength(1)
    expect(mainPreload).not.toContain('context-menu:window-get-init')
    expect(dedicatedPreload).toContain('context-menu:window-get-init')
    expect(dedicatedPreload).toContain('context-menu:window-ready')
    expect(dedicatedPreload).toContain('context-menu:window-resolve')
  })
})
