import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTrayController, type TrayControllerAdapter } from '../electron/tray'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { FeatureFlags } from '../src/types/ipc'

interface MockWindow {
  show: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
}

interface MockTray {
  setToolTip: ReturnType<typeof vi.fn>
  setContextMenu: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  click: (() => void) | null
}

function createHarness(flags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS }) {
  const templates: Electron.MenuItemConstructorOptions[][] = []
  const trays: MockTray[] = []
  const adapter: TrayControllerAdapter = {
    createTray: () => {
      const tray: MockTray = {
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'click') tray.click = callback
        }),
        destroy: vi.fn(),
        click: null,
      }
      trays.push(tray)
      return tray
    },
    buildMenu: (template) => {
      templates.push(template)
      return { template }
    },
  }
  const window: MockWindow = { show: vi.fn(), focus: vi.fn() }
  const getMainWindow = vi.fn(() => window)
  const getIsPlaying = vi.fn(() => false)
  const quit = vi.fn()
  const playPause = vi.fn()
  const previous = vi.fn()
  const next = vi.fn()
  const controller = createTrayController(adapter)

  controller.create({ getMainWindow, getIsPlaying, quit, playPause, previous, next, flags })

  return {
    adapter,
    controller,
    templates,
    trays,
    window,
    getMainWindow,
    getIsPlaying,
    quit,
    playPause,
    previous,
    next,
  }
}

function labels(template: Electron.MenuItemConstructorOptions[]): string[] {
  return template.map((item) => item.type === 'separator' ? 'separator' : String(item.label))
}

function clickItem(template: Electron.MenuItemConstructorOptions[], label: string): void {
  const click = template.find((item) => item.label === label)?.click as (() => void) | undefined
  if (!click) throw new Error(`missing tray item: ${label}`)
  click()
}

describe('tray controller', () => {
  beforeEach(() => vi.clearAllMocks())

  it('playback=true 时按固定顺序构造完整菜单', () => {
    const harness = createHarness()

    expect(labels(harness.templates.at(-1)!)).toEqual([
      '播放', 'separator', '上一首', '下一首', 'separator', '显示主窗口', 'separator', '退出',
    ])
  })

  it('播放状态变化后 updateMenu 在播放和暂停标签间切换', () => {
    const harness = createHarness()
    harness.getIsPlaying.mockReturnValue(true)

    harness.controller.updateMenu()

    expect(labels(harness.templates.at(-1)!)[0]).toBe('暂停')
  })

  it('playback=false 时只保留显示窗口和退出相关项', () => {
    const harness = createHarness({ ...DEFAULT_FEATURE_FLAGS, playback: false })

    expect(labels(harness.templates.at(-1)!)).toEqual(['显示主窗口', 'separator', '退出'])
  })

  it('托盘 click 和显示主窗口菜单都执行 show + focus', () => {
    const harness = createHarness()

    harness.trays[0].click?.()
    clickItem(harness.templates.at(-1)!, '显示主窗口')

    expect(harness.window.show).toHaveBeenCalledTimes(2)
    expect(harness.window.focus).toHaveBeenCalledTimes(2)
  })

  it('播放、上一首、下一首和退出精确路由一次', () => {
    const harness = createHarness()
    const template = harness.templates.at(-1)!

    clickItem(template, '播放')
    clickItem(template, '上一首')
    clickItem(template, '下一首')
    clickItem(template, '退出')

    expect(harness.playPause).toHaveBeenCalledTimes(1)
    expect(harness.previous).toHaveBeenCalledTimes(1)
    expect(harness.next).toHaveBeenCalledTimes(1)
    expect(harness.quit).toHaveBeenCalledTimes(1)
  })

  it('updateMenu 在托盘尚未创建时无副作用', () => {
    const buildMenu = vi.fn()
    const createTray = vi.fn()
    const controller = createTrayController({ createTray, buildMenu })

    controller.updateMenu()

    expect(buildMenu).not.toHaveBeenCalled()
    expect(createTray).not.toHaveBeenCalled()
  })

  it('destroy 幂等并清除活动托盘引用', () => {
    const harness = createHarness()
    const buildCount = harness.templates.length

    harness.controller.destroy()
    harness.controller.destroy()
    harness.controller.updateMenu()

    expect(harness.trays[0].destroy).toHaveBeenCalledTimes(1)
    expect(harness.templates).toHaveLength(buildCount)
  })

  it('create/destroy/create 使用新 callback 和 flag', () => {
    const harness = createHarness()
    const oldWindow = harness.window
    harness.controller.destroy()
    const newWindow: MockWindow = { show: vi.fn(), focus: vi.fn() }
    const newQuit = vi.fn()

    harness.controller.create({
      getMainWindow: () => newWindow,
      getIsPlaying: () => true,
      quit: newQuit,
      playPause: vi.fn(),
      previous: vi.fn(),
      next: vi.fn(),
      flags: { ...DEFAULT_FEATURE_FLAGS, playback: false },
    })

    expect(labels(harness.templates.at(-1)!)).toEqual(['显示主窗口', 'separator', '退出'])
    harness.trays[1].click?.()
    clickItem(harness.templates.at(-1)!, '退出')
    expect(newWindow.show).toHaveBeenCalledTimes(1)
    expect(newWindow.focus).toHaveBeenCalledTimes(1)
    expect(newQuit).toHaveBeenCalledTimes(1)
    expect(oldWindow.show).not.toHaveBeenCalled()
    expect(harness.quit).not.toHaveBeenCalled()
  })
})
