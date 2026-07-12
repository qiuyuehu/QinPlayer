import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ensureListeningStatsTable,
  getListeningDays,
  getListeningRanking,
  incrementListeningSeconds,
  type ListeningDatabase,
} from '../electron/db/listeningRepository'

class TestDatabase implements ListeningDatabase {
  readonly database = new DatabaseSync(':memory:')

  exec(sql: string): void {
    this.database.exec(sql)
  }

  prepare(sql: string) {
    const statement = this.database.prepare(sql)
    return {
      run: (...params: unknown[]) => statement.run(...params),
      get: (...params: unknown[]) => statement.get(...params),
      all: (...params: unknown[]) => statement.all(...params),
    }
  }

  close(): void {
    this.database.close()
  }
}

describe('听歌统计 repository', () => {
  let db: TestDatabase

  beforeEach(() => {
    db = new TestDatabase()
    db.exec(`
      CREATE TABLE songs (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        album TEXT,
        duration REAL,
        cover_path TEXT,
        mtime INTEGER,
        play_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
  })

  afterEach(() => db.close())

  it('建表应该幂等且使用 seconds 非负约束', () => {
    ensureListeningStatsTable(db)
    ensureListeningStatsTable(db)

    expect(() => db.prepare(
      'INSERT INTO listening_stats(local_date, seconds) VALUES (?, ?)',
    ).run('2026-07-12', -1)).toThrow()
  })

  it('同一天多次 increment 应该原子累加并按日期升序返回', () => {
    ensureListeningStatsTable(db)
    incrementListeningSeconds(db, { date: '2026-07-12', seconds: 10 })
    incrementListeningSeconds(db, { date: '2026-07-11', seconds: 5 })
    incrementListeningSeconds(db, { date: '2026-07-12', seconds: 20 })

    expect(getListeningDays(db)).toEqual([
      { date: '2026-07-11', seconds: 5 },
      { date: '2026-07-12', seconds: 30 },
    ])
  })

  it.each([
    [{ date: '2026-02-30', seconds: 1 }],
    [{ date: '2026-2-03', seconds: 1 }],
    [{ date: 'invalid', seconds: 1 }],
    [{ date: '2026-07-12', seconds: 0 }],
    [{ date: '2026-07-12', seconds: -1 }],
    [{ date: '2026-07-12', seconds: 1.5 }],
    [{ date: '2026-07-12', seconds: Number.NaN }],
    [{ date: '2026-07-12', seconds: Number.POSITIVE_INFINITY }],
    [{ date: '2026-07-12', seconds: 301 }],
  ])('应该拒绝非法增量 %#', (input) => {
    ensureListeningStatsTable(db)
    expect(() => incrementListeningSeconds(db, input)).toThrow()
  })

  it('排行榜应该过滤零次、稳定排序并受 limit 限制', () => {
    ensureListeningStatsTable(db)
    const insert = db.prepare(`
      INSERT INTO songs(id, file_path, file_name, title, artist, album, duration, cover_path, mtime, play_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run(3, '/c.mp3', 'c.mp3', 'C', '歌手 C', '专辑', 30, null, 0, 0, '2026-01-01')
    insert.run(2, '/b.mp3', 'b.mp3', 'B', '歌手 B', '专辑', 20, null, 0, 5, '2026-01-01')
    insert.run(1, '/a.mp3', 'a.mp3', 'A', '歌手 A', '专辑', 10, null, 0, 5, '2026-01-01')

    expect(getListeningRanking(db, 1)).toEqual([
      expect.objectContaining({ playCount: 5, track: expect.objectContaining({ id: 1, title: 'A' }) }),
    ])
    expect(getListeningRanking(db, 10).map((entry) => entry.track.id)).toEqual([1, 2])
  })

  it.each([0, -1, 1.5, 51, Number.NaN, Number.POSITIVE_INFINITY])(
    '应该拒绝非法 limit %s',
    (limit) => {
      ensureListeningStatsTable(db)
      expect(() => getListeningRanking(db, limit)).toThrow()
    },
  )

  it('删除歌曲后排行榜消失但日统计保留', () => {
    ensureListeningStatsTable(db)
    incrementListeningSeconds(db, { date: '2026-07-12', seconds: 20 })
    db.prepare(`
      INSERT INTO songs(id, file_path, file_name, title, play_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, '/a.mp3', 'a.mp3', 'A', 3)

    db.prepare('DELETE FROM songs').run()

    expect(getListeningRanking(db, 10)).toEqual([])
    expect(getListeningDays(db)).toEqual([{ date: '2026-07-12', seconds: 20 }])
  })
})
