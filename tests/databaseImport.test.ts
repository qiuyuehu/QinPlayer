import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import * as fsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DatabaseImportFatalError,
  createDatabaseImportService,
  validateDatabaseConnection,
  type DatabaseImportDurableStep,
  type DatabaseImportFileSystem,
  type DatabaseValidationConnection,
} from '../electron/db/databaseImport'

const REQUIRED_COLUMNS: Record<string, string[]> = {
  songs: ['id', 'file_path', 'file_name', 'title', 'artist', 'album', 'duration', 'cover_path', 'mtime', 'play_count', 'created_at'],
  playlists: ['id', 'name', 'created_at'],
  playlist_songs: ['playlist_id', 'song_id', 'sort_order'],
  recently_played: ['id', 'song_id', 'played_at'],
  liked_songs: ['song_id'],
  music_folders: ['id', 'path'],
  settings: ['key', 'value'],
}

interface SchemaOptions {
  omitTable?: string
  omitColumn?: { table: string; column: string }
  songsFilePathUnique?: boolean
  playlistPairUnique?: boolean
  includeForeignKeys?: boolean
  listeningStats?: 'missing' | 'valid' | 'incompatible'
}

function filteredColumns(
  table: string,
  columns: Array<[string, string]>,
  options: SchemaOptions,
): string[] {
  return columns
    .filter(([name]) => options.omitColumn?.table !== table || options.omitColumn.column !== name)
    .map(([, definition]) => definition)
}

