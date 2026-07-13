import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  buildFromTemplate: vi.fn(),
  popup: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: electronMock.handle },
  Menu: { buildFromTemplate: electronMock.buildFromTemplate },
}))

import { registerContextMenuIPC } from '../electron/ipc/contextMenu'
import type { NativeTrackMenuAction, NativeTrackMenuEntry } from '../src/types/ipc'

interface FakeWebContents {
  isDestroyed: () => boolean
}

interface FakeWindow {
  webContents: FakeWebContents
  isDestroyed: () => boolean
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

describe('原生歌曲菜单 IPC', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  let senderDestroyed = false
  let windowDestroyed = false
  let sender: FakeWebContents
  let currentWindow: FakeWindow | null

  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
    senderDestroyed = false
    windowDestroyed = false
    sender = { isDestroyed: () => senderDestroyed }
    currentWindow = {
      webContents: sender,
      isDestroyed: () => windowDestroyed,
    }
    electronMock.handle.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    })
    electronMock.buildFromTemplate.mockReturnValue({ popup: electronMock.popup })
    registerContextMenuIPC(() => currentWindow as never)
  })

  function show(entries: NativeTrackMenuEntry[] = ALL_ENTRIES, eventSender: FakeWebContents = sender) {
    return handlers.get('context-menu:show-track')?.({ sender: eventSender }, { entries }) as Promise<NativeTrackMenuAction | null>
  }

  function template(): CapturedTemplateItem[] {
    return electronMock.buildFromTemplate.mock.calls.at(-1)?.[0] as CapturedTemplateItem[]
  }

  function popupOptions(): CapturedPopupOptions {
    return electronMock.popup.mock.calls.at(-1)?.[0] as CapturedPopupOptions
  }

  it('应该使用固定中文 label、enabled 和当前窗口构建菜单', async () => {
    const result = show()

    expect(template().map((item) => [item.label, item.enabled])).toEqual([
      ['播放', true],
      ['下一首播放', false],
      ['从接下来移除', true],
      ['从播放列表移除', true],
      ['打开文件所在目录', true],
      ['歌曲信息', true],
    ])
    expect(popupOptions().window).toBe(currentWindow)

    template()[0].click()
    expect(await result).toBe('play')
  })

  it('菜单关闭未选择时应该返回 null', async () => {
    const result = show([{ action: 'play', enabled: true }])

    popupOptions().callback()

    await expect(result).resolves.toBeNull()
  })

  it('click 与 popup callback 连续触发只应该 settle 一次并释放 pending', async () => {
    const first = show([{ action: 'show-info', enabled: true }])
    const firstPopup = popupOptions()
    template()[0].click()
    firstPopup.callback()
    await expect(first).resolves.toBe('show-info')

    const second = show([{ action: 'play', enabled: true }])
    popupOptions().callback()
    await expect(second).resolves.toBeNull()
  })

  it('已有 pending 菜单时第二次调用返回 null，完成后允许再次打开', async () => {
    const first = show([{ action: 'play', enabled: true }])
    const firstPopup = popupOptions()

    await expect(show([{ action: 'show-info', enabled: true }])).resolves.toBeNull()
    expect(electronMock.buildFromTemplate).toHaveBeenCalledTimes(1)

    firstPopup.callback()
    await expect(first).resolves.toBeNull()
    const third = show([{ action: 'show-info', enabled: true }])
    template()[0].click()
    await expect(third).resolves.toBe('show-info')
  })

  it.each([
    null,
    {},
    { entries: [] },
    { entries: [{ action: 'unknown', enabled: true }] },
    { entries: [{ action: 'play', enabled: 'yes' }] },
    { entries: [{ action: 'play', enabled: true }, { action: 'play', enabled: false }] },
    { entries: Array.from({ length: 9 }, (_, index) => ({ action: `bad-${index}`, enabled: true })) },
  ])('非法 payload %# 应该返回 null 且不构建菜单', async (payload) => {
    const handler = handlers.get('context-menu:show-track')

    await expect(Promise.resolve(handler?.({ sender }, payload))).resolves.toBeNull()
    expect(electronMock.buildFromTemplate).not.toHaveBeenCalled()
  })

  it('非当前 sender、缺失窗口和已销毁窗口均应该拒绝', async () => {
    const otherSender: FakeWebContents = { isDestroyed: () => false }
    await expect(show([{ action: 'play', enabled: true }], otherSender)).resolves.toBeNull()

    currentWindow = null
    await expect(show([{ action: 'play', enabled: true }])).resolves.toBeNull()

    currentWindow = { webContents: sender, isDestroyed: () => true }
    await expect(show([{ action: 'play', enabled: true }])).resolves.toBeNull()

    currentWindow = { webContents: sender, isDestroyed: () => false }
    senderDestroyed = true
    await expect(show([{ action: 'play', enabled: true }])).resolves.toBeNull()
    expect(electronMock.buildFromTemplate).not.toHaveBeenCalled()
  })

  it.each(['build', 'popup'] as const)('%s 抛错后应该返回 null 并释放 pending', async (stage) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    if (stage === 'build') {
      electronMock.buildFromTemplate.mockImplementationOnce(() => { throw new Error('build failed') })
    } else {
      electronMock.popup.mockImplementationOnce(() => { throw new Error('popup failed') })
    }

    await expect(show([{ action: 'play', enabled: true }])).resolves.toBeNull()

    const recovered = show([{ action: 'show-info', enabled: true }])
    template()[0].click()
    await expect(recovered).resolves.toBe('show-info')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('原生歌曲菜单'), expect.any(Error))
  })

  it('菜单构建期间窗口被销毁时应该返回 null 且不 popup', async () => {
    electronMock.buildFromTemplate.mockImplementationOnce(() => {
      windowDestroyed = true
      return { popup: electronMock.popup }
    })

    await expect(show([{ action: 'play', enabled: true }])).resolves.toBeNull()
    expect(electronMock.popup).not.toHaveBeenCalled()
  })

  it('共享类型、main 注册与 preload 白名单应该只增加 invoke 通道', () => {
    const preload = readFileSync(resolve('electron/preload.ts'), 'utf8')
    const main = readFileSync(resolve('electron/main.ts'), 'utf8')

    expect(preload.match(/'context-menu:show-track'/g)).toHaveLength(1)
    expect(main).toContain('registerContextMenuIPC(getMainWindow)')
  })
})
