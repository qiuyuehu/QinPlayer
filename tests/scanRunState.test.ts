import { describe, expect, it } from 'vitest'
import { createScanRunState } from '../electron/ipc/scanRunState'
import { isScannerWorkerMessage, type FilesystemSnapshot } from '../electron/scanTypes'

const SNAPSHOT: FilesystemSnapshot = {
  roots: ['C:\\Music'],
  existingPaths: ['C:\\Music\\A.mp3'],
  unavailablePaths: []
}

const snapshotMessage = { type: 'filesystem-snapshot', data: SNAPSHOT } as const
const doneMessage = { type: 'done', data: { total: 1 } } as const

describe('scanRunState', () => {
  it('只有 snapshot 且缺少 done 时不应该成功', () => {
    const state = createScanRunState()
    expect(state.handleMessage(snapshotMessage)).toBeNull()
    expect(state.handleExit(0)).toMatchObject({ type: 'failed-terminal' })
  })

  it('只有 done 且没有合法 snapshot 时不应该成功', () => {
    const state = createScanRunState()
    expect(state.handleMessage(doneMessage)).toBeNull()
    expect(state.handleExit(0)).toMatchObject({ type: 'failed-terminal' })
  })

  it('snapshot 和 done 后仍应该等待同一 Worker 的 exit(0)', () => {
    const state = createScanRunState()
    expect(state.handleMessage(snapshotMessage)).toBeNull()
    expect(state.handleMessage(doneMessage)).toBeNull()
    expect(state.handleExit(0)).toEqual({
      type: 'successful-terminal',
      snapshot: SNAPSHOT,
      total: 1
    })
  })

  it('done 早到时只能缓存并等待 snapshot 与 exit(0)', () => {
    const state = createScanRunState()
    expect(state.handleMessage(doneMessage)).toBeNull()
    expect(state.handleMessage(snapshotMessage)).toBeNull()
    expect(state.handleExit(0)).toMatchObject({ type: 'successful-terminal' })
  })

  it('Worker error 事件应该使本轮失败并丢弃快照', () => {
    const state = createScanRunState()
    state.handleMessage(snapshotMessage)
    state.handleMessage(doneMessage)
    expect(state.handleWorkerError(new Error('worker crashed')))
      .toMatchObject({ type: 'failed-terminal' })
    expect(state.handleExit(0)).toBeNull()
  })

  it('fatal-error 应该使本轮失败', () => {
    const state = createScanRunState()
    state.handleMessage(snapshotMessage)
    expect(state.handleMessage({
      type: 'fatal-error',
      data: { message: 'fatal' }
    })).toMatchObject({ type: 'failed-terminal' })
  })

  it('非零 exit 应该使本轮失败', () => {
    const state = createScanRunState()
    state.handleMessage(snapshotMessage)
    state.handleMessage(doneMessage)
    expect(state.handleExit(1)).toMatchObject({ type: 'failed-terminal' })
  })

  it('消息校验失败应该使本轮失败且删除 0 条', () => {
    const state = createScanRunState()
    state.handleMessage(snapshotMessage)
    expect(isScannerWorkerMessage({
      type: 'filesystem-snapshot',
      data: { roots: ['C:\\Music'], existingPaths: 'bad', unavailablePaths: [] }
    })).toBe(false)
    expect(state.handleProtocolError('invalid message'))
      .toMatchObject({ type: 'failed-terminal' })
    expect(state.handleExit(0)).toBeNull()
  })

  it('相对路径快照应该在消息校验阶段被拒绝', () => {
    expect(isScannerWorkerMessage({
      type: 'filesystem-snapshot',
      data: { roots: ['Music'], existingPaths: [], unavailablePaths: [] }
    })).toBe(false)
  })

  it('snapshot roots 与 Worker 启动 roots 不一致时应该失败', () => {
    const state = createScanRunState(['C:\\Music'])
    expect(state.handleMessage({
      type: 'filesystem-snapshot',
      data: { roots: ['D:\\Other'], existingPaths: [], unavailablePaths: [] }
    })).toMatchObject({ type: 'failed-terminal' })
  })

  it('snapshot roots 的大小写、重复和尾分隔符不应该造成误拒绝', () => {
    const state = createScanRunState(['C:\\Music', 'c:\\music\\'])
    expect(state.handleMessage(snapshotMessage)).toBeNull()
    state.handleMessage(doneMessage)
    expect(state.handleExit(0)).toMatchObject({ type: 'successful-terminal' })
  })

  it('成功只应该结算一次且重复消息或 exit 不得重复成功', () => {
    const state = createScanRunState()
    state.handleMessage(snapshotMessage)
    state.handleMessage(doneMessage)
    expect(state.handleExit(0)).toMatchObject({ type: 'successful-terminal' })
    expect(state.handleMessage(doneMessage)).toBeNull()
    expect(state.handleExit(0)).toBeNull()
  })

  it('两个 Worker 的状态不能拼成一次成功', () => {
    const workerA = createScanRunState()
    const workerB = createScanRunState()
    workerA.handleMessage(snapshotMessage)
    workerA.handleMessage(doneMessage)

    expect(workerB.handleExit(0)).toMatchObject({ type: 'failed-terminal' })
    expect(workerA.isTerminal()).toBe(false)
    expect(workerA.handleExit(0)).toMatchObject({ type: 'successful-terminal' })
  })

  it('file-error 不应该终止随后完整成功的本轮', () => {
    const state = createScanRunState()
    expect(state.handleMessage({
      type: 'file-error',
      data: { file: 'C:\\Music\\bad.mp3', message: 'parse failed' }
    })).toBeNull()
    state.handleMessage(snapshotMessage)
    state.handleMessage(doneMessage)
    expect(state.handleExit(0)).toMatchObject({ type: 'successful-terminal' })
  })
})