function createCurrentSchema(database: DatabaseSync, options: SchemaOptions = {}): void {
  const unique = options.songsFilePathUnique === false ? '' : 'UNIQUE '
  const foreignKeys = options.includeForeignKeys === false ? [] : [
    'FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE',
    'FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE',
  ]
  const schemas: Record<string, string[]> = {
    songs: filteredColumns('songs', [
      ['id', 'id INTEGER PRIMARY KEY AUTOINCREMENT'],
      ['file_path', `file_path TEXT ${unique}NOT NULL`],
      ['file_name', 'file_name TEXT NOT NULL'],
      ['title', 'title TEXT'],
      ['artist', 'artist TEXT'],
      ['album', 'album TEXT'],
      ['duration', 'duration REAL'],
      ['cover_path', 'cover_path TEXT'],
      ['mtime', 'mtime INTEGER'],
      ['play_count', 'play_count INTEGER DEFAULT 0'],
      ['created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ], options),
    playlists: filteredColumns('playlists', [
      ['id', 'id INTEGER PRIMARY KEY AUTOINCREMENT'],
      ['name', 'name TEXT NOT NULL'],
      ['created_at', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ], options),
    playlist_songs: [
      ...filteredColumns('playlist_songs', [
        ['playlist_id', 'playlist_id INTEGER NOT NULL'],
        ['song_id', 'song_id INTEGER NOT NULL'],
        ['sort_order', 'sort_order INTEGER NOT NULL'],
      ], options),
      ...foreignKeys.filter((constraint) => {
        if (options.omitColumn?.table !== 'playlist_songs') return true
        if (constraint.includes('playlist_id')) return options.omitColumn.column !== 'playlist_id'
        return options.omitColumn.column !== 'song_id'
      }),
      ...((options.playlistPairUnique === false
        || (options.omitColumn?.table === 'playlist_songs'
        && ['playlist_id', 'song_id'].includes(options.omitColumn.column)))
        ? []
        : ['UNIQUE(playlist_id, song_id)']),
    ],
    recently_played: [
      ...filteredColumns('recently_played', [
        ['id', 'id INTEGER PRIMARY KEY AUTOINCREMENT'],
        ['song_id', 'song_id INTEGER NOT NULL'],
        ['played_at', 'played_at DATETIME DEFAULT CURRENT_TIMESTAMP'],
      ], options),
      ...(options.includeForeignKeys === false
        || (options.omitColumn?.table === 'recently_played' && options.omitColumn.column === 'song_id')
        ? []
        : ['FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE']),
    ],
    liked_songs: [
      ...filteredColumns('liked_songs', [['song_id', 'song_id INTEGER PRIMARY KEY']], options),
      ...(options.includeForeignKeys === false
        || (options.omitColumn?.table === 'liked_songs' && options.omitColumn.column === 'song_id')
        ? []
        : ['FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE']),
    ],
    music_folders: filteredColumns('music_folders', [
      ['id', 'id INTEGER PRIMARY KEY AUTOINCREMENT'],
      ['path', 'path TEXT UNIQUE NOT NULL'],
    ], options),
    settings: filteredColumns('settings', [
      ['key', 'key TEXT PRIMARY KEY'],
      ['value', 'value TEXT'],
    ], options),
  }

  for (const [table, definitions] of Object.entries(schemas)) {
    if (options.omitTable === table) continue
    const effectiveDefinitions = definitions.length > 0 ? definitions : ['placeholder INTEGER']
    database.exec(`CREATE TABLE ${table} (${effectiveDefinitions.join(', ')})`)
  }

  if (options.listeningStats === 'valid') {
    database.exec('CREATE TABLE listening_stats (local_date TEXT PRIMARY KEY, seconds INTEGER NOT NULL DEFAULT 0 CHECK (seconds >= 0)) WITHOUT ROWID')
  } else if (options.listeningStats === 'incompatible') {
    database.exec('CREATE TABLE listening_stats (local_date TEXT, seconds TEXT)')
  }
}

function wrapDatabase(database: DatabaseSync): DatabaseValidationConnection {
  return {
    pragma: (source: string) => database.prepare(`PRAGMA ${source}`).all(),
    prepare: (sql: string) => {
      const statement = database.prepare(sql)
      return {
        all: (...params: unknown[]) => statement.all(...params),
        get: (...params: unknown[]) => statement.get(...params),
      }
    },
    close: () => database.close(),
  }
}

function makeFileSystem(overrides: Partial<DatabaseImportFileSystem> = {}): DatabaseImportFileSystem {
  return {
    realpath: (path) => fsPromises.realpath(path),
    stat: (path, options) => fsPromises.stat(path, options as never) as never,
    copyFile: (source, destination) => fsPromises.copyFile(source, destination),
    rename: (source, destination) => fsPromises.rename(source, destination),
    rm: (path, options) => fsPromises.rm(path, options),
    readdir: (path) => fsPromises.readdir(path),
    readFile: (path, encoding) => fsPromises.readFile(path, encoding as never) as never,
    open: (path, flags) => fsPromises.open(path, flags),
    ...overrides,
  }
}

describe('数据库候选 schema 验证', () => {
  it('当前 schema 与缺 listening_stats 的合法备份应该通过', () => {
    for (const listeningStats of ['valid', 'missing'] as const) {
      const database = new DatabaseSync(':memory:')
      createCurrentSchema(database, { listeningStats })
      expect(() => validateDatabaseConnection(wrapDatabase(database))).not.toThrow()
      database.close()
    }
  })

  it.each(Object.keys(REQUIRED_COLUMNS))('缺核心表 %s 时应该明确拒绝', (table) => {
    const database = new DatabaseSync(':memory:')
    createCurrentSchema(database, { omitTable: table })

    expect(() => validateDatabaseConnection(wrapDatabase(database))).toThrow(`缺少数据表 ${table}`)
    database.close()
  })

  it.each(
    Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) => columns.map((column) => [table, column] as const)),
  )('缺 %s.%s 时应该明确拒绝', (table, column) => {
    const database = new DatabaseSync(':memory:')
    createCurrentSchema(database, { omitColumn: { table, column } })

    expect(() => validateDatabaseConnection(wrapDatabase(database))).toThrow(`缺少字段 ${table}.${column}`)
    database.close()
  })

  it('缺 songs.file_path unique 时应该拒绝', () => {
    const database = new DatabaseSync(':memory:')
    createCurrentSchema(database, { songsFilePathUnique: false })

    expect(() => validateDatabaseConnection(wrapDatabase(database))).toThrow('songs.file_path 唯一约束')
    database.close()
  })

  it('缺 playlist_songs 复合 unique 时应该拒绝', () => {
    const database = new DatabaseSync(':memory:')
    createCurrentSchema(database, { playlistPairUnique: false })

    expect(() => validateDatabaseConnection(wrapDatabase(database))).toThrow('playlist_songs 复合唯一约束')
    database.close()
  })

  it('缺当前 cascade 外键时应该拒绝', () => {
    const database = new DatabaseSync(':memory:')
    createCurrentSchema(database, { includeForeignKeys: false })

    expect(() => validateDatabaseConnection(wrapDatabase(database))).toThrow('外键')
    database.close()
  })

  it('已存在但不兼容的 listening_stats 应该拒绝', () => {
    const database = new DatabaseSync(':memory:')
    createCurrentSchema(database, { listeningStats: 'incompatible' })

    expect(() => validateDatabaseConnection(wrapDatabase(database))).toThrow('listening_stats')
    database.close()
  })

  it.each([
    ['quick_check', [{ quick_check: 'database disk image is malformed' }], '完整性检查'],
    ['foreign_key_check', [{ table: 'liked_songs', rowid: 1 }], '外键检查'],
  ] as const)('%s 返回异常结果时应该拒绝', (pragmaName, rows, message) => {
    const database = new DatabaseSync(':memory:')
    createCurrentSchema(database)
    const wrapped = wrapDatabase(database)
    const originalPragma = wrapped.pragma
    wrapped.pragma = (source) => source === pragmaName ? rows : originalPragma(source)

    expect(() => validateDatabaseConnection(wrapped)).toThrow(message)
    database.close()
  })
})

interface ServiceHarnessOptions {
  checkpoint?: unknown
  createTransactionId?: () => string
  fileSystem?: DatabaseImportFileSystem
  failNewInit?: boolean
  failOldInit?: boolean
  interruptAfter?: DatabaseImportDurableStep
  validate?: (path: string) => Promise<void>
  transactionId?: string
}

describe('数据库可恢复导入状态机', () => {
  let directory: string
  let targetPath: string
  let candidatePath: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'qinplayer-import-test-'))
    targetPath = join(directory, 'qinplayer.db')
    candidatePath = join(directory, 'candidate.db')
    await writeFile(targetPath, 'old')
    await writeFile(candidatePath, 'new')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  function createHarness(options: ServiceHarnessOptions = {}) {
    let databaseOpen = true
    let currentValue = 'old'
    const checkpoint = options.checkpoint ?? [{ busy: 0, log: 0, checkpointed: 0 }]
    const assertStatement = { get: vi.fn(() => ({ ok: 1 })) }
    const database = {
      pragma: vi.fn(() => {
        if (checkpoint instanceof Error) throw checkpoint
        return checkpoint
      }),
      prepare: vi.fn(() => assertStatement),
    }
    const getDatabase = vi.fn(() => {
      if (!databaseOpen) throw new Error('database closed')
      return database
    })
    const closeDatabase = vi.fn(() => {
      databaseOpen = false
    })
    const initDatabase = vi.fn(async () => {
      const value = await readFile(targetPath, 'utf8')
      if (value === 'new' && options.failNewInit) throw new Error('new init failed')
      if (value === 'old' && options.failOldInit) throw new Error('old init failed')
      currentValue = value
      databaseOpen = true
      return database
    })
    const validateDatabaseFile = vi.fn(options.validate ?? (async (path: string) => {
      const value = await readFile(path, 'utf8')
      if (value !== 'new' && value !== 'old') throw new Error('候选数据库无效')
    }))
    const service = createDatabaseImportService({
      getDatabasePath: () => targetPath,
      getDatabase,
      closeDatabase,
      initDatabase,
      validateDatabaseFile,
      createTransactionId: options.createTransactionId ?? (() => options.transactionId ?? 'tx1'),
      fileSystem: options.fileSystem ?? makeFileSystem(),
      interruptAfter: options.interruptAfter,
      warn: vi.fn(),
    })

    return {
      service,
      database,
      getDatabase,
      closeDatabase,
      initDatabase,
      validateDatabaseFile,
      assertStatement,
      isOpen: () => databaseOpen,
      currentValue: () => currentValue,
    }
  }

  it.each([
    ['不存在文件', () => join(directory, 'missing.db')],
    ['目录', () => directory],
    ['live 同一文件', () => targetPath],
  ])('%s 应该在关闭 live 前拒绝', async (_name, candidate) => {
    const harness = createHarness()

    const result = await harness.service.importDatabaseBackup(candidate())

    expect(result.success).toBe(false)
    expect(harness.closeDatabase).not.toHaveBeenCalled()
    expect(harness.isOpen()).toBe(true)
    expect(await readFile(targetPath, 'utf8')).toBe('old')
  })

  it.each(['', 'random text', 'truncated sqlite'])('%s 候选验证失败时不应关闭 live', async (contents) => {
    await writeFile(candidatePath, contents)
    const harness = createHarness({
      validate: async () => { throw new Error('候选 SQLite 无效') },
    })

    const result = await harness.service.importDatabaseBackup(candidatePath)

    expect(result.success).toBe(false)
    expect(harness.closeDatabase).not.toHaveBeenCalled()
    expect(await readFile(targetPath, 'utf8')).toBe('old')
  })

  it('stage copy 失败时不应关闭 live 或改变 target', async () => {
    const fileSystem = makeFileSystem({
      copyFile: async () => { throw new Error('copy failed') },
    })
    const harness = createHarness({ fileSystem })

    const result = await harness.service.importDatabaseBackup(candidatePath)

    expect(result.success).toBe(false)
    expect(harness.closeDatabase).not.toHaveBeenCalled()
    expect(harness.isOpen()).toBe(true)
    expect(await readFile(targetPath, 'utf8')).toBe('old')
  })

  it('并发第二次导入应该被进程锁拒绝', async () => {
    let releaseValidation!: () => void
    let validationStarted!: () => void
    const started = new Promise<void>((resolve) => { validationStarted = resolve })
    const harness = createHarness({
      validate: async () => {
        validationStarted()
        await new Promise<void>((resolve) => { releaseValidation = resolve })
      },
    })

    const first = harness.service.importDatabaseBackup(candidatePath)
    await started
    const second = await harness.service.importDatabaseBackup(candidatePath)
    releaseValidation()
    await first

    expect(second).toMatchObject({ success: false })
    expect(second.error).toContain('正在导入')
    expect(harness.validateDatabaseFile).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['抛错', new Error('checkpoint failed')],
    ['busy', [{ busy: 1, log: 3, checkpointed: 0 }]],
    ['未完整', [{ busy: 0, log: 3, checkpointed: 2 }]],
  ])('checkpoint %s 时 target 与 live 连接应保持原样', async (_name, checkpoint) => {
    const harness = createHarness({ checkpoint })

    const result = await harness.service.importDatabaseBackup(candidatePath)

    expect(result.success).toBe(false)
    expect(harness.closeDatabase).not.toHaveBeenCalled()
    expect(harness.isOpen()).toBe(true)
    expect(await readFile(targetPath, 'utf8')).toBe('old')
  })

  it('live 到 rollback rename 失败时应该重新打开旧库', async () => {
    const fileSystem = makeFileSystem({
      rename: async (source, destination) => {
        if (String(source) === targetPath) throw new Error('rename old failed')
        await fsPromises.rename(source, destination)
      },
    })
    const harness = createHarness({ fileSystem })

    const result = await harness.service.importDatabaseBackup(candidatePath)

    expect(result.success).toBe(false)
    expect(harness.initDatabase).toHaveBeenCalledTimes(1)
    expect(harness.isOpen()).toBe(true)
    expect(harness.currentValue()).toBe('old')
    expect(await readFile(targetPath, 'utf8')).toBe('old')
  })

  it('stage 到 target rename 失败时应该恢复 rollback 并重新打开旧库', async () => {
    const fileSystem = makeFileSystem({
      rename: async (source, destination) => {
        if (String(source).endsWith('.stage')) throw new Error('publish failed')
        await fsPromises.rename(source, destination)
      },
    })
    const harness = createHarness({ fileSystem })

    const result = await harness.service.importDatabaseBackup(candidatePath)

    expect(result.success).toBe(false)
    expect(harness.isOpen()).toBe(true)
    expect(harness.currentValue()).toBe('old')
    expect(await readFile(targetPath, 'utf8')).toBe('old')
  })

  it.each([
    ['.prepared.json', false],
    ['.old-moved.json', true],
    ['.new-published.json', true],
    ['.committed.json', true],
  ] as const)('%s marker 持久化失败时不应留下不可用连接', async (markerSuffix, liveWasClosed) => {
    const fileSystem = makeFileSystem({
      open: async (path, flags) => {
        if (String(path).endsWith(markerSuffix)) throw new Error('marker write failed')
        return fsPromises.open(path, flags)
      },
    })
    const harness = createHarness({ fileSystem })

    const result = await harness.service.importDatabaseBackup(candidatePath)

    expect(result.success).toBe(false)
    expect(result).not.toHaveProperty('fatal', true)
    expect(harness.isOpen()).toBe(true)
    expect(await readFile(targetPath, 'utf8')).toBe('old')
    expect(harness.closeDatabase.mock.calls.length > 0).toBe(liveWasClosed)
  })

  it('旧 sidecar 清理失败时应该停止发布并恢复旧库', async () => {
    const fileSystem = makeFileSystem({
      rm: async (path, options) => {
        if (String(path) === `${targetPath}-wal`) throw new Error('sidecar busy')
        await fsPromises.rm(path, options)
      },
    })
    const harness = createHarness({ fileSystem })

    const result = await harness.service.importDatabaseBackup(candidatePath)

    expect(result.success).toBe(false)
    expect(result).not.toHaveProperty('fatal', true)
    expect(harness.isOpen()).toBe(true)
    expect(await readFile(targetPath, 'utf8')).toBe('old')
  })

  it('新库 init 失败时应该 quarantine 新 target 并恢复旧库', async () => {
    const harness = createHarness({ failNewInit: true })

    const result = await harness.service.importDatabaseBackup(candidatePath)

    expect(result.success).toBe(false)
    expect(result).not.toHaveProperty('fatal', true)
    expect(harness.initDatabase).toHaveBeenCalledTimes(2)
    expect(harness.isOpen()).toBe(true)
    expect(harness.currentValue()).toBe('old')
    expect(await readFile(targetPath, 'utf8')).toBe('old')
  })

  it('quarantine rename 失败时必须 fatal 并原样保留 target 与 rollback', async () => {
    const fileSystem = makeFileSystem({
      rename: async (source, destination) => {
        if (String(source) === targetPath && String(destination).endsWith('.quarantine')) {
          throw new Error('quarantine denied')
        }
        await fsPromises.rename(source, destination)
      },
    })
    const harness = createHarness({ fileSystem, failNewInit: true })

    const result = await harness.service.importDatabaseBackup(candidatePath)
    const entries = await readdir(directory)

    expect(result).toMatchObject({ success: false, fatal: true })
    expect(harness.isOpen()).toBe(false)
    expect(await readFile(targetPath, 'utf8')).toBe('new')
    expect(entries.some((entry) => entry.endsWith('.rollback'))).toBe(true)
  })

  it('rollback restore 或旧库 reopen 失败时必须 fatal 并保留证据', async () => {
    const fileSystem = makeFileSystem({
      rename: async (source, destination) => {
        if (String(source).endsWith('.stage')) throw new Error('publish failed')
        if (String(source).endsWith('.rollback')) throw new Error('restore failed')
        await fsPromises.rename(source, destination)
      },
    })
    const harness = createHarness({ fileSystem })

    const result = await harness.service.importDatabaseBackup(candidatePath)

    expect(result).toMatchObject({ success: false, fatal: true })
    expect(harness.isOpen()).toBe(false)
    expect((await readdir(directory)).some((entry) => entry.endsWith('.rollback'))).toBe(true)
  })

  it('rollback 已恢复但旧库 reopen 失败时也必须 fatal 并保留 markers', async () => {
    const fileSystem = makeFileSystem({
      rename: async (source, destination) => {
        if (String(source).endsWith('.stage')) throw new Error('publish failed')
        await fsPromises.rename(source, destination)
      },
    })
    const harness = createHarness({ fileSystem, failOldInit: true })

    const result = await harness.service.importDatabaseBackup(candidatePath)

    expect(result).toMatchObject({ success: false, fatal: true })
    expect(harness.isOpen()).toBe(false)
    expect(await readFile(targetPath, 'utf8')).toBe('old')
    expect((await readdir(directory)).some((entry) => entry.endsWith('.prepared.json'))).toBe(true)
  })

  it('成功必须在新连接可查询且 committed 已持久化后返回', async () => {
    const markerOpens: string[] = []
    const fileSystem = makeFileSystem({
      open: async (path, flags) => {
        markerOpens.push(String(path))
        return fsPromises.open(path, flags)
      },
    })
    const harness = createHarness({ fileSystem })

    const result = await harness.service.importDatabaseBackup(candidatePath)

    expect(result).toEqual({ success: true })
    expect(harness.isOpen()).toBe(true)
    expect(harness.currentValue()).toBe('new')
    expect(harness.assertStatement.get).toHaveBeenCalledTimes(1)
    expect(markerOpens.some((path) => path.endsWith('.committed.json'))).toBe(true)
    expect(await readFile(candidatePath, 'utf8')).toBe('new')
  })

  it('成功清理失败只告警，并保留 committed 证书', async () => {
    const fileSystem = makeFileSystem({
      rm: async (path, options) => {
        if (String(path).endsWith('.rollback')) throw new Error('cleanup failed')
        await fsPromises.rm(path, options)
      },
    })
    const harness = createHarness({ fileSystem })

    const result = await harness.service.importDatabaseBackup(candidatePath)
    const entries = await readdir(directory)

    expect(result).toEqual({ success: true })
    expect(entries.some((entry) => entry.endsWith('.committed.json'))).toBe(true)
    expect(entries.some((entry) => entry.endsWith('.rollback'))).toBe(true)
  })

  it.each([
    'prepared',
    'old-renamed',
    'old-moved',
    'new-renamed',
    'new-published',
    'committed',
  ] as DatabaseImportDurableStep[])('startup recovery 应处理 %s 中断', async (interruptAfter) => {
    const interrupted = createHarness({ interruptAfter })
    await expect(interrupted.service.importDatabaseBackup(candidatePath)).rejects.toThrow('模拟进程中断')

    const recovery = createHarness()
    const result = await recovery.service.recoverInterruptedDatabaseImport()

    expect(result.databaseReady).toBe(true)
    expect(recovery.isOpen()).toBe(true)
    const expected = interruptAfter === 'new-published' || interruptAfter === 'committed' ? 'new' : 'old'
    expect(await readFile(targetPath, 'utf8')).toBe(expected)
  })

  it('startup 应清理 prepared 写入前遗留的无 marker stage', async () => {
    const stagePath = `${targetPath}.import-tx1.stage`
    await writeFile(stagePath, 'new')
    await writeFile(`${stagePath}-wal`, 'orphan wal')

    const recovery = createHarness()
    const result = await recovery.service.recoverInterruptedDatabaseImport()

    expect(result).toEqual({ databaseReady: false })
    expect(recovery.initDatabase).not.toHaveBeenCalled()
    expect(await readFile(targetPath, 'utf8')).toBe('old')
    expect((await readdir(directory)).filter((entry) => entry.includes('.import-tx1.'))).toEqual([])
  })

  it('startup 无 marker stage 同时存在 quarantine 时必须保留证据并 fail-closed', async () => {
    const stagePath = `${targetPath}.import-tx1.stage`
    const quarantinePath = `${targetPath}.import-tx1.quarantine`
    await writeFile(stagePath, 'new')
    await writeFile(quarantinePath, 'unknown')

    const recovery = createHarness()
    await expect(recovery.service.recoverInterruptedDatabaseImport()).rejects.toBeInstanceOf(DatabaseImportFatalError)

    expect(await readFile(stagePath, 'utf8')).toBe('new')
    expect(await readFile(quarantinePath, 'utf8')).toBe('unknown')
    expect(await readFile(targetPath, 'utf8')).toBe('old')
    expect(recovery.initDatabase).not.toHaveBeenCalled()
  })

  it('rollback 恢复后的 marker 清理失败应在下次启动继续收尾', async () => {
    const transactionIds = ['tx1', 'tx2']
    let failMarkerCleanup = true
    const fileSystem = makeFileSystem({
      rm: async (path, options) => {
        if (failMarkerCleanup && String(path).endsWith('.new-published.json')) {
          failMarkerCleanup = false
          throw new Error('marker cleanup denied')
        }
        await fsPromises.rm(path, options)
      },
    })
    const failedImport = createHarness({
      fileSystem,
      failNewInit: true,
      createTransactionId: () => transactionIds.shift()!,
    })

    const failedResult = await failedImport.service.importDatabaseBackup(candidatePath)

    expect(failedResult).toMatchObject({ success: false })
    expect(await readFile(targetPath, 'utf8')).toBe('old')
    expect((await readdir(directory)).some((entry) => entry.endsWith('.new-published.json'))).toBe(true)

    const retryResult = await failedImport.service.importDatabaseBackup(candidatePath)
    expect(retryResult).toMatchObject({ success: false })
    expect(retryResult.error).toContain('重启')
    expect((await readdir(directory)).some((entry) => entry.includes('tx2'))).toBe(false)

    const recovery = createHarness()
    const recoveryResult = await recovery.service.recoverInterruptedDatabaseImport()

    expect(recoveryResult.databaseReady).toBe(true)
    expect(await readFile(targetPath, 'utf8')).toBe('old')
    expect((await readdir(directory)).filter((entry) => entry.includes('.import-tx1.'))).toEqual([])
  })

  it('startup new-published 在 committed 写失败时应先关闭新连接再恢复旧库', async () => {
    const interrupted = createHarness({ interruptAfter: 'new-published' })
    await expect(interrupted.service.importDatabaseBackup(candidatePath)).rejects.toThrow()
    const fileSystem = makeFileSystem({
      open: async (path, flags) => {
        if (String(path).endsWith('.committed.json')) throw new Error('commit marker denied')
        return fsPromises.open(path, flags)
      },
    })

    const recovery = createHarness({ fileSystem })
    const result = await recovery.service.recoverInterruptedDatabaseImport()

    expect(result.databaseReady).toBe(true)
    expect(recovery.closeDatabase).toHaveBeenCalledTimes(1)
    expect(await readFile(targetPath, 'utf8')).toBe('old')
  })

  it('startup prepared 的旧 target 无法 reopen 时应 fatal 并保留证据', async () => {
    const interrupted = createHarness({ interruptAfter: 'prepared' })
    await expect(interrupted.service.importDatabaseBackup(candidatePath)).rejects.toThrow()

    const recovery = createHarness({ failOldInit: true })
    await expect(recovery.service.recoverInterruptedDatabaseImport()).rejects.toBeInstanceOf(DatabaseImportFatalError)
    expect(await readFile(targetPath, 'utf8')).toBe('old')
    expect((await readdir(directory)).some((entry) => entry.endsWith('.prepared.json'))).toBe(true)
  })

  it('startup rollback 被另一合法文件替换时必须在 rename 前按 identity fail-closed', async () => {
    const interrupted = createHarness({ interruptAfter: 'old-moved' })
    await expect(interrupted.service.importDatabaseBackup(candidatePath)).rejects.toThrow()
    const rollbackPath = `${targetPath}.import-tx1.rollback`
    const displacedRollback = join(directory, 'displaced-rollback.db')
    await rename(rollbackPath, displacedRollback)
    await writeFile(rollbackPath, 'old')

    const recovery = createHarness()
    await expect(recovery.service.recoverInterruptedDatabaseImport()).rejects.toBeInstanceOf(DatabaseImportFatalError)

    await expect(stat(targetPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(rollbackPath, 'utf8')).toBe('old')
    expect(recovery.initDatabase).not.toHaveBeenCalled()
    expect((await readdir(directory)).some((entry) => entry.endsWith('.old-moved.json'))).toBe(true)
  })

  it.each([
    'cleanup-rollback',
    'cleanup-stage',
    'cleanup-quarantine',
    'cleanup-prepared',
    'cleanup-old-moved',
    'cleanup-new-published',
  ] as DatabaseImportDurableStep[])('committed 后 %s 清理中断仍应保留新库并收尾', async (interruptAfter) => {
    const interrupted = createHarness({ interruptAfter })
    await expect(interrupted.service.importDatabaseBackup(candidatePath)).rejects.toThrow('模拟进程中断')

    const recovery = createHarness()
    const result = await recovery.service.recoverInterruptedDatabaseImport()

    expect(result.databaseReady).toBe(true)
    expect(await readFile(targetPath, 'utf8')).toBe('new')
    expect((await readdir(directory)).filter((entry) => entry.includes('.import-tx1.'))).toEqual([])
  })

  it('committed 后正常写入不应改变 stable identity 判断', async () => {
    const interrupted = createHarness({ interruptAfter: 'committed' })
    await expect(interrupted.service.importDatabaseBackup(candidatePath)).rejects.toThrow()
    const identityBefore = await stat(targetPath, { bigint: true })
    await writeFile(targetPath, 'new-with-normal-writes')
    const identityAfter = await stat(targetPath, { bigint: true })
    expect([identityAfter.dev, identityAfter.ino]).toEqual([identityBefore.dev, identityBefore.ino])

    const recovery = createHarness({ validate: async () => undefined })
    const result = await recovery.service.recoverInterruptedDatabaseImport()

    expect(result.databaseReady).toBe(true)
    expect(await readFile(targetPath, 'utf8')).toBe('new-with-normal-writes')
  })

  it('committed target 被另一合法文件替换时必须按 identity 冲突恢复 rollback', async () => {
    const interrupted = createHarness({ interruptAfter: 'committed' })
    await expect(interrupted.service.importDatabaseBackup(candidatePath)).rejects.toThrow()
    const displaced = join(directory, 'displaced.db')
    await rename(targetPath, displaced)
    await writeFile(targetPath, 'replacement')

    const recovery = createHarness({ validate: async () => undefined })
    const result = await recovery.service.recoverInterruptedDatabaseImport()

    expect(result.databaseReady).toBe(true)
    expect(result.warning).toContain('回滚')
    expect(await readFile(targetPath, 'utf8')).toBe('old')
  })

  it('committed 降级回滚后的清理失败应识别原旧库并在下次启动收尾', async () => {
    const interrupted = createHarness({ interruptAfter: 'committed' })
    await expect(interrupted.service.importDatabaseBackup(candidatePath)).rejects.toThrow()
    const displaced = join(directory, 'displaced-for-cleanup.db')
    await rename(targetPath, displaced)
    await writeFile(targetPath, 'replacement')

    let failCommittedCleanup = true
    const fileSystem = makeFileSystem({
      rm: async (path, options) => {
        if (failCommittedCleanup && String(path).endsWith('.committed.json')) {
          failCommittedCleanup = false
          throw new Error('committed cleanup denied')
        }
        await fsPromises.rm(path, options)
      },
    })
    const firstRecovery = createHarness({ fileSystem, validate: async () => undefined })
    const firstResult = await firstRecovery.service.recoverInterruptedDatabaseImport()

    expect(firstResult.databaseReady).toBe(true)
    expect(firstResult.warning).toContain('回滚')
    expect(await readFile(targetPath, 'utf8')).toBe('old')
    expect((await readdir(directory)).some((entry) => entry.endsWith('.committed.json'))).toBe(true)

    const secondRecovery = createHarness()
    const secondResult = await secondRecovery.service.recoverInterruptedDatabaseImport()

    expect(secondResult.databaseReady).toBe(true)
    expect(await readFile(targetPath, 'utf8')).toBe('old')
    expect((await readdir(directory)).filter((entry) => entry.includes('.import-tx1.'))).toEqual([])
  })

  it('多事务或损坏 marker 必须 fail-closed 并保留证据', async () => {
    const interrupted = createHarness({ interruptAfter: 'prepared' })
    await expect(interrupted.service.importDatabaseBackup(candidatePath)).rejects.toThrow()
    await writeFile(join(directory, `${basename(targetPath)}.import-tx2.stage`), 'other')

    const recovery = createHarness()
    await expect(recovery.service.recoverInterruptedDatabaseImport()).rejects.toBeInstanceOf(DatabaseImportFatalError)
    expect((await readdir(directory)).some((entry) => entry.includes('tx1'))).toBe(true)
    expect((await readdir(directory)).some((entry) => entry.includes('tx2'))).toBe(true)
  })

  it('损坏 marker 必须 fail-closed 且不能清理证据', async () => {
    const interrupted = createHarness({ interruptAfter: 'prepared' })
    await expect(interrupted.service.importDatabaseBackup(candidatePath)).rejects.toThrow()
    const preparedMarker = (await readdir(directory)).find((entry) => entry.endsWith('.prepared.json'))!
    await writeFile(join(directory, preparedMarker), '{broken json')

    const recovery = createHarness()
    await expect(recovery.service.recoverInterruptedDatabaseImport()).rejects.toBeInstanceOf(DatabaseImportFatalError)
    expect(await readFile(join(directory, preparedMarker), 'utf8')).toBe('{broken json')
  })

  it('marker 与 artifacts 状态矛盾时必须 fail-closed', async () => {
    const interrupted = createHarness({ interruptAfter: 'old-moved' })
    await expect(interrupted.service.importDatabaseBackup(candidatePath)).rejects.toThrow()
    await writeFile(targetPath, 'unexpected target')

    const recovery = createHarness()
    await expect(recovery.service.recoverInterruptedDatabaseImport()).rejects.toBeInstanceOf(DatabaseImportFatalError)
    expect(await readFile(targetPath, 'utf8')).toBe('unexpected target')
    expect((await readdir(directory)).some((entry) => entry.endsWith('.rollback'))).toBe(true)
  })
})
