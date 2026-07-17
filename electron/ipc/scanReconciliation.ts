// =============================================================================
// QinPlayer — 扫描快照与数据库删除对账
// =============================================================================
// 只有可信 root 内、确认不存在且不受 unavailable scope 保护的歌曲才可删除。
// =============================================================================

import type Database from 'better-sqlite3'
import { win32 } from 'path'
import type { FilesystemSnapshot } from '../scanTypes'

export interface ReconciliationSong {
  id: number
  filePath: string
}

interface DatabaseSongRow {
  id: number
  file_path: string
}

interface NormalizedSnapshot {
  roots: string[]
  existingPathKeys: Set<string>
  unavailablePaths: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeAbsolutePath(filePath: string): string | null {
  if (typeof filePath !== 'string' || filePath.length === 0 || !win32.isAbsolute(filePath)) {
    return null
  }
  return win32.resolve(filePath).toLowerCase()
}

function normalizePathList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const paths = new Map<string, string>()
  for (const item of value) {
    const normalized = typeof item === 'string' ? normalizeAbsolutePath(item) : null
    if (!normalized) return null
    if (!paths.has(normalized)) paths.set(normalized, normalized)
  }
  return [...paths.values()]
}

function normalizeSnapshot(value: unknown): NormalizedSnapshot | null {
  if (!isRecord(value)) return null
  const roots = normalizePathList(value.roots)
  const existingPaths = normalizePathList(value.existingPaths)
  const unavailablePaths = normalizePathList(value.unavailablePaths)
  if (!roots || !existingPaths || !unavailablePaths || roots.length === 0) return null
  return {
    roots,
    existingPathKeys: new Set(existingPaths),
    unavailablePaths
  }
}

function isWithin(scopePath: string, candidatePath: string): boolean {
  const relative = win32.relative(scopePath, candidatePath)
  return relative === ''
    || (relative !== '..'
      && !relative.startsWith(`..${win32.sep}`)
      && !win32.isAbsolute(relative))
}

/** 纯函数：根据可信快照计算本轮允许删除的歌曲。 */
export function findDeletionCandidates(
  songs: readonly ReconciliationSong[],
  snapshot: unknown
): ReconciliationSong[] {
  const normalizedSnapshot = normalizeSnapshot(snapshot)
  if (!normalizedSnapshot) return []

  return songs.filter((song) => {
    if (!Number.isSafeInteger(song.id)) return false
    const candidatePath = normalizeAbsolutePath(song.filePath)
    if (!candidatePath) return false
    if (!normalizedSnapshot.roots.some((root) => isWithin(root, candidatePath))) return false
    if (normalizedSnapshot.existingPathKeys.has(candidatePath)) return false
    return !normalizedSnapshot.unavailablePaths.some(
      (unavailablePath) => isWithin(unavailablePath, candidatePath)
    )
  })
}

/** 在单个 better-sqlite3 transaction 中应用本轮删除对账。 */
export function applyScanReconciliation(
  db: Database.Database,
  snapshot: FilesystemSnapshot
): number {
  const rows = db.prepare<[], DatabaseSongRow>(
    'SELECT id, file_path FROM songs'
  ).all()
  const candidates = findDeletionCandidates(
    rows.map((row) => ({ id: row.id, filePath: row.file_path })),
    snapshot
  )
  if (candidates.length === 0) return 0

  const deleteStatement = db.prepare<[number]>('DELETE FROM songs WHERE id = ?')
  const deleteTransaction = db.transaction((songsToDelete: readonly ReconciliationSong[]) => {
    let deletedCount = 0
    for (const candidate of songsToDelete) {
      deletedCount += deleteStatement.run(candidate.id).changes
    }
    return deletedCount
  })
  return deleteTransaction(candidates)
}
