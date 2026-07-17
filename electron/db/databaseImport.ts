// =============================================================================
// QinPlayer — 数据库备份验证、可恢复发布与启动恢复
// =============================================================================

import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import type { BigIntStats } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import * as fsPromises from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  closeDatabase,
  getDatabase,
  getDatabasePath,
  initDatabase,
} from './database'

const IMPORT_FORMAT_VERSION = 1
const IMPORT_PREFIX = '.import-'
const DIGEST_PATTERN = /^[a-f0-9]{64}$/

const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  songs: ['id', 'file_path', 'file_name', 'title', 'artist', 'album', 'duration', 'cover_path', 'mtime', 'play_count', 'created_at'],
  playlists: ['id', 'name', 'created_at'],
  playlist_songs: ['playlist_id', 'song_id', 'sort_order'],
  recently_played: ['id', 'song_id', 'played_at'],
  liked_songs: ['song_id'],
  music_folders: ['id', 'path'],
  settings: ['key', 'value'],
}

const ARTIFACT_SUFFIXES = [
  '.stage-wal',
  '.stage-shm',
  '.stage',
  '.rollback',
  '.quarantine',
  '.prepared.json',
  '.old-moved.json',
  '.new-published.json',
  '.committed.json',
] as const

export type DatabaseImportDurableStep =
  | 'prepared'
  | 'old-renamed'
  | 'old-moved'
  | 'new-renamed'
  | 'new-published'
  | 'committed'
  | 'cleanup-rollback'
  | 'cleanup-stage'
  | 'cleanup-quarantine'
  | 'cleanup-prepared'
  | 'cleanup-old-moved'
  | 'cleanup-new-published'

export interface DatabaseValidationConnection {
  pragma: (source: string) => unknown
  prepare: (sql: string) => {
    all: (...params: unknown[]) => unknown[]
    get: (...params: unknown[]) => unknown
  }
  close: () => void
}

export interface DatabaseImportFileSystem {
  realpath: (path: string) => Promise<string>
  stat: (path: string, options: { bigint: true }) => Promise<BigIntStats>
  copyFile: (source: string, destination: string) => Promise<unknown>
  rename: (source: string, destination: string) => Promise<unknown>
  rm: (path: string, options: { force?: boolean }) => Promise<unknown>
  readdir: (path: string) => Promise<string[]>
  readFile: (path: string, encoding: 'utf8') => Promise<string>
  open: (path: string, flags: string) => Promise<FileHandle>
}

interface ImportDatabaseConnection {
  pragma: (source: string) => unknown
  prepare: (sql: string) => { get: (...params: unknown[]) => unknown }
}

export interface DatabaseImportServiceDependencies {
  getDatabasePath: () => string
  getDatabase: () => ImportDatabaseConnection
  closeDatabase: () => void
  initDatabase: (options: { showErrorDialog: false }) => Promise<unknown>
  validateDatabaseFile: (path: string) => Promise<void>
  createTransactionId: () => string
  fileSystem: DatabaseImportFileSystem
  interruptAfter?: DatabaseImportDurableStep
  warn: (...args: unknown[]) => void
}

export interface DatabaseImportResult {
  success: boolean
  error?: string
  fatal?: boolean
}

export interface DatabaseRecoveryResult {
  databaseReady: boolean
  warning?: string
}

interface FileIdentity {
  device: string
  fileId: string
}

interface ArtifactPaths {
  target: string
  stage: string
  rollback: string
  quarantine: string
  preparedMarker: string
  oldMovedMarker: string
  newPublishedMarker: string
  committedMarker: string
}

interface ImportManifest {
  version: number
  transactionId: string
  targetFile: string
  stageFile: string
  rollbackFile: string
  quarantineFile: string
  candidateDigest: string
  originalTargetIdentity: FileIdentity
}

type PreCommitPhase = 'prepared' | 'old-moved' | 'new-published'

interface PreCommitMarker extends ImportManifest {
  phase: PreCommitPhase
  previousDigest: string | null
}

interface CommittedMarker extends ImportManifest {
  phase: 'committed'
  targetIdentity: FileIdentity
  markerDigests: {
    prepared: string
    oldMoved: string
    newPublished: string
  }
  chainDigest: string
}

interface PersistedMarker<T> {
  value: T
  raw: string
  digest: string
}

interface ImportTransaction {
  manifest: ImportManifest
  paths: ArtifactPaths
  prepared?: PersistedMarker<PreCommitMarker>
  oldMoved?: PersistedMarker<PreCommitMarker>
  newPublished?: PersistedMarker<PreCommitMarker>
  committed?: PersistedMarker<CommittedMarker>
}

interface ImportProgress {
  liveClosed: boolean
  oldMoved: boolean
  newPublished: boolean
}

export class DatabaseImportFatalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseImportFatalError'
  }
}

class DatabaseImportInterruption extends Error {
  constructor(step: DatabaseImportDurableStep) {
    super(`模拟进程中断: ${step}`)
    this.name = 'DatabaseImportInterruption'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRows(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`候选数据库 ${label} 返回格式无效`)
  }
  return value
}

