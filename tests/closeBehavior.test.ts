import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCloseCoordinator, normalizeCloseBehavior } from '../electron/closeBehavior'
import type { CloseResponse } from '../src/types/ipc'

function setup(options: { setting?: string | null; tray?: boolean; available?: boolean } = {}) {
  const sender = {}
  const otherSender = {}
  const preventDefault = vi.fn()
  const hide = vi.fn()
  const quit = vi.fn()
  const sendRequest = vi.fn()
  const saveSetting = vi.fn()
  const warn = vi.fn()
  let setting = options.setting ?? null
  let tray = options.tray ?? true
  let available = options.available ?? true
  const coordinator = createCloseCoordinator({
    readSetting: () => setting,
    saveSetting,
    hasTray: () => tray,
    hide,
    quit,
    sendRequest,
    canSendRequest: () => available,
    isCurrentSender: (candidate) => candidate === sender,
    createRequestId: () => 'request-1',
    warn,
  })

  return {
    coordinator,
    sender,
    otherSender,
    event: { preventDefault },
    preventDefault,
    hide,
    quit,
    sendRequest,
    saveSetting,
    warn,
    setSetting: (value: string | null) => { setting = value },
    setTray: (value: boolean) => { tray = value },
    setAvailable: (value: boolean) => { available = value },
  }
}

