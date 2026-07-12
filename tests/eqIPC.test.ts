import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  let saveHandler: ((event: unknown, args: unknown) => unknown) | undefined
  const run = vi.fn()
  const getDatabase = vi.fn(() => ({
    prepare: () => ({ run }),
  }))

  return {
    getSaveHandler: () => saveHandler,
    getDatabase,
    run,
    setSaveHandler: (handler: (event: unknown, args: unknown) => unknown) => {
      saveHandler = handler
    },
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, args: unknown) => unknown) => {
      if (channel === 'eq:save') mocks.setSaveHandler(handler)
    },
  },
}))

vi.mock('../electron/db/database', () => ({
  getDatabase: mocks.getDatabase,
}))

import { registerEqIPC } from '../electron/ipc/eq'

describe('EQ IPC', () => {
  beforeEach(() => {
    mocks.run.mockClear()
    registerEqIPC()
  })

  it('应该保存 10 个有限范围内的增益', () => {
    const result = mocks.getSaveHandler()!({}, { gains: Array(10).fill(0) })

    expect(result).toEqual({ success: true })
    expect(mocks.run).toHaveBeenCalledWith('eq_gains', JSON.stringify(Array(10).fill(0)))
  })

  it.each([
    [Array(10).fill(Number.NaN)],
    [Array(10).fill(Number.POSITIVE_INFINITY)],
    [Array(10).fill(99)],
    [Array(9).fill(0)],
  ])('应该拒绝非法增益数组 %#', (gains) => {
    const result = mocks.getSaveHandler()!({}, { gains })

    expect(result).toMatchObject({ success: false })
    expect(mocks.run).not.toHaveBeenCalled()
  })
})
