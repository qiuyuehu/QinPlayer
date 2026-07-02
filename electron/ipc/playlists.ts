// =============================================================================
// QinPlayer — 歌单相关 IPC Handler
// =============================================================================
// 职责：歌单 CRUD、歌曲排序、添加/移除歌曲
// =============================================================================

import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'
import type { Track, Playlist } from '../../src/types'

// ---------------------------------------------------------------------------
// 类型映射
// ---------------------------------------------------------------------------

interface SongRow {
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

interface PlaylistRow {
  id: number
  name: string
  created_at: string
  song_count?: number
  cover_path: string | null
}

function rowToTrack(row: SongRow): Track {
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
    createdAt: row.created_at
  }
}

function rowToPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    songCount: row.song_count || 0,
    coverPath: row.cover_path ?? null
  }
}

// ---------------------------------------------------------------------------
// 注册所有歌单相关 IPC 通道
// ---------------------------------------------------------------------------

export function registerPlaylistsIPC(): void {
  // --- playlists:create — 创建歌单 ---
  ipcMain.handle('playlists:create', (_event, { name }: { name: string }) => {
    const db = getDatabase()
    const result = db.prepare('INSERT INTO playlists (name) VALUES (?)').run(name)
    const row = db.prepare('SELECT * FROM playlists WHERE id = ?').get(result.lastInsertRowid) as PlaylistRow
    console.log('[IPC] 歌单已创建:', name)
    return rowToPlaylist(row)
  })

  // --- playlists:rename — 重命名歌单 ---
  ipcMain.handle('playlists:rename', (_event, { id, name }: { id: number; name: string }) => {
    const db = getDatabase()
    db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, id)
    console.log('[IPC] 歌单已重命名:', id, '→', name)
  })

  // --- playlists:delete — 删除歌单 ---
  ipcMain.handle('playlists:delete', (_event, { id }: { id: number }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM playlists WHERE id = ?').run(id)
    console.log('[IPC] 歌单已删除:', id)
  })

  // --- playlists:getAll — 获取所有歌单（含歌曲数量）---
  ipcMain.handle('playlists:getAll', () => {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT
        p.*,
        COUNT(ps.song_id) AS song_count,
        (
          SELECT s.cover_path
          FROM playlist_songs first_ps
          INNER JOIN songs s ON s.id = first_ps.song_id
          WHERE first_ps.playlist_id = p.id
          ORDER BY first_ps.sort_order ASC
          LIMIT 1
        ) AS cover_path
      FROM playlists p
      LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all() as PlaylistRow[]
    return rows.map(rowToPlaylist)
  })

  // --- playlists:getSongs — 获取歌单内歌曲（支持排序）---
  // ⚠️ sortBy/order 用联合类型约束，防止 SQL 注入
  ipcMain.handle('playlists:getSongs', (_event, { id, sortBy, order }: { id: number; sortBy: 'default' | 'playCount'; order: 'asc' | 'desc' }) => {
    const db = getDatabase()

    // 根据排序方式构建 SQL（白名单映射，不直接拼接用户输入）
    let orderBy: string
    if (sortBy === 'playCount') {
      orderBy = order === 'asc' ? 's.play_count ASC' : 's.play_count DESC'
    } else {
      // 默认按添加顺序
      orderBy = order === 'asc' ? 'ps.sort_order ASC' : 'ps.sort_order DESC'
    }

    const rows = db.prepare(`
      SELECT s.* FROM songs s
      INNER JOIN playlist_songs ps ON s.id = ps.song_id
      WHERE ps.playlist_id = ?
      ORDER BY ${orderBy}
    `).all(id) as SongRow[]

    return rows.map(rowToTrack)
  })

  // --- playlists:addSong — 添加歌曲到歌单 ---
  ipcMain.handle('playlists:addSong', (_event, { playlistId, songId }: { playlistId: number; songId: number }) => {
    const db = getDatabase()

    // 获取当前最大排序值
    const maxRow = db.prepare(
      'SELECT MAX(sort_order) as max_order FROM playlist_songs WHERE playlist_id = ?'
    ).get(playlistId) as { max_order: number | null }
    const nextOrder = (maxRow?.max_order || 0) + 1

    db.prepare(
      'INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, sort_order) VALUES (?, ?, ?)'
    ).run(playlistId, songId, nextOrder)
  })

  // --- playlists:removeSong — 从歌单移除歌曲 ---
  ipcMain.handle('playlists:removeSong', (_event, { playlistId, songId }: { playlistId: number; songId: number }) => {
    const db = getDatabase()
    db.prepare(
      'DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?'
    ).run(playlistId, songId)
  })

  // --- playlists:isInPlaylist — 检查歌曲是否在歌单中 ---
  ipcMain.handle('playlists:isInPlaylist', (_event, { playlistId, songId }: { playlistId: number; songId: number }) => {
    const db = getDatabase()
    const row = db.prepare(
      'SELECT 1 FROM playlist_songs WHERE playlist_id = ? AND song_id = ?'
    ).get(playlistId, songId)
    return !!row
  })

  console.log('[IPC] 歌单相关通道已注册')
}
