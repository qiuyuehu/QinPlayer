import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: electronMock.handle,
    on: electronMock.on,
  },
}))

import { handleIpc, isBooleanIpcPayload, onIpc, sendIpc } from '../electron/ipc/typedIpc'

describe('typed Electron IPC boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('handleIpc 保持正常结果和 tuple 不变', async () => {
    const business = vi.fn(async (_event: unknown, folderPath: string) => ({
      success: true as const,
      folderPath,
    }))
    handleIpc('scan-folder', business)

    const registered = electronMock.handle.mock.calls[0][1] as (
      event: unknown,
      ...args: unknown[]
    ) => Promise<unknown>
    await expect(registered({}, 'C:\\Music')).resolves.toEqual({
      success: true,
      folderPath: 'C:\\Music',
    })
    expect(electronMock.handle).toHaveBeenCalledWith('scan-folder', expect.any(Function))
  })

  it('handleIpc 记录原始异常但只拒绝固定中文错误', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    handleIpc('songs:getAll', () => {
      throw new Error('C:\\private\\qinplayer.db locked')
    })
    const registered = electronMock.handle.mock.calls[0][1] as (event: unknown) => Promise<unknown>

    let exposed: unknown
    try {
      await registered({})
    } catch (error) {
      exposed = error
    }

    expect(log).toHaveBeenCalledWith('[IPC] songs:getAll 调用失败:', expect.any(Error))
    expect(exposed).toBeInstanceOf(Error)
    expect((exposed as Error).message).toBe('IPC 调用失败，请重试')
    expect(String(exposed)).not.toContain('C:\\private')
    log.mockRestore()
  })

  it('handleIpc 不改写已返回的结构化失败', async () => {
    handleIpc('eq:save', () => ({ success: false, error: '参数无效' }))
    const registered = electronMock.handle.mock.calls[0][1] as (event: unknown) => Promise<unknown>

    await expect(registered({})).resolves.toEqual({ success: false, error: '参数无效' })
  })

  it('onIpc 捕获 send handler 异常且不穿透事件循环', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    onIpc('player:playing-changed', () => {
      throw new Error('bad payload')
    })
    const registered = electronMock.on.mock.calls[0][1] as (
      event: unknown,
      ...args: unknown[]
    ) => void

    expect(() => registered({}, true)).not.toThrow()
    expect(log).toHaveBeenCalledWith('[IPC] player:playing-changed 消息处理失败:', expect.any(Error))
    log.mockRestore()
  })

  it('onIpc 也应该消费异步 listener rejection', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    onIpc('player:playing-changed', async () => {
      await Promise.resolve()
      throw new Error('async bad payload')
    })
    const registered = electronMock.on.mock.calls[0][1] as (event: unknown, value: unknown) => void

    expect(() => registered({}, true)).not.toThrow()
    await vi.waitFor(() => {
      expect(log).toHaveBeenCalledWith(
        '[IPC] player:playing-changed 消息处理失败:',
        expect.any(Error),
      )
    })
    log.mockRestore()
  })

  it('boolean send payload guard 只接受真实 boolean', () => {
    expect(isBooleanIpcPayload(true)).toBe(true)
    expect(isBooleanIpcPayload(false)).toBe(true)
    expect(isBooleanIpcPayload('false')).toBe(false)
    expect(isBooleanIpcPayload(1)).toBe(false)
    expect(isBooleanIpcPayload(null)).toBe(false)
  })

  it('sendIpc 只向存活 target 发送 event tuple', () => {
    const target = { send: vi.fn(), isDestroyed: vi.fn(() => false) }
    sendIpc(target, 'window:maximized', true)
    expect(target.send).toHaveBeenCalledWith('window:maximized', true)

    target.isDestroyed.mockReturnValue(true)
    sendIpc(target, 'window:maximized', false)
    sendIpc(null, 'window:maximized', false)
    expect(target.send).toHaveBeenCalledTimes(1)
  })
})
