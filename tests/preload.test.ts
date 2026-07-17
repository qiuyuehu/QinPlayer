import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMock.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronMock.invoke,
    send: electronMock.send,
    on: electronMock.on,
    removeListener: electronMock.removeListener,
  },
}))

import { electronAPI, getAudioUrl, getAvatarUrl, getCoverUrl } from '../electron/preload'
import { contextMenuAPI } from '../electron/contextMenuPreload'

describe('preload media URL helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('audio/cover 只编码 song id 与 mtime cache version', () => {
    expect(getAudioUrl(7, 1234.5)).toBe('qinplayer://audio?id=7&v=1234.5')
    expect(getCoverUrl(7, 1234.5)).toBe('qinplayer://cover?id=7&v=1234.5')
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('非法 song id %s 不生成 URL', (id) => {
    expect(() => getAudioUrl(id, 0)).toThrow('正安全整数')
    expect(() => getCoverUrl(id, 0)).toThrow('正安全整数')
  })

  it('avatar 固定 current id，v 只取最后一个文件名', () => {
    expect(getAvatarUrl('C:\\Users\\Name\\avatar one.png')).toBe(
      'qinplayer://avatar?id=current&v=avatar%20one.png',
    )
    expect(getAvatarUrl('/home/user/avatar.jpg')).toBe('qinplayer://avatar?id=current&v=avatar.jpg')
  })
})

describe('preload typed IPC surface', () => {
  beforeEach(() => vi.clearAllMocks())

  it('合法 invoke/send 方向通过，未知通道在运行时拒绝', async () => {
    electronMock.invoke.mockResolvedValueOnce([])
    await expect(electronAPI.invoke('songs:getAll')).resolves.toEqual([])
    expect(electronMock.invoke).toHaveBeenCalledWith('songs:getAll')

    electronAPI.send('theme-changed', 'dark')
    expect(electronMock.send).toHaveBeenCalledWith('theme-changed', 'dark')

    const unsafeInvoke = electronAPI.invoke as unknown as (channel: string) => Promise<unknown>
    const unsafeSend = electronAPI.send as unknown as (channel: string) => void
    await expect(unsafeInvoke('context-menu:window-get-init')).rejects.toThrow('不在白名单')
    unsafeSend('songs:getAll')
    expect(electronMock.send).toHaveBeenCalledTimes(1)
  })

  it('event listener 转发 tuple 并返回精确 unsubscribe', () => {
    let subscription: ((_event: unknown, ...args: unknown[]) => void) | undefined
    electronMock.on.mockImplementation((_channel, listener) => { subscription = listener })
    const callback = vi.fn()
    const unsubscribe = electronAPI.on('window:maximized', callback)

    subscription?.({}, true)
    expect(callback).toHaveBeenCalledWith(true)
    unsubscribe()
    expect(electronMock.removeListener).toHaveBeenCalledWith('window:maximized', subscription)

    const unsafeOn = electronAPI.on as unknown as (
      channel: string,
      callback: (...args: unknown[]) => void,
    ) => () => void
    expect(unsafeOn('set-auto-launch', callback)).toEqual(expect.any(Function))
    expect(electronMock.on).toHaveBeenCalledTimes(1)
  })

  it('便利方法复用真实 typed channel', async () => {
    electronMock.invoke.mockResolvedValueOnce({ playback: true })
    electronAPI.minimize()
    electronAPI.maximize()
    electronAPI.close()
    electronAPI.setAlwaysOnTop(true)
    await electronAPI.getFeatureFlags()

    expect(electronMock.send.mock.calls).toEqual([
      ['window:minimize'],
      ['window:maximize'],
      ['window:close'],
      ['window:set-always-on-top', true],
    ])
    expect(electronMock.invoke).toHaveBeenCalledWith('config:getFeatureFlags')
  })

  it('Mini 菜单 preload 只调用三个专用 invoke', async () => {
    electronMock.invoke.mockResolvedValue(null)
    expect(Object.keys(contextMenuAPI).sort()).toEqual(['getInit', 'ready', 'resolve'])

    await contextMenuAPI.getInit()
    await contextMenuAPI.ready()
    await contextMenuAPI.resolve('play')

    expect(electronMock.invoke.mock.calls).toEqual([
      ['context-menu:window-get-init'],
      ['context-menu:window-ready'],
      ['context-menu:window-resolve', { action: 'play' }],
    ])
  })
})