function quotePragmaIdentifier(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function hasUniqueColumns(
  database: DatabaseValidationConnection,
  table: string,
  expectedColumns: readonly string[],
): boolean {
  const tableInfo = asRows(database.pragma(`table_info(${quotePragmaIdentifier(table)})`), `${table} 字段检查`)
  if (expectedColumns.length === 1) {
    const columnInfo = tableInfo.find((row) => row.name === expectedColumns[0])
    if (Number(columnInfo?.pk) > 0) return true
  }

  const indexes = asRows(database.pragma(`index_list(${quotePragmaIdentifier(table)})`), `${table} 索引检查`)
  return indexes.some((index) => {
    if (Number(index.unique) !== 1 || typeof index.name !== 'string') return false
    const columns = asRows(
      database.pragma(`index_info(${quotePragmaIdentifier(index.name)})`),
      `${table}.${String(index.name)} 索引字段检查`,
    )
    const orderedColumns = columns
      .toSorted((left, right) => Number(left.seqno) - Number(right.seqno))
      .map((column) => column.name)
    return orderedColumns.length === expectedColumns.length
      && orderedColumns.every((column, indexPosition) => column === expectedColumns[indexPosition])
  })
}

function hasCascadeForeignKey(
  database: DatabaseValidationConnection,
  table: string,
  from: string,
  referencedTable: string,
  to: string,
): boolean {
  const foreignKeys = asRows(
    database.pragma(`foreign_key_list(${quotePragmaIdentifier(table)})`),
    `${table} 外键检查`,
  )
  return foreignKeys.some((foreignKey) => (
    foreignKey.from === from
    && foreignKey.table === referencedTable
    && foreignKey.to === to
    && String(foreignKey.on_delete).toUpperCase() === 'CASCADE'
  ))
}

export function validateDatabaseConnection(database: DatabaseValidationConnection): void {
  const quickCheck = asRows(database.pragma('quick_check'), '完整性检查')
  if (quickCheck.length !== 1 || quickCheck[0]?.quick_check !== 'ok') {
    throw new Error('候选数据库完整性检查未通过')
  }

  const tableRows = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  ).all()
  const tableNames = new Set(
    tableRows
      .filter(isRecord)
      .map((row) => row.name)
      .filter((name): name is string => typeof name === 'string'),
  )

  for (const [table, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    if (!tableNames.has(table)) throw new Error(`候选数据库缺少数据表 ${table}`)
    const columns = new Set(
      asRows(database.pragma(`table_info(${quotePragmaIdentifier(table)})`), `${table} 字段检查`)
        .map((row) => row.name)
        .filter((name): name is string => typeof name === 'string'),
    )
    for (const column of requiredColumns) {
      if (!columns.has(column)) throw new Error(`候选数据库缺少字段 ${table}.${column}`)
    }
  }

  const foreignKeyCheck = asRows(database.pragma('foreign_key_check'), '外键检查')
  if (foreignKeyCheck.length > 0) {
    throw new Error('候选数据库外键检查未通过')
  }

  if (!hasUniqueColumns(database, 'songs', ['file_path'])) {
    throw new Error('候选数据库缺少 songs.file_path 唯一约束')
  }
  if (!hasUniqueColumns(database, 'playlist_songs', ['playlist_id', 'song_id'])) {
    throw new Error('候选数据库缺少 playlist_songs 复合唯一约束')
  }

  const requiredForeignKeys = [
    ['playlist_songs', 'playlist_id', 'playlists', 'id'],
    ['playlist_songs', 'song_id', 'songs', 'id'],
    ['recently_played', 'song_id', 'songs', 'id'],
    ['liked_songs', 'song_id', 'songs', 'id'],
  ] as const
  for (const [table, from, referencedTable, to] of requiredForeignKeys) {
    if (!hasCascadeForeignKey(database, table, from, referencedTable, to)) {
      throw new Error(`候选数据库缺少 ${table}.${from} cascade 外键`)
    }
  }

  if (tableNames.has('listening_stats')) {
    const listeningColumns = asRows(
      database.pragma(`table_info(${quotePragmaIdentifier('listening_stats')})`),
      'listening_stats 字段检查',
    )
    const localDate = listeningColumns.find((column) => column.name === 'local_date')
    const seconds = listeningColumns.find((column) => column.name === 'seconds')
    if (!localDate || !seconds) {
      throw new Error('候选数据库 listening_stats 结构不兼容')
    }
    if (
      !hasUniqueColumns(database, 'listening_stats', ['local_date'])
      || Number(seconds.notnull) !== 1
      || String(localDate.type).toUpperCase() !== 'TEXT'
      || !String(seconds.type).toUpperCase().includes('INT')
    ) {
      throw new Error('候选数据库 listening_stats 结构不兼容')
    }
  }
}

export async function validateDatabaseFile(filePath: string): Promise<void> {
  let database: DatabaseValidationConnection | null = null
  try {
    database = new Database(filePath, { readonly: true, fileMustExist: true })
    validateDatabaseConnection(database)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`候选数据库验证失败：${message}`)
  } finally {
    if (database) database.close()
  }
}

const defaultFileSystem: DatabaseImportFileSystem = {
  realpath: (path) => fsPromises.realpath(path),
  stat: (path, options) => fsPromises.stat(path, options),
  copyFile: (source, destination) => fsPromises.copyFile(source, destination),
  rename: (source, destination) => fsPromises.rename(source, destination),
  rm: (path, options) => fsPromises.rm(path, options),
  readdir: (path) => fsPromises.readdir(path),
  readFile: (path, encoding) => fsPromises.readFile(path, encoding),
  open: (path, flags) => fsPromises.open(path, flags),
}