describe('CloseCoordinator', () => {
  beforeEach(() => vi.clearAllMocks())

  it('缺失和非法设置归一为 minimize', () => {
    expect(normalizeCloseBehavior(null)).toBe('minimize')
    expect(normalizeCloseBehavior('broken')).toBe('minimize')
    expect(normalizeCloseBehavior('ask')).toBe('ask')
  })

  it('读取设置失败时按默认最小化继续处理', () => {
    const context = setup()
    const readFailure = createCloseCoordinator({
      readSetting: () => { throw new Error('db') },
      saveSetting: context.saveSetting,
      hasTray: () => true,
      hide: context.hide,
      quit: context.quit,
      sendRequest: context.sendRequest,
      canSendRequest: () => true,
      isCurrentSender: () => true,
      warn: context.warn,
    })

    readFailure.handleClose(context.event)
    expect(context.preventDefault).toHaveBeenCalledTimes(1)
    expect(context.hide).toHaveBeenCalledTimes(1)
    expect(context.warn).toHaveBeenCalled()
  })

  it('minimize 有托盘时同步阻止并隐藏，无托盘时退出', () => {
    const context = setup({ setting: 'minimize' })
    context.coordinator.handleClose(context.event)
    expect(context.preventDefault).toHaveBeenCalledTimes(1)
    expect(context.hide).toHaveBeenCalledTimes(1)

    const noTray = setup({ setting: 'minimize', tray: false })
    noTray.coordinator.handleClose(noTray.event)
    expect(noTray.preventDefault).not.toHaveBeenCalled()
    expect(noTray.hide).not.toHaveBeenCalled()
    expect(noTray.quit).toHaveBeenCalledTimes(1)
  })

  it('exit 不发请求且重复退出只执行一次', () => {
    const context = setup({ setting: 'exit' })
    context.coordinator.handleClose(context.event)
    context.coordinator.quit()
    expect(context.sendRequest).not.toHaveBeenCalled()
    expect(context.quit).toHaveBeenCalledTimes(1)
  })

  it('ask 先阻止关闭，ready 后只发送一个关联请求', () => {
    const context = setup({ setting: 'ask' })
    context.coordinator.markRendererReady(context.sender)
    context.coordinator.handleClose(context.event)
    context.coordinator.handleClose(context.event)

    expect(context.preventDefault).toHaveBeenCalledTimes(2)
    expect(context.sendRequest).toHaveBeenCalledTimes(1)
    expect(context.sendRequest).toHaveBeenCalledWith({ requestId: 'request-1' })
  })

  it('sender、requestId 和 decision 非法时均无副作用', () => {
    const context = setup({ setting: 'ask' })
    context.coordinator.markRendererReady(context.sender)
    context.coordinator.handleClose(context.event)
    const responses: CloseResponse[] = [
      { requestId: 'old', decision: 'exit', remember: false },
      { requestId: 'request-1', decision: 'invalid' as CloseResponse['decision'], remember: false },
    ]
    context.coordinator.handleResponse(context.otherSender, { requestId: 'request-1', decision: 'exit', remember: false })
    responses.forEach((response) => context.coordinator.handleResponse(context.sender, response))

    expect(context.hide).not.toHaveBeenCalled()
    expect(context.quit).not.toHaveBeenCalled()
    expect(context.saveSetting).not.toHaveBeenCalled()
  })

  it.each([
    ['minimize', true, 'minimize'],
    ['exit', true, 'exit'],
    ['cancel', false, null],
  ] as const)('处理 %s 结果且 remember 语义正确', (decision, remember, saved) => {
    const context = setup({ setting: 'ask' })
    context.coordinator.markRendererReady(context.sender)
    context.coordinator.handleClose(context.event)
    context.coordinator.handleResponse(context.sender, { requestId: 'request-1', decision, remember })

    if (saved) expect(context.saveSetting).toHaveBeenCalledWith(saved)
    else expect(context.saveSetting).not.toHaveBeenCalled()
    expect(context.hide).toHaveBeenCalledTimes(decision === 'minimize' ? 1 : 0)
    expect(context.quit).toHaveBeenCalledTimes(decision === 'exit' ? 1 : 0)

    context.coordinator.handleResponse(context.sender, { requestId: 'request-1', decision, remember })
    expect(context.hide).toHaveBeenCalledTimes(decision === 'minimize' ? 1 : 0)
    expect(context.quit).toHaveBeenCalledTimes(decision === 'exit' ? 1 : 0)
  })

  it('保存偏好失败仍执行本次选择并记录错误', () => {
    const context = setup({ setting: 'ask' })
    context.saveSetting.mockImplementation(() => { throw new Error('db') })
    context.coordinator.markRendererReady(context.sender)
    context.coordinator.handleClose(context.event)
    context.coordinator.handleResponse(context.sender, { requestId: 'request-1', decision: 'minimize', remember: true })

    expect(context.warn).toHaveBeenCalled()
    expect(context.hide).toHaveBeenCalledTimes(1)
  })

  it('renderer 未 ready、不可用或发送异常时回退最小化且不留 pending', () => {
    const notReady = setup({ setting: 'ask' })
    notReady.coordinator.handleClose(notReady.event)
    expect(notReady.hide).toHaveBeenCalledTimes(1)
    expect(notReady.coordinator.getState().pendingRequestId).toBeNull()

    const unavailable = setup({ setting: 'ask', available: false })
    unavailable.coordinator.markRendererReady(unavailable.sender)
    unavailable.coordinator.handleClose(unavailable.event)
    expect(unavailable.hide).toHaveBeenCalledTimes(1)

    const sendFailure = setup({ setting: 'ask' })
    sendFailure.sendRequest.mockImplementation(() => { throw new Error('send') })
    sendFailure.coordinator.markRendererReady(sendFailure.sender)
    sendFailure.coordinator.handleClose(sendFailure.event)
    expect(sendFailure.hide).toHaveBeenCalledTimes(1)
    expect(sendFailure.coordinator.getState().pendingRequestId).toBeNull()
  })

  it('before-quit 和 renderer 重置清理状态并绕过询问', () => {
    const context = setup({ setting: 'ask' })
    context.coordinator.markRendererReady(context.sender)
    context.coordinator.handleClose(context.event)
    context.coordinator.resetRenderer()
    expect(context.coordinator.getState()).toEqual({ isQuitting: false, rendererReady: false, pendingRequestId: null })

    context.coordinator.markRendererReady(context.sender)
    context.coordinator.handleClose(context.event)
    context.coordinator.beforeQuit()
    context.coordinator.handleClose(context.event)
    expect(context.coordinator.getState().isQuitting).toBe(true)
    expect(context.sendRequest).toHaveBeenCalledTimes(2)
  })
})
