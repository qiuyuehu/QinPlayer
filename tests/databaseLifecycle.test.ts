import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDatabaseManager,
  type DatabaseConnection,
  type DatabaseManagerDependencies,
} from '../electron/db/database'

function createConnection() {
  return {
    pragma: vi.fn(),
    exec: vi.fn(),
    close: vi.fn(),
  } as unknown as DatabaseConnection
}

function createHarness() {
  let connection = createConnection()
  const dependencies: DatabaseManagerDependencies = {
    getDatabasePath: vi.fn(() => 'C:\\profile\\qinplayer.db'),
    openDatabase: vi.fn(() => connection),
    createSchema: vi.fn(),
    ensureListeningStats: vi.fn(),
    createCoversDirectory: vi.fn(async () => undefined),
    showInitializationError: vi.fn(),
  }

  return {
    dependencies,
    get connection() {
      return connection
    },
    useFreshConnection() {
      connection = createConnection()
      return connection
    },
  }
}

describe('数据库生命周期', () => {
  let harness: ReturnType<typeof createHarness>

  beforeEach(() => {
    harness = createHarness()
  })

  it.each([
    'wal pragma',
    'foreign keys pragma',
    'schema',
    'listening table',
    'covers directory',
  ] as const)('%s 失败时不应暴露半初始化连接，并且允许重试', async (failurePoint) => {
    let pragmaCalls = 0
    harness.connection.pragma = vi.fn(() => {
      pragmaCalls += 1
      if (failurePoint === 'wal pragma' && pragmaCalls === 1) throw new Error('wal failed')
      if (failurePoint === 'foreign keys pragma' && pragmaCalls === 2) throw new Error('fk failed')
      return undefined
    })
    if (failurePoint === 'schema') {
      vi.mocked(harness.dependencies.createSchema).mockImplementationOnce(() => {
        throw new Error('schema failed')
      })
    }
    if (failurePoint === 'listening table') {
      vi.mocked(harness.dependencies.ensureListeningStats).mockImplementationOnce(() => {
        throw new Error('listening failed')
      })
    }
    if (failurePoint === 'covers directory') {
      vi.mocked(harness.dependencies.createCoversDirectory).mockRejectedValueOnce(
        new Error('mkdir failed'),
      )
    }

    const manager = createDatabaseManager(harness.dependencies)
    await expect(manager.init({ showErrorDialog: false })).rejects.toThrow()

    expect(harness.connection.close).toHaveBeenCalledTimes(1)
    expect(() => manager.get()).toThrow('数据库尚未初始化')
    expect(harness.dependencies.showInitializationError).not.toHaveBeenCalled()

    const retryConnection = harness.useFreshConnection()
    vi.mocked(harness.dependencies.openDatabase).mockImplementation(() => retryConnection)
    await expect(manager.init({ showErrorDialog: false })).resolves.toBe(retryConnection)
    expect(manager.get()).toBe(retryConnection)
  })

  it('默认失败路径应该报告一次初始化错误', async () => {
    harness.connection.pragma = vi.fn(() => {
      throw new Error('disk failure')
    })
    const manager = createDatabaseManager(harness.dependencies)

    await expect(manager.init()).rejects.toThrow('disk failure')

    expect(harness.dependencies.showInitializationError).toHaveBeenCalledTimes(1)
    expect(harness.dependencies.showInitializationError).toHaveBeenCalledWith(
      'C:\\profile\\qinplayer.db',
      expect.any(Error),
    )
  })

  it('成功前 get 不可用，成功后返回同一连接', async () => {
    let releaseDirectory!: () => void
    vi.mocked(harness.dependencies.createCoversDirectory).mockImplementation(
      () => new Promise<void>((resolve) => { releaseDirectory = resolve }),
    )
    const manager = createDatabaseManager(harness.dependencies)

    const initialization = manager.init({ showErrorDialog: false })
    expect(() => manager.get()).toThrow('数据库尚未初始化')

    releaseDirectory()
    await expect(initialization).resolves.toBe(harness.connection)
    expect(manager.get()).toBe(harness.connection)
  })

  it('close 应该幂等，即使底层 close 抛错也要清空 singleton', async () => {
    const manager = createDatabaseManager(harness.dependencies)
    await manager.init({ showErrorDialog: false })
    harness.connection.close = vi.fn(() => {
      throw new Error('close failed')
    })

    expect(() => manager.close()).toThrow('close failed')
    expect(() => manager.get()).toThrow('数据库尚未初始化')
    expect(() => manager.close()).not.toThrow()
    expect(harness.connection.close).toHaveBeenCalledTimes(1)
  })
})