function hashText(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

async function digestFile(fileSystem: DatabaseImportFileSystem, path: string): Promise<string> {
  const handle = await fileSystem.open(path, 'r')
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let position = 0
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (bytesRead === 0) break
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}

function createArtifactPaths(target: string, transactionId: string): ArtifactPaths {
  const prefix = join(dirname(target), `${basename(target)}${IMPORT_PREFIX}${transactionId}`)
  return {
    target,
    stage: `${prefix}.stage`,
    rollback: `${prefix}.rollback`,
    quarantine: `${prefix}.quarantine`,
    preparedMarker: `${prefix}.prepared.json`,
    oldMovedMarker: `${prefix}.old-moved.json`,
    newPublishedMarker: `${prefix}.new-published.json`,
    committedMarker: `${prefix}.committed.json`,
  }
}

function createManifest(
  paths: ArtifactPaths,
  transactionId: string,
  candidateDigest: string,
  originalTargetIdentity: FileIdentity,
): ImportManifest {
  return {
    version: IMPORT_FORMAT_VERSION,
    transactionId,
    targetFile: basename(paths.target),
    stageFile: basename(paths.stage),
    rollbackFile: basename(paths.rollback),
    quarantineFile: basename(paths.quarantine),
    candidateDigest,
    originalTargetIdentity,
  }
}

function serializeMarker(marker: PreCommitMarker | CommittedMarker): string {
  return `${JSON.stringify(marker)}\n`
}

async function writeImmutableMarker<T extends PreCommitMarker | CommittedMarker>(
  fileSystem: DatabaseImportFileSystem,
  path: string,
  marker: T,
): Promise<PersistedMarker<T>> {
  const raw = serializeMarker(marker)
  let handle: FileHandle | null = null
  try {
    handle = await fileSystem.open(path, 'wx')
    await handle.writeFile(raw, 'utf8')
    await handle.sync()
  } finally {
    if (handle) await handle.close()
  }
  return { value: marker, raw, digest: hashText(raw) }
}

async function getFileIdentity(
  fileSystem: DatabaseImportFileSystem,
  path: string,
): Promise<FileIdentity> {
  const fileStat = await fileSystem.stat(path, { bigint: true })
  if (fileStat.dev === 0n || fileStat.ino === 0n) {
    throw new Error('当前平台无法提供稳定且非零的数据库文件身份')
  }
  return { device: fileStat.dev.toString(), fileId: fileStat.ino.toString() }
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.device === right.device && left.fileId === right.fileId
}

function isValidFileIdentity(value: unknown): value is FileIdentity {
  return isRecord(value)
    && typeof value.device === 'string'
    && typeof value.fileId === 'string'
    && value.device !== '0'
    && value.fileId !== '0'
}

async function fileExists(fileSystem: DatabaseImportFileSystem, path: string): Promise<boolean> {
  try {
    await fileSystem.stat(path, { bigint: true })
    return true
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return false
    throw error
  }
}

async function assertPathAbsent(fileSystem: DatabaseImportFileSystem, path: string): Promise<void> {
  if (await fileExists(fileSystem, path)) {
    throw new Error(`目标路径已存在，拒绝覆盖: ${path}`)
  }
}

function isValidManifest(value: unknown, expected: ImportManifest): value is ImportManifest {
  if (!isRecord(value)) return false
  return value.version === expected.version
    && value.transactionId === expected.transactionId
    && value.targetFile === expected.targetFile
    && value.stageFile === expected.stageFile
    && value.rollbackFile === expected.rollbackFile
    && value.quarantineFile === expected.quarantineFile
    && value.candidateDigest === expected.candidateDigest
    && isValidFileIdentity(value.originalTargetIdentity)
    && sameIdentity(value.originalTargetIdentity, expected.originalTargetIdentity)
}

async function readPersistedMarker<T>(
  fileSystem: DatabaseImportFileSystem,
  path: string,
): Promise<PersistedMarker<T> | null> {
  if (!await fileExists(fileSystem, path)) return null
  const raw = await fileSystem.readFile(path, 'utf8')
  let value: T
  try {
    value = JSON.parse(raw) as T
  } catch {
    throw new DatabaseImportFatalError(`数据库导入 marker 已损坏: ${path}`)
  }
  return { value, raw, digest: hashText(raw) }
}

function assertCheckpointComplete(result: unknown): void {
  const rows = asRows(result, 'WAL checkpoint')
  if (rows.length !== 1) throw new Error('WAL checkpoint 返回格式无效')
  const { busy, log, checkpointed } = rows[0]
  if (
    !Number.isSafeInteger(busy)
    || !Number.isSafeInteger(log)
    || !Number.isSafeInteger(checkpointed)
    || Number(busy) !== 0
    || Number(log) !== Number(checkpointed)
  ) {
    throw new Error('WAL checkpoint 忙碌或未完整落盘')
  }
}

function toImportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `数据库导入失败：${message}`
}

function fatalRecoveryError(paths: ArtifactPaths, cause: unknown): DatabaseImportFatalError {
  const message = cause instanceof Error ? cause.message : String(cause)
  return new DatabaseImportFatalError(
    `数据库导入进入致命恢复状态：${message}。请完全退出应用并保留目录 ${dirname(paths.target)} 中的导入 artifacts。`,
  )
}

