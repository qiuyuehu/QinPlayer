// =============================================================================
// QinPlayer — SQLite 数据库初始化
// =============================================================================
// 职责：数据库连接、表结构创建、WAL 模式开启
// 依赖：better-sqlite3（同步 API，性能高）
// 路径：app.getPath('userData') + '/qinplayer.db'（防更新丢数据）
// =============================================================================

import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdir } from 'fs/promises'

// ---------------------------------------------------------------------------
// 数据库实例（模块级单例）
// ---------------------------------------------------------------------------

let db: Database.Database | null = null

/**
 * 初始化数据库
 * - 创建数据库文件（如不存在）
 * - 开启 WAL 模式（并发读写性能提升）
 * - 创建表结构
 * - 创建封面缓存目录
 *
 * 必须在 app.whenReady() 之后调用
 */
export async function initDatabase(): Promise<Database.Database> {
  // 数据库存储在 userData 目录（Windows: AppData/Roaming/QinPlayer）
  // 绝对不能存项目目录，否则应用更新会丢失用户数据
  const dbPath = join(app.getPath('userData'), 'qinplayer.db')
  console.log('[Database] 数据库路径:', dbPath)

  try {
    db = new Database(dbPath)

    // 开启 WAL 模式：读写分离，性能提升
    db.pragma('journal_mode = WAL')
    console.log('[Database] WAL 模式已开启')

    // 开启外键约束（默认是关闭的）
    db.pragma('foreign_keys = ON')

    // 创建表结构
    createTables(db)

    // 创建封面缓存目录
    const coversDir = join(app.getPath('userData'), 'covers')
    await mkdir(coversDir, { recursive: true })
    console.log('[Database] 封面缓存目录:', coversDir)

    return db
  } catch (err) {
    console.error('[Database] 初始化失败:', err)
    // 弹出错误对话框，告诉用户出了什么问题
    const { dialog } = require('electron') as typeof import('electron')
    dialog.showErrorBox(
      '数据库初始化失败',
      `QinPlayer 无法初始化数据库，可能是磁盘空间不足或文件权限问题。\n\n路径: ${dbPath}\n错误: ${String(err)}`
    )
    throw err  // 向上传播，让 main.ts 知道初始化失败
  }
}

/**
 * 获取数据库实例
 * 如果尚未初始化，抛出错误
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('[Database] 数据库尚未初始化，请先调用 initDatabase()')
  }
  return db
}

/**
 * 关闭数据库连接
 * 应用退出时调用
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[Database] 数据库已关闭')
  }
}

// ---------------------------------------------------------------------------
// 表结构定义
// ---------------------------------------------------------------------------

/**
 * 创建所有数据表
 * 使用 IF NOT EXISTS 确保幂等性
 */
function createTables(db: Database.Database): void {
  // 歌曲表：存储所有扫描到的音频文件元数据
  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT UNIQUE NOT NULL,    -- 文件绝对路径（唯一）
      file_name TEXT NOT NULL,           -- 文件名
      title TEXT,                        -- 歌名（ID3 标签）
      artist TEXT,                       -- 歌手
      album TEXT,                        -- 专辑
      duration REAL,                     -- 时长（秒）
      cover_path TEXT,                   -- 封面图缓存路径
      mtime INTEGER,                     -- 文件最后修改时间（增量扫描用）
      play_count INTEGER DEFAULT 0,      -- 播放次数
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // 歌单表：用户手动创建的歌单
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // 歌单-歌曲关联表：多对多关系
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id INTEGER NOT NULL,
      song_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,       -- 添加顺序
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
      UNIQUE(playlist_id, song_id)       -- 同一首歌不能重复加入同一歌单
    )
  `)

  // 最近播放表：记录播放历史
  db.exec(`
    CREATE TABLE IF NOT EXISTS recently_played (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER NOT NULL,
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    )
  `)

  // 迁移：清理 recently_played 脏数据（同一首歌只保留最新一条），然后加 UNIQUE 约束
  db.exec(`
    DELETE FROM recently_played
    WHERE id NOT IN (
      SELECT MAX(id) FROM recently_played GROUP BY song_id
    )
  `)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_recently_played_song_id ON recently_played(song_id)`)

  // 我喜欢的表：收藏标记
  db.exec(`
    CREATE TABLE IF NOT EXISTS liked_songs (
      song_id INTEGER PRIMARY KEY,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    )
  `)

  // 音乐文件夹表：用户添加的扫描目录
  db.exec(`
    CREATE TABLE IF NOT EXISTS music_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL
    )
  `)

  // 设置表：键值对存储（主题、音量、播放模式等）
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)

  console.log('[Database] 表结构创建完成')
}
