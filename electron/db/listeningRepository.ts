import type { ListeningDay, ListeningRankingEntry } from '../../src/types/ipc'
import type { Track } from '../../src/types'

interface ListeningStatement {
  run: (...params: unknown[]) => unknown
  get: (...params: unknown[]) => unknown
  all: (...params: unknown[]) => unknown[]
}

export interface ListeningDatabase {
  exec: (sql: string) => void
  prepare: (sql: string) => ListeningStatement
}

export interface ListeningIncrementInput {
  date: string
  seconds: number
}

interface ListeningDayRow {
  local_date: string
  seconds: number
}

interface RankingRow {
  id: number
  file_path: string
  file_name: string
  title: string | null
  artist: string | null
  album: string | null
  duration: number | null
  cover_path: string | null
  mtime: number | null
  play_count: number
  created_at: string
}

function isValidLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(0)
  candidate.setHours(0, 0, 0, 0)
  candidate.setFullYear(year, month - 1, day)
  return candidate.getFullYear() === year
    && candidate.getMonth() === month - 1
    && candidate.getDate() === day
}

function rowToTrack(row: RankingRow): Track {
  return {
    id: row.id,
    filePath: row.file_path,
    fileName: row.file_name,
    title: row.title || row.file_name,
    artist: row.artist || '未知歌手',
    album: row.album || '未知专辑',
    duration: row.duration || 0,
    coverPath: row.cover_path,
    mtime: row.mtime || 0,
    playCount: row.play_count,
    createdAt: row.created_at,
  }
}

export function ensureListeningStatsTable(db: ListeningDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listening_stats (
      local_date TEXT PRIMARY KEY,
      seconds INTEGER NOT NULL DEFAULT 0 CHECK (seconds >= 0)
    ) WITHOUT ROWID
  `)
}

export function incrementListeningSeconds(
  db: ListeningDatabase,
  input: ListeningIncrementInput,
): void {
  if (!isValidLocalDate(input.date)) {
    throw new Error(`非法本地日期: ${input.date}`)
  }
  if (!Number.isInteger(input.seconds) || input.seconds < 1 || input.seconds > 300) {
    throw new Error(`听歌时长增量必须是 1..300 的整数: ${String(input.seconds)}`)
  }

  db.prepare(`
    INSERT INTO listening_stats(local_date, seconds)
    VALUES (?, ?)
    ON CONFLICT(local_date) DO UPDATE SET seconds = seconds + excluded.seconds
  `).run(input.date, input.seconds)
}

export function getListeningDays(db: ListeningDatabase): ListeningDay[] {
  const rows = db.prepare(`
    SELECT local_date, seconds
    FROM listening_stats
    WHERE seconds > 0
    ORDER BY local_date ASC
  `).all() as unknown as ListeningDayRow[]

  return rows.map((row) => ({ date: row.local_date, seconds: row.seconds }))
}

export function getListeningRanking(
  db: ListeningDatabase,
  limit: number,
): ListeningRankingEntry[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error(`排行榜 limit 必须是 1..50 的整数: ${String(limit)}`)
  }

  const rows = db.prepare(`
    SELECT *
    FROM songs
    WHERE play_count > 0
    ORDER BY play_count DESC, id ASC
    LIMIT ?
  `).all(limit) as unknown as RankingRow[]

  return rows.map((row) => ({ track: rowToTrack(row), playCount: row.play_count }))
}