export function createDatabaseImportService(
  dependencies: DatabaseImportServiceDependencies,
) {
  let importInProgress = false

  const maybeInterrupt = (step: DatabaseImportDurableStep): void => {
    if (dependencies.interruptAfter === step) throw new DatabaseImportInterruption(step)
  }

  const removeSidecars = async (databasePath: string): Promise<void> => {
    await dependencies.fileSystem.rm(`${databasePath}-wal`, { force: true })
    await dependencies.fileSystem.rm(`${databasePath}-shm`, { force: true })
  }

  const initializeAndAssert = async (): Promise<void> => {
    await dependencies.initDatabase({ showErrorDialog: false })
    dependencies.getDatabase().prepare('SELECT 1 AS ok').get()
  }

  const discoverTransactionIds = async (targetPath: string): Promise<Set<string>> => {
    const directoryEntries = await dependencies.fileSystem.readdir(dirname(targetPath))
    const artifactPrefix = `${basename(targetPath)}${IMPORT_PREFIX}`
    const transactionIds = new Set<string>()
    for (const entry of directoryEntries) {
      if (!entry.startsWith(artifactPrefix)) continue
      const suffix = ARTIFACT_SUFFIXES.find((candidate) => entry.endsWith(candidate))
      if (!suffix) continue
      const transactionId = entry.slice(artifactPrefix.length, -suffix.length)
      if (transactionId) transactionIds.add(transactionId)
    }
    return transactionIds
  }

  const cleanupAllArtifacts = async (transaction: ImportTransaction): Promise<void> => {
    const { paths } = transaction
    await dependencies.fileSystem.rm(paths.rollback, { force: true })
    maybeInterrupt('cleanup-rollback')
    await dependencies.fileSystem.rm(paths.stage, { force: true })
    await removeSidecars(paths.stage)
    maybeInterrupt('cleanup-stage')
    await dependencies.fileSystem.rm(paths.quarantine, { force: true })
    maybeInterrupt('cleanup-quarantine')
    await dependencies.fileSystem.rm(paths.preparedMarker, { force: true })
    maybeInterrupt('cleanup-prepared')
    await dependencies.fileSystem.rm(paths.oldMovedMarker, { force: true })
    maybeInterrupt('cleanup-old-moved')
    await dependencies.fileSystem.rm(paths.newPublishedMarker, { force: true })
    maybeInterrupt('cleanup-new-published')
    await dependencies.fileSystem.rm(paths.committedMarker, { force: true })
  }

  const cleanupBeforeCommit = async (transaction: ImportTransaction): Promise<void> => {
    const paths = transaction.paths

    // A committed marker describes the published candidate. Once rollback has
    // restored the original target it must be removed before any other cleanup.
    await dependencies.fileSystem.rm(paths.committedMarker, { force: true })
    for (const path of [
      paths.stage,
      paths.quarantine,
      paths.rollback,
      paths.newPublishedMarker,
      paths.oldMovedMarker,
      paths.preparedMarker,
    ]) {
      await dependencies.fileSystem.rm(path, { force: true })
      if (path === paths.stage) await removeSidecars(paths.stage)
    }
  }

  const stageAndValidate = async (
    backupPath: string,
    targetPath: string,
    transactionId: string,
  ): Promise<ImportTransaction> => {
    const paths = createArtifactPaths(targetPath, transactionId)
    let stageCreated = false
    try {
      const candidateRealPath = await dependencies.fileSystem.realpath(backupPath)
      const candidateStat = await dependencies.fileSystem.stat(candidateRealPath, { bigint: true })
      if (!candidateStat.isFile()) throw new Error('选择的数据库备份不是普通文件')

      const targetRealPath = await dependencies.fileSystem.realpath(targetPath)
      const targetIdentity = await getFileIdentity(dependencies.fileSystem, targetRealPath)
      const candidateIdentity = await getFileIdentity(dependencies.fileSystem, candidateRealPath)
      if (sameIdentity(targetIdentity, candidateIdentity)) {
        throw new Error('不能把当前正在使用的数据库作为导入候选')
      }

      for (const artifactPath of Object.values(paths).filter((path) => path !== paths.target)) {
        await assertPathAbsent(dependencies.fileSystem, artifactPath)
      }
      await dependencies.fileSystem.copyFile(candidateRealPath, paths.stage)
      stageCreated = true

      const stageIdentity = await getFileIdentity(dependencies.fileSystem, paths.stage)
      if (stageIdentity.device !== targetIdentity.device) {
        throw new Error('候选 stage 与当前数据库不在同一卷，拒绝发布')
      }
      await dependencies.validateDatabaseFile(paths.stage)
      await removeSidecars(paths.stage)
      const candidateDigest = await digestFile(dependencies.fileSystem, paths.stage)
      return {
        paths,
        manifest: createManifest(paths, transactionId, candidateDigest, targetIdentity),
      }
    } catch (error) {
      if (stageCreated) {
        try {
          await dependencies.fileSystem.rm(paths.stage, { force: true })
          await removeSidecars(paths.stage)
        } catch (cleanupError) {
          dependencies.warn('[DatabaseImport] 清理无效 stage 失败:', cleanupError)
        }
      }
      throw error
    }
  }

  const quarantineTarget = async (paths: ArtifactPaths): Promise<void> => {
    await assertPathAbsent(dependencies.fileSystem, paths.quarantine)
    await removeSidecars(paths.target)
    await dependencies.fileSystem.rename(paths.target, paths.quarantine)
  }

  const restoreRollback = async (transaction: ImportTransaction): Promise<void> => {
    const { paths } = transaction
    if (!await fileExists(dependencies.fileSystem, paths.rollback)) {
      throw fatalRecoveryError(paths, 'rollback 文件不存在')
    }
    const rollbackIdentity = await getFileIdentity(dependencies.fileSystem, paths.rollback)
    if (!sameIdentity(rollbackIdentity, transaction.manifest.originalTargetIdentity)) {
      throw new Error('rollback 文件身份与导入前数据库不一致')
    }
    await assertPathAbsent(dependencies.fileSystem, paths.target)
    await dependencies.fileSystem.rename(paths.rollback, paths.target)
    const restoredIdentity = await getFileIdentity(dependencies.fileSystem, paths.target)
    if (!sameIdentity(restoredIdentity, transaction.manifest.originalTargetIdentity)) {
      throw new Error('rollback 文件身份与导入前数据库不一致')
    }
    await dependencies.validateDatabaseFile(paths.target)
    await initializeAndAssert()
  }

  const recoverImportFailure = async (
    transaction: ImportTransaction,
    progress: ImportProgress,
  ): Promise<void> => {
    const { paths } = transaction
    try {
      if (progress.newPublished) {
        try {
          dependencies.closeDatabase()
        } catch (closeError) {
          dependencies.warn('[DatabaseImport] 关闭失败的新库连接时出错:', closeError)
        }
        if (await fileExists(dependencies.fileSystem, paths.target)) {
          await quarantineTarget(paths)
        }
        await restoreRollback(transaction)
      } else if (progress.oldMoved) {
        if (await fileExists(dependencies.fileSystem, paths.target)) {
          await quarantineTarget(paths)
        }
        await restoreRollback(transaction)
      } else if (progress.liveClosed) {
        await initializeAndAssert()
      }
    } catch (error) {
      throw fatalRecoveryError(paths, error)
    }

    try {
      await cleanupBeforeCommit(transaction)
    } catch (cleanupError) {
      dependencies.warn('[DatabaseImport] 失败恢复后的 artifact 清理失败:', cleanupError)
    }
  }

  const writeCommittedMarker = async (transaction: ImportTransaction): Promise<void> => {
    if (!transaction.prepared || !transaction.oldMoved || !transaction.newPublished) {
      throw new Error('提交 marker 前置链不完整')
    }
    const targetIdentity = await getFileIdentity(dependencies.fileSystem, transaction.paths.target)
    const markerDigests = {
      prepared: transaction.prepared.digest,
      oldMoved: transaction.oldMoved.digest,
      newPublished: transaction.newPublished.digest,
    }
    const committedMarker: CommittedMarker = {
      ...transaction.manifest,
      phase: 'committed',
      targetIdentity,
      markerDigests,
      chainDigest: hashText(`${markerDigests.prepared}:${markerDigests.oldMoved}:${markerDigests.newPublished}`),
    }
    transaction.committed = await writeImmutableMarker(
      dependencies.fileSystem,
      transaction.paths.committedMarker,
      committedMarker,
    )
  }

  const importDatabaseBackup = async (backupPath: string): Promise<DatabaseImportResult> => {
    if (importInProgress) return { success: false, error: '数据库正在导入，请稍后再试' }
    importInProgress = true

    let transaction: ImportTransaction | null = null
    const progress: ImportProgress = { liveClosed: false, oldMoved: false, newPublished: false }
    try {
      const targetPath = dependencies.getDatabasePath()
      if ((await discoverTransactionIds(targetPath)).size > 0) {
        return {
          success: false,
          error: '检测到未完成的数据库导入事务，请重启应用完成恢复后再试',
        }
      }
      const transactionId = dependencies.createTransactionId()
      transaction = await stageAndValidate(backupPath, targetPath, transactionId)

      const preparedMarker: PreCommitMarker = {
        ...transaction.manifest,
        phase: 'prepared',
        previousDigest: null,
      }
      transaction.prepared = await writeImmutableMarker(
        dependencies.fileSystem,
        transaction.paths.preparedMarker,
        preparedMarker,
      )
      maybeInterrupt('prepared')

      const checkpointResult = dependencies.getDatabase().pragma('wal_checkpoint(TRUNCATE)')
      assertCheckpointComplete(checkpointResult)
      try {
        dependencies.closeDatabase()
      } finally {
        progress.liveClosed = true
      }

      await assertPathAbsent(dependencies.fileSystem, transaction.paths.rollback)
      await dependencies.fileSystem.rename(transaction.paths.target, transaction.paths.rollback)
      progress.oldMoved = true
      maybeInterrupt('old-renamed')

      const oldMovedMarker: PreCommitMarker = {
        ...transaction.manifest,
        phase: 'old-moved',
        previousDigest: transaction.prepared.digest,
      }
      transaction.oldMoved = await writeImmutableMarker(
        dependencies.fileSystem,
        transaction.paths.oldMovedMarker,
        oldMovedMarker,
      )
      maybeInterrupt('old-moved')

      await removeSidecars(transaction.paths.target)
      await assertPathAbsent(dependencies.fileSystem, transaction.paths.target)
      await dependencies.fileSystem.rename(transaction.paths.stage, transaction.paths.target)
      progress.newPublished = true
      maybeInterrupt('new-renamed')

      const newPublishedMarker: PreCommitMarker = {
        ...transaction.manifest,
        phase: 'new-published',
        previousDigest: transaction.oldMoved.digest,
      }
      transaction.newPublished = await writeImmutableMarker(
        dependencies.fileSystem,
        transaction.paths.newPublishedMarker,
        newPublishedMarker,
      )
      maybeInterrupt('new-published')

      await initializeAndAssert()
      progress.liveClosed = false
      await writeCommittedMarker(transaction)
      maybeInterrupt('committed')

      try {
        await cleanupAllArtifacts(transaction)
      } catch (cleanupError) {
        if (cleanupError instanceof DatabaseImportInterruption) throw cleanupError
        dependencies.warn('[DatabaseImport] 提交后清理失败，保留 committed 恢复证据:', cleanupError)
      }
      return { success: true }
    } catch (error) {
      if (error instanceof DatabaseImportInterruption) throw error
      if (!transaction) return { success: false, error: toImportError(error) }

      if (!progress.liveClosed && !progress.oldMoved && !progress.newPublished) {
        try {
          await cleanupBeforeCommit(transaction)
        } catch (cleanupError) {
          dependencies.warn('[DatabaseImport] 发布前失败清理异常:', cleanupError)
        }
        return { success: false, error: toImportError(error) }
      }

      try {
        await recoverImportFailure(transaction, progress)
        return { success: false, error: toImportError(error) }
      } catch (recoveryError) {
        const fatal = recoveryError instanceof DatabaseImportFatalError
          ? recoveryError
          : fatalRecoveryError(transaction.paths, recoveryError)
        return { success: false, error: fatal.message, fatal: true }
      }
    } finally {
      importInProgress = false
    }
  }

  const validateBaseMarker = (
    marker: unknown,
    expected: ImportManifest,
    phase: PreCommitPhase,
  ): marker is PreCommitMarker => {
    return isValidManifest(marker, expected)
      && marker.phase === phase
      && (marker.previousDigest === null || (
        typeof marker.previousDigest === 'string' && DIGEST_PATTERN.test(marker.previousDigest)
      ))
  }

  const loadTransaction = async (
    targetPath: string,
    transactionId: string,
  ): Promise<ImportTransaction> => {
    const paths = createArtifactPaths(targetPath, transactionId)
    const prepared = await readPersistedMarker<PreCommitMarker>(dependencies.fileSystem, paths.preparedMarker)
    const oldMoved = await readPersistedMarker<PreCommitMarker>(dependencies.fileSystem, paths.oldMovedMarker)
    const newPublished = await readPersistedMarker<PreCommitMarker>(dependencies.fileSystem, paths.newPublishedMarker)
    const committed = await readPersistedMarker<CommittedMarker>(dependencies.fileSystem, paths.committedMarker)
    const anyMarker = prepared ?? oldMoved ?? newPublished ?? committed
    if (!anyMarker) {
      return {
        manifest: createManifest(
          paths,
          transactionId,
          '0'.repeat(64),
          { device: '0', fileId: '0' },
        ),
        paths,
      }
    }
    const markerValue: unknown = anyMarker.value
    const candidateDigest = isRecord(markerValue) && typeof markerValue.candidateDigest === 'string'
      ? markerValue.candidateDigest
      : ''
    const originalTargetIdentity = isRecord(markerValue) && isValidFileIdentity(markerValue.originalTargetIdentity)
      ? markerValue.originalTargetIdentity
      : { device: '0', fileId: '0' }
    const manifest = createManifest(paths, transactionId, candidateDigest, originalTargetIdentity)

    if (!DIGEST_PATTERN.test(candidateDigest) || !isValidFileIdentity(originalTargetIdentity)) {
      throw new DatabaseImportFatalError(`数据库导入 marker manifest 无效: ${dirname(targetPath)}`)
    }
    if (prepared && !validateBaseMarker(prepared.value, manifest, 'prepared')) {
      throw new DatabaseImportFatalError(`prepared marker 无效: ${paths.preparedMarker}`)
    }
    if (oldMoved && !validateBaseMarker(oldMoved.value, manifest, 'old-moved')) {
      throw new DatabaseImportFatalError(`old-moved marker 无效: ${paths.oldMovedMarker}`)
    }
    if (newPublished && !validateBaseMarker(newPublished.value, manifest, 'new-published')) {
      throw new DatabaseImportFatalError(`new-published marker 无效: ${paths.newPublishedMarker}`)
    }
    if (prepared && prepared.value.previousDigest !== null) {
      throw new DatabaseImportFatalError('prepared marker chain 无效')
    }
    if (oldMoved && oldMoved.value.previousDigest !== (prepared?.digest ?? oldMoved.value.previousDigest)) {
      throw new DatabaseImportFatalError('old-moved marker chain 无效')
    }
    if (newPublished && newPublished.value.previousDigest !== (oldMoved?.digest ?? newPublished.value.previousDigest)) {
      throw new DatabaseImportFatalError('new-published marker chain 无效')
    }
    return { manifest, paths, prepared, oldMoved, newPublished, committed }
  }

  const validateCommittedMarker = (
    transaction: ImportTransaction,
  ): CommittedMarker => {
    const marker = transaction.committed?.value
    if (!marker || !isRecord(marker) || !isValidManifest(marker, transaction.manifest)) {
      throw new DatabaseImportFatalError('committed marker manifest 无效')
    }
    if (marker.phase !== 'committed' || !isRecord(marker.targetIdentity) || !isRecord(marker.markerDigests)) {
      throw new DatabaseImportFatalError('committed marker 结构无效')
    }
    const targetIdentity = marker.targetIdentity as unknown as FileIdentity
    const markerDigests = marker.markerDigests as unknown as CommittedMarker['markerDigests']
    if (
      !isValidFileIdentity(targetIdentity)
      || !DIGEST_PATTERN.test(markerDigests.prepared)
      || !DIGEST_PATTERN.test(markerDigests.oldMoved)
      || !DIGEST_PATTERN.test(markerDigests.newPublished)
    ) {
      throw new DatabaseImportFatalError('committed marker identity 或 digest 无效')
    }
    const chainDigest = hashText(`${markerDigests.prepared}:${markerDigests.oldMoved}:${markerDigests.newPublished}`)
    if (marker.chainDigest !== chainDigest) {
      throw new DatabaseImportFatalError('committed marker chain digest 无效')
    }
    for (const [persisted, expectedDigest] of [
      [transaction.prepared, markerDigests.prepared],
      [transaction.oldMoved, markerDigests.oldMoved],
      [transaction.newPublished, markerDigests.newPublished],
    ] as const) {
      if (persisted && persisted.digest !== expectedDigest) {
        throw new DatabaseImportFatalError('committed marker 与前序 marker 冲突')
      }
    }
    if (transaction.oldMoved?.value.previousDigest !== undefined
      && transaction.oldMoved.value.previousDigest !== markerDigests.prepared) {
      throw new DatabaseImportFatalError('old-moved marker predecessor 与 committed 冲突')
    }
    if (transaction.newPublished?.value.previousDigest !== undefined
      && transaction.newPublished.value.previousDigest !== markerDigests.oldMoved) {
      throw new DatabaseImportFatalError('new-published marker predecessor 与 committed 冲突')
    }
    return marker
  }

  const restoreCommittedRollback = async (
    transaction: ImportTransaction,
  ): Promise<DatabaseRecoveryResult> => {
    const { paths } = transaction
    if (!await fileExists(dependencies.fileSystem, paths.rollback)) {
      throw fatalRecoveryError(paths, 'committed target 无效且 rollback 不存在')
    }
    try {
      if (await fileExists(dependencies.fileSystem, paths.target)) {
        dependencies.closeDatabase()
        await quarantineTarget(paths)
      }
      await restoreRollback(transaction)
      try {
        await cleanupBeforeCommit(transaction)
      } catch (cleanupError) {
        dependencies.warn('[DatabaseImport] 降级恢复清理失败:', cleanupError)
      }
      return { databaseReady: true, warning: '新数据库身份或内容无效，已回滚到导入前数据库' }
    } catch (error) {
      throw fatalRecoveryError(paths, error)
    }
  }

  const recoverCommitted = async (
    transaction: ImportTransaction,
  ): Promise<DatabaseRecoveryResult> => {
    const marker = validateCommittedMarker(transaction)
    try {
      if (!await fileExists(dependencies.fileSystem, transaction.paths.target)) {
        return restoreCommittedRollback(transaction)
      }
      const targetIdentity = await getFileIdentity(dependencies.fileSystem, transaction.paths.target)
      if (sameIdentity(targetIdentity, transaction.manifest.originalTargetIdentity)) {
        await dependencies.validateDatabaseFile(transaction.paths.target)
        await initializeAndAssert()
        try {
          await cleanupBeforeCommit(transaction)
        } catch (cleanupError) {
          dependencies.warn('[DatabaseImport] committed 回滚收尾失败:', cleanupError)
        }
        return { databaseReady: true, warning: '数据库导入回滚清理已续跑完成' }
      }
      if (!sameIdentity(targetIdentity, marker.targetIdentity)) {
        return restoreCommittedRollback(transaction)
      }
      await dependencies.validateDatabaseFile(transaction.paths.target)
      await initializeAndAssert()
    } catch (error) {
      dependencies.warn('[DatabaseImport] committed target 验证失败，尝试回滚:', error)
      return restoreCommittedRollback(transaction)
    }

    try {
      await cleanupAllArtifacts(transaction)
    } catch (cleanupError) {
      if (cleanupError instanceof DatabaseImportInterruption) throw cleanupError
      dependencies.warn('[DatabaseImport] committed 启动收尾失败:', cleanupError)
    }
    return { databaseReady: true }
  }

  const restoreOldAtStartup = async (
    transaction: ImportTransaction,
    quarantineTargetFirst: boolean,
  ): Promise<DatabaseRecoveryResult> => {
    try {
      if (quarantineTargetFirst) {
        dependencies.closeDatabase()
        await quarantineTarget(transaction.paths)
      }
      await restoreRollback(transaction)
      try {
        await cleanupBeforeCommit(transaction)
      } catch (cleanupError) {
        dependencies.warn('[DatabaseImport] 启动回滚清理失败:', cleanupError)
      }
      return { databaseReady: true }
    } catch (error) {
      throw fatalRecoveryError(transaction.paths, error)
    }
  }

  const recoverPreCommit = async (
    transaction: ImportTransaction,
  ): Promise<DatabaseRecoveryResult> => {
    const { paths, prepared, oldMoved, newPublished } = transaction
    if (newPublished && (!oldMoved || !prepared)) {
      throw fatalRecoveryError(paths, 'new-published marker 前序链缺失')
    }
    if (oldMoved && !prepared) {
      throw fatalRecoveryError(paths, 'old-moved marker 前序链缺失')
    }

    const targetExists = await fileExists(dependencies.fileSystem, paths.target)
    const rollbackExists = await fileExists(dependencies.fileSystem, paths.rollback)
    const stageExists = await fileExists(dependencies.fileSystem, paths.stage)
    const quarantineExists = await fileExists(dependencies.fileSystem, paths.quarantine)

    if ((prepared || oldMoved || newPublished) && targetExists && !rollbackExists) {
      const targetIdentity = await getFileIdentity(dependencies.fileSystem, paths.target)
      if (sameIdentity(targetIdentity, transaction.manifest.originalTargetIdentity)) {
        try {
          await dependencies.validateDatabaseFile(paths.target)
          await initializeAndAssert()
          try {
            await cleanupBeforeCommit(transaction)
          } catch (cleanupError) {
            dependencies.warn('[DatabaseImport] 已恢复旧库的启动收尾失败:', cleanupError)
          }
          return { databaseReady: true }
        } catch (error) {
          throw fatalRecoveryError(paths, error)
        }
      }
    }

    if (newPublished) {
      if (targetExists && rollbackExists) {
        try {
          await dependencies.validateDatabaseFile(paths.target)
          await initializeAndAssert()
          await writeCommittedMarker(transaction)
          try {
            await cleanupAllArtifacts(transaction)
          } catch (cleanupError) {
            dependencies.warn('[DatabaseImport] new-published 恢复收尾失败:', cleanupError)
          }
          return { databaseReady: true }
        } catch (error) {
          dependencies.warn('[DatabaseImport] new-published target 无效，恢复旧库:', error)
          return restoreOldAtStartup(transaction, true)
        }
      }
      if (!targetExists && rollbackExists) return restoreOldAtStartup(transaction, false)
      throw fatalRecoveryError(paths, 'new-published artifacts 组合无效')
    }

    if (oldMoved) {
      if (!targetExists && rollbackExists) return restoreOldAtStartup(transaction, false)
      if (targetExists && rollbackExists && !stageExists) {
        return restoreOldAtStartup(transaction, true)
      }
      throw fatalRecoveryError(paths, 'old-moved artifacts 组合无效')
    }

    if (prepared) {
      if (targetExists && !rollbackExists) {
        try {
          await dependencies.validateDatabaseFile(paths.target)
          await initializeAndAssert()
          try {
            await cleanupBeforeCommit(transaction)
          } catch (cleanupError) {
            dependencies.warn('[DatabaseImport] prepared 恢复清理失败:', cleanupError)
          }
          return { databaseReady: true }
        } catch (error) {
          throw fatalRecoveryError(paths, error)
        }
      }
      if (!targetExists && rollbackExists) return restoreOldAtStartup(transaction, false)
      throw fatalRecoveryError(paths, 'prepared artifacts 组合无效')
    }

    const stageSidecarExists = await fileExists(dependencies.fileSystem, `${paths.stage}-wal`)
      || await fileExists(dependencies.fileSystem, `${paths.stage}-shm`)
    if (targetExists && (stageExists || stageSidecarExists) && !rollbackExists && !quarantineExists) {
      await dependencies.fileSystem.rm(paths.stage, { force: true })
      await removeSidecars(paths.stage)
      return { databaseReady: false }
    }
    throw fatalRecoveryError(paths, '无 marker 的导入 artifacts 组合无效')
  }

  const recoverInterruptedDatabaseImport = async (): Promise<DatabaseRecoveryResult> => {
    const targetPath = dependencies.getDatabasePath()
    const transactionIds = await discoverTransactionIds(targetPath)

    if (transactionIds.size === 0) return { databaseReady: false }
    if (transactionIds.size !== 1) {
      throw new DatabaseImportFatalError(
        `检测到多组数据库导入事务，已停止启动并保留证据: ${dirname(targetPath)}`,
      )
    }

    const [transactionId] = transactionIds
    const transaction = await loadTransaction(targetPath, transactionId)
    if (transaction.committed) return recoverCommitted(transaction)
    return recoverPreCommit(transaction)
  }

  return { importDatabaseBackup, recoverInterruptedDatabaseImport }
}

const databaseImportService = createDatabaseImportService({
  getDatabasePath,
  getDatabase,
  closeDatabase,
  initDatabase: (options) => initDatabase(options),
  validateDatabaseFile,
  createTransactionId: randomUUID,
  fileSystem: defaultFileSystem,
  warn: (...args) => console.warn(...args),
})

export const importDatabaseBackup = (backupPath: string): Promise<DatabaseImportResult> => (
  databaseImportService.importDatabaseBackup(backupPath)
)

export const recoverInterruptedDatabaseImport = (): Promise<DatabaseRecoveryResult> => (
  databaseImportService.recoverInterruptedDatabaseImport()
)
