import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({ handle: vi.fn() }))
const databaseMock = vi.hoisted(() => ({ prepare: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle: electronMock.handle } }))
vi.mock('../electron/db/database', () => ({ getDatabase: () => databaseMock }))

import { registerPlaylistsIPC } from '../electron/ipc/playlists'

describe('playlists resource mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    databaseMock.prepare.mockImplementation((sql: string) => ({
      all: vi.fn(() => sql.includes('FROM playlists p') ? [{
        id: 1,
        name: '歌单',
        created_at: '2026-07-16',
        song_count: 2,
        cover_path: 'C:\\UserData\\covers\\cover.jpg',
        cover_song_id: 9,
        cover_mtime: 1234,
      }] : []),
      get: vi.fn(),
      run: vi.fn(),
    }))
  })

  it('getAll 同时返回代表封面的 song id 与 mtime', async () => {
    registerPlaylistsIPC()
    const handler = electronMock.handle.mock.calls.find(([channel]) => channel === 'playlists:getAll')?.[1]
    expect(handler).toBeTypeOf('function')

    expect(await handler()).toEqual([{
      id: 1,
      name: '歌单',
      createdAt: '2026-07-16',
      songCount: 2,
      coverPath: 'C:\\UserData\\covers\\cover.jpg',
      coverSongId: 9,
      coverMtime: 1234,
    }])
    const sql = databaseMock.prepare.mock.calls.find(([source]) => String(source).includes('FROM playlists p'))?.[0]
    expect(sql).toContain('cover_song.id AS cover_song_id')
    expect(sql).toContain('cover_song.mtime AS cover_mtime')
  })

  it('create 的普通 playlist row 应把缺失派生列映射为 null', async () => {
    databaseMock.prepare.mockImplementation((sql: string) => ({
      all: vi.fn(() => []),
      get: vi.fn(() => ({ id: 2, name: '新歌单', created_at: '2026-07-16' })),
      run: vi.fn(() => ({ lastInsertRowid: 2 })),
    }))
    registerPlaylistsIPC()
    const handler = electronMock.handle.mock.calls.find(([channel]) => channel === 'playlists:create')?.[1]

    expect(await handler({}, { name: '新歌单' })).toMatchObject({
      coverPath: null,
      coverSongId: null,
      coverMtime: null,
    })
  })
})
