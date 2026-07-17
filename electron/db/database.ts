// =============================================================================
// QinPlayer — SQLite 数据库初始化
// =============================================================================
// 职责：数据库连接、表结构创建、WAL 模式开启
// 依赖：better-sqlite3（同步 API，性能高）
// 路径：app.getPath('userData') + '/qinplayer.db'（防更新丢数据）
// =============================================================================

import Database from 'better-sqlite3'
import { app, dialog } from 'electron'
import { join } from 'path'
import { mkdir } from 'fs/promises'
import { ensureListeningStatsTable } from './listeningRepository'

// ---------------------------------------------------------------------------
// 数据库实例（模块级单例）
// ---------------------------------------------------------------------------

export type DatabaseConnection = Database.Database

export interface DatabaseManagerDependencies {
  getDatabasePath: () => string
  openDatabase: (databasePath: string) => DatabaseConnection
  createSchema: (database: DatabaseConnection) => void
  ensureListeningStats: (database: DatabaseConnection) => void
  createCoversDirectory: () => Promise<void>
  showInitializationError: (databasePath: string, error: unknown) => void
}

export interface DatabaseInitializationOptions {
  showErrorDialog?: boolean
}

export function getDatabasePath(): string {
  return join(app.getPath('userData'), 'qinplayer.db')
}

export function createDatabaseManager(dependencies: DatabaseManagerDependencies) {
  let currentDatabase: DatabaseConnection | null = null

  const init = async (
    options: DatabaseInitializationOptions = {},
  ): Promise<DatabaseConnection> => {
    if (currentDatabase) return currentDatabase

    const databasePath = dependencies.getDatabasePath()
    const showErrorDialog = options.showErrorDialog ?? true
    let nextDatabase: DatabaseConnection | null = null

    try {
      nextDatabase = dependencies.openDatabase(databasePath)
      nextDatabase.pragma('journal_mode = WAL')
      nextDatabase.pragma('foreign_keys = ON')
      dependencies.createSchema(nextDatabase)
      dependencies.ensureListeningStats(nextDatabase)
      await dependencies.createCoversDirectory()

      currentDatabase = nextDatabase
      return currentDatabase
    } catch (error) {
      currentDatabase = null
      if (nextDatabase) {
        try {
          nextDatabase.close()
        } catch (closeError) {
          console.warn('[Database] 初始化失败后的连接关闭也失败:', closeError)
        }
      }
      if (showErrorDialog) dependencies.showInitializationError(databasePath, error)
      throw error
    }
  }

  const get = (): DatabaseConnection => {
    if (!currentDatabase) {
      throw new Error('[Database] 数据库尚未初始化，请先调用 initDatabase()')
    }
    return currentDatabase
  }

  const close = (): void => {
    if (!currentDatabase) return
    const databaseToClose = currentDatabase
    currentDatabase = null
    databaseToClose.close()
  }

  return { init, get, close }
}

const databaseManager = createDatabaseManager({
  getDatabasePath,
  openDatabase: (databasePath) => new Database(databasePath),
  createSchema: (database) => createTables(database),
  ensureListeningStats: (database) => ensureListeningStatsTable(database),
  createCoversDirectory: async () => {
    const coversDirectory = join(app.getPath('userData'), 'covers')
    await mkdir(coversDirectory, { recursive: true })
    console.log('[Database] 封面缓存目录:', coversDirectory)
  },
  showInitializationError: (databasePath, error) => {
    dialog.showErrorBox(
      '数据库初始化失败',
      `QinPlayer 无法初始化数据库，可能是磁盘空间不足或文件权限问题。\n\n路径: ${databasePath}\n错误: ${String(error)}`,
    )
  },
})

/**
 * 初始化数据库
 * - 创建数据库文件（如不存在）
 * - 开启 WAL 模式（并发读写性能提升）
 * - 创建表结构
 * - 创建封面缓存目录
 *
 * 必须在 app.whenReady() 之后调用
 */
export async function initDatabase(
  options: DatabaseInitializationOptions = {},
): Promise<DatabaseConnection> {
  const databasePath = getDatabasePath()
  console.log('[Database] 数据库路径:', databasePath)
  try {
    const database = await databaseManager.init(options)
    console.log('[Database] WAL 模式已开启')
    return database
  } catch (error) {
    console.error('[Database] 初始化失败:', error)
    throw error
  }
}

/**
 * 获取数据库实例
 * 如果尚未初始化，抛出错误
 */
export function getDatabase(): DatabaseConnection {
  return databaseManager.get()
}

/**
 * 关闭数据库连接
 * 应用退出时调用
 */
export function closeDatabase(): void {
  databaseManager.close()
  console.log('[Database] 数据库已关闭')
}

// ---------------------------------------------------------------------------
// 表结构定义
// ---------------------------------------------------------------------------

/**
 * 创建所有数据表
 * 使用 IF NOT EXISTS 确保幂等性
 */
function createTables(db: DatabaseConnection): void {
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
