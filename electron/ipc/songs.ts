// =============================================================================
// QinPlayer — 歌曲相关 IPC Handler
// =============================================================================
// 职责：歌曲 CRUD、搜索、收藏、最近播放、播放次数
// 所有数据库操作在这里封装，通过 ipcMain.handle 暴露给渲染进程
// =============================================================================

import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'
import type { Track } from '../../src/types'

// ---------------------------------------------------------------------------
// 数据库行 → Track 类型映射
// ---------------------------------------------------------------------------
// SQLite 列名是 snake_case，TypeScript 接口是 camelCase
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

/** 将数据库行转换为 Track 类型 */
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

// ---------------------------------------------------------------------------
// 注册所有歌曲相关 IPC 通道
// ---------------------------------------------------------------------------

export function registerSongsIPC(): void {
  // --- songs:getAll — 获取所有歌曲 ---
  ipcMain.handle('songs:getAll', () => {
    const db = getDatabase()
    const rows = db.prepare('SELECT * FROM songs ORDER BY id DESC').all() as SongRow[]
    return rows.map(rowToTrack)
  })

  // --- songs:search — 按歌名/歌手搜索 ---
  ipcMain.handle('songs:search', (_event, { keyword }: { keyword: string }) => {
    const db = getDatabase()
    const pattern = `%${keyword}%`
    const rows = db.prepare(
      'SELECT * FROM songs WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? ORDER BY play_count DESC'
    ).all(pattern, pattern, pattern) as SongRow[]
    return rows.map(rowToTrack)
  })

  // --- songs:like — 收藏歌曲 ---
  ipcMain.handle('songs:like', (_event, { songId }: { songId: number }) => {
    const db = getDatabase()
    db.prepare('INSERT OR IGNORE INTO liked_songs (song_id) VALUES (?)').run(songId)
  })

  // --- songs:unlike — 取消收藏 ---
  ipcMain.handle('songs:unlike', (_event, { songId }: { songId: number }) => {
    const db = getDatabase()
    db.prepare('DELETE FROM liked_songs WHERE song_id = ?').run(songId)
  })

  // --- songs:getLiked — 获取收藏列表 ---
  ipcMain.handle('songs:getLiked', () => {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT s.* FROM songs s
      INNER JOIN liked_songs l ON s.id = l.song_id
      ORDER BY s.id DESC
    `).all() as SongRow[]
    return rows.map(rowToTrack)
  })

  // --- songs:getRecent — 获取最近播放（50 首）---
  ipcMain.handle('songs:getRecent', () => {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT s.* FROM songs s
      INNER JOIN recently_played r ON s.id = r.song_id
      ORDER BY r.played_at DESC
      LIMIT 50
    `).all() as SongRow[]
    return rows.map(rowToTrack)
  })

  // --- songs:updatePlayCount — 播放次数 +1 ---
  ipcMain.handle('songs:updatePlayCount', (_event, { songId }: { songId: number }) => {
    const db = getDatabase()
    db.prepare('UPDATE songs SET play_count = play_count + 1 WHERE id = ?').run(songId)
  })

  // --- songs:recordPlay — 记录最近播放 ---
  ipcMain.handle('songs:recordPlay', (_event, { songId }: { songId: number }) => {
    const db = getDatabase()
    db.prepare('INSERT INTO recently_played (song_id) VALUES (?)').run(songId)
  })

  // --- songs:isLiked — 检查是否已收藏 ---
  ipcMain.handle('songs:isLiked', (_event, { songId }: { songId: number }) => {
    const db = getDatabase()
    const row = db.prepare('SELECT 1 FROM liked_songs WHERE song_id = ?').get(songId)
    return !!row
  })

  // --- songs:deleteAll — 清空所有歌曲 ---
  ipcMain.handle('songs:deleteAll', () => {
    const db = getDatabase()
    // 外键 CASCADE 会自动清理歌单关联、收藏、播放记录
    const result = db.prepare('DELETE FROM songs').run()
    console.log('[IPC] 已清空所有歌曲:', result.changes, '首')
    return { deleted: result.changes }
  })

  console.log('[IPC] 歌曲相关通道已注册')
}
