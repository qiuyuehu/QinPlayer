// =============================================================================
// QinPlayer — 关闭窗口协调器
// =============================================================================
// 职责：在主进程内协调关闭偏好、renderer 询问请求和最终窗口动作
// =============================================================================

import { randomUUID } from 'node:crypto'
import { normalizeCloseBehavior } from '../src/types/ipc'
import type { CloseDecision, CloseResponse } from '../src/types/ipc'

interface CloseEventLike {
  preventDefault: () => void
}

export interface CloseCoordinatorDependencies {
  readSetting: () => unknown
  saveSetting: (value: 'minimize' | 'exit') => void
  hasTray: () => boolean
  hide: () => void
  quit: () => void
  sendRequest: (payload: { requestId: string }) => void
  canSendRequest: () => boolean
  isCurrentSender: (sender: unknown) => boolean
  createRequestId?: () => string
  warn?: (...args: unknown[]) => void
}

export { normalizeCloseBehavior }

function isCloseDecision(value: unknown): value is CloseDecision {
  return value === 'minimize' || value === 'exit' || value === 'cancel'
}

export function createCloseCoordinator(dependencies: CloseCoordinatorDependencies) {
  const createRequestId = dependencies.createRequestId ?? randomUUID
  const warn = dependencies.warn ?? console.warn
  let isQuitting = false
  let rendererReady = false
  let pendingRequestId: string | null = null

  const minimize = (): void => {
    dependencies.hide()
  }

  const quit = (): void => {
    if (isQuitting) return
    isQuitting = true
    pendingRequestId = null
    dependencies.quit()
  }

  const handleClose = (event: CloseEventLike): void => {
    if (isQuitting) return

    let behavior: ReturnType<typeof normalizeCloseBehavior> = 'minimize'
    try {
      behavior = normalizeCloseBehavior(dependencies.readSetting())
    } catch (error) {
      warn('[CloseBehavior] 读取关闭偏好失败，已使用默认最小化:', error)
    }
    if (!dependencies.hasTray() || behavior === 'exit') {
      quit()
      return
    }

    event.preventDefault()
    if (behavior === 'minimize') {
      minimize()
      return
    }

    if (pendingRequestId) return
    if (!rendererReady || !dependencies.canSendRequest()) {
      minimize()
      return
    }

    const requestId = createRequestId()
    pendingRequestId = requestId
    try {
      dependencies.sendRequest({ requestId })
    } catch (error) {
      pendingRequestId = null
      warn('[CloseBehavior] 发送关闭询问失败，已回退到最小化:', error)
      minimize()
    }
  }

  const markRendererReady = (sender: unknown): void => {
    if (!dependencies.isCurrentSender(sender)) return
    rendererReady = true
  }

  const handleResponse = (sender: unknown, response: CloseResponse): void => {
    if (!dependencies.isCurrentSender(sender) || !response || typeof response !== 'object') return
    if (!pendingRequestId || response.requestId !== pendingRequestId) return
    if (!isCloseDecision(response.decision) || typeof response.remember !== 'boolean') return

    pendingRequestId = null
    if (response.decision === 'cancel') return

    if (response.remember) {
      try {
        dependencies.saveSetting(response.decision)
      } catch (error) {
        warn('[CloseBehavior] 保存关闭偏好失败:', error)
      }
    }

    if (response.decision === 'minimize') minimize()
    else quit()
  }

  const resetRenderer = (): void => {
    rendererReady = false
    pendingRequestId = null
  }

  const beforeQuit = (): void => {
    isQuitting = true
    pendingRequestId = null
  }

  return {
    handleClose,
    markRendererReady,
    handleResponse,
    resetRenderer,
    beforeQuit,
    quit,
    getState: () => ({ isQuitting, rendererReady, pendingRequestId }),
  }
}

export type CloseCoordinator = ReturnType<typeof createCloseCoordinator>
