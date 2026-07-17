// =============================================================================
// QinPlayer — 单次扫描 Worker 终止门
// =============================================================================
// 不访问数据库或窗口；每个 Worker 必须拥有独立实例。
// =============================================================================

import { win32 } from 'path'
import type { FilesystemSnapshot, ScannerWorkerMessage } from '../scanTypes'

export type ScanRunDecision =
  | {
      type: 'successful-terminal'
      snapshot: FilesystemSnapshot
      total: number
    }
  | {
      type: 'failed-terminal'
      reason: string
    }

export interface ScanRunState {
  handleMessage(message: ScannerWorkerMessage): ScanRunDecision | null
  handleWorkerError(error: unknown): ScanRunDecision | null
  handleProtocolError(reason: string): ScanRunDecision | null
  handleExit(code: number): ScanRunDecision | null
  isTerminal(): boolean
}

function cloneSnapshot(snapshot: FilesystemSnapshot): FilesystemSnapshot {
  return {
    roots: [...snapshot.roots],
    existingPaths: [...snapshot.existingPaths],
    unavailablePaths: [...snapshot.unavailablePaths]
  }
}

function normalizeRootKeys(roots: readonly string[]): string[] | null {
  const keys = new Set<string>()
  for (const root of roots) {
    if (typeof root !== 'string' || !win32.isAbsolute(root)) return null
    keys.add(win32.resolve(root).toLowerCase())
  }
  return keys.size > 0 ? [...keys].sort() : null
}

function hasSameRoots(expected: string[], actualRoots: readonly string[]): boolean {
  const actual = normalizeRootKeys(actualRoots)
  return actual !== null
    && actual.length === expected.length
    && actual.every((root, index) => root === expected[index])
}

/** 创建一个不可跨 Worker 复用的纯状态机。 */
export function createScanRunState(expectedRoots?: readonly string[]): ScanRunState {
  let snapshot: FilesystemSnapshot | null = null
  let doneTotal: number | null = null
  let terminal = false
  const expectedRootKeys = expectedRoots === undefined ? null : normalizeRootKeys(expectedRoots)

  const fail = (reason: string): ScanRunDecision | null => {
    if (terminal) return null
    terminal = true
    snapshot = null
    doneTotal = null
    return { type: 'failed-terminal', reason }
  }

  return {
    handleMessage(message) {
      if (terminal) return null
      switch (message.type) {
        case 'filesystem-snapshot':
          if (snapshot) return fail('重复的 filesystem-snapshot')
          if (expectedRoots !== undefined
            && (!expectedRootKeys || !hasSameRoots(expectedRootKeys, message.data.roots))) {
            return fail('filesystem-snapshot roots 与本轮注册 roots 不一致')
          }
          snapshot = cloneSnapshot(message.data)
          return null
        case 'done':
          if (doneTotal !== null) return fail('重复的 done')
          doneTotal = message.data.total
          return null
        case 'fatal-error':
          return fail(message.data.message)
        default:
          return null
      }
    },
    handleWorkerError(error) {
      return fail(`Worker 异常: ${String(error)}`)
    },
    handleProtocolError(reason) {
      return fail(`Worker 消息无效: ${reason}`)
    },
    handleExit(code) {
      if (terminal) return null
      if (code !== 0) return fail(`Worker 非零退出: ${code}`)
      if (!snapshot) return fail('Worker 退出时缺少合法 filesystem-snapshot')
      if (doneTotal === null) return fail('Worker 退出时缺少 done')

      terminal = true
      const decision: ScanRunDecision = {
        type: 'successful-terminal',
        snapshot,
        total: doneTotal
      }
      snapshot = null
      doneTotal = null
      return decision
    },
    isTerminal() {
      return terminal
    }
  }
}
