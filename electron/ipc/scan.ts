// =============================================================================
// QinPlayer — 文件夹扫描 IPC Handler
// =============================================================================
// 职责：文件夹选择、Worker 扫描、增量扫描、数据库写入
// 设计：Worker Threads 在独立线程扫描，通过 postMessage 传递结果
// ⚠️ 绝对不要在主进程主线程同步读取和解析大量音频文件的 ID3 标签！
// =============================================================================

import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { Worker } from 'worker_threads'
import { getDatabase } from '../db/database'

// ---------------------------------------------------------------------------
// 扫描结果接口（Worker 解析的歌曲元数据）
// ---------------------------------------------------------------------------

interface ScanResult {
  filePath: string
  fileName: string
  title: string | null
  artist: string | null
  album: string | null
  duration: number | null
  coverPath: string | null
  mtime: number
}

// ---------------------------------------------------------------------------
// 模块级状态
// ---------------------------------------------------------------------------

let scanWorker: Worker | null = null

// ---------------------------------------------------------------------------
// 数据库写入辅助函数
// ---------------------------------------------------------------------------

/**
 * 将 Worker 解析的歌曲数据写入数据库
 * 使用 upsert：新歌插入，已有歌曲更新元数据和封面（保留 play_count）
 */
function insertSong(song: ScanResult): void {
  const db = getDatabase()
  db.prepare(`
    INSERT INTO songs (file_path, file_name, title, artist, album, duration, cover_path, mtime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      album = excluded.album,
      duration = excluded.duration,
      cover_path = COALESCE(excluded.cover_path, songs.cover_path),
      mtime = excluded.mtime
  `).run(
    song.filePath,
    song.fileName,
    song.title,
    song.artist,
    song.album,
    song.duration,
    song.coverPath,
    song.mtime
  )
}

/**
 * 从数据库获取所有歌曲的 file_path + mtime（增量对比用）
 * 返回 Record<filePath, mtime>
 */
function getExistingSongs(): Record<string, number> {
  const db = getDatabase()
  const rows = db.prepare('SELECT file_path, mtime FROM songs').all() as { file_path: string; mtime: number }[]
  const map: Record<string, number> = {}
  for (const row of rows) {
    map[row.file_path] = row.mtime
  }
  return map
}

/**
 * 清理已删除的歌曲记录
 * 对比数据库中的 file_path 和文件系统实际存在的文件，删除不存在的记录
 */
function cleanDeletedSongs(existingPaths: string[]): number {
  const db = getDatabase()
  const dbSongs = db.prepare('SELECT id, file_path FROM songs').all() as { id: number; file_path: string }[]
  const pathSet = new Set(existingPaths)

  let deletedCount = 0
  const deleteStmt = db.prepare('DELETE FROM songs WHERE id = ?')
  for (const song of dbSongs) {
    if (!pathSet.has(song.file_path)) {
      deleteStmt.run(song.id)
      deletedCount++
    }
  }

  if (deletedCount > 0) {
    console.log(`[增量扫描] 已清理 ${deletedCount} 条已删除文件的记录`)
  }
  return deletedCount
}

// ---------------------------------------------------------------------------
// 注册扫描相关 IPC 通道
// ---------------------------------------------------------------------------

export function registerScanIPC(getMainWindow: () => BrowserWindow | null): void {
  // --- select-folder — 打开文件夹选择对话框 ---
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(getMainWindow()!, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  // --- scan-folder — 启动 Worker 全量扫描文件夹 ---
  ipcMain.handle('scan-folder', async (_event, folderPath: string) => {
    try {
      const db = getDatabase()
      const mainWindow = getMainWindow()

      // 保存文件夹到数据库
      db.prepare('INSERT OR IGNORE INTO music_folders (path) VALUES (?)').run(folderPath)

      // 封面缓存目录
      const coversDir = join(app.getPath('userData'), 'covers')

      // 创建 Worker 线程（用户手动扫描 = 全量模式）
      const workerPath = join(__dirname, 'scanner.js')
      scanWorker = new Worker(workerPath, {
        workerData: {
          folderPaths: [folderPath],
          coversDir,
          mode: 'full',
          existingFiles: {}
        }
      })

      // 监听 Worker 消息
      scanWorker.on('message', (msg: { type: string; data: unknown }) => {
        switch (msg.type) {
          case 'song':
            insertSong(msg.data as ScanResult)
            mainWindow?.webContents.send('scan:song-found', msg.data)
            break
          case 'progress':
            mainWindow?.webContents.send('scan:progress', msg.data)
            break
          case 'done':
            mainWindow?.webContents.send('scan:done', msg.data)
            scanWorker = null
            break
          case 'error':
            console.error('[Scanner] 错误:', msg.data)
            mainWindow?.webContents.send('scan:error', msg.data)
            break
          case 'log':
            console.log('[Scanner]', msg.data)
            break
        }
      })

      scanWorker.on('error', (err) => {
        console.error('[Scanner] Worker 异常:', err)
        mainWindow?.webContents.send('scan:error', { message: err.message })
        scanWorker = null
      })

      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

  console.log('[IPC] 扫描相关通道已注册')
}

// ---------------------------------------------------------------------------
// 启动增量扫描（应用启动时自动调用）
// ---------------------------------------------------------------------------

/**
 * 从数据库读取已注册的音乐文件夹和已有歌曲，启动 Worker 做增量扫描
 * 窗口创建后再调用，确保渲染进程已准备好接收事件
 */
export function startIncrementalScan(getMainWindow: () => BrowserWindow | null): void {
  try {
    const db = getDatabase()

    // 1. 读取已注册的音乐文件夹
    const folders = db.prepare('SELECT path FROM music_folders ORDER BY id').all() as { path: string }[]
    if (folders.length === 0) {
      console.log('[增量扫描] 没有已注册的音乐文件夹，跳过')
      return
    }

    const folderPaths = folders.map(f => f.path)

    // 2. 读取已有歌曲的 file_path + mtime
    const existingFiles = getExistingSongs()
    console.log(`[增量扫描] 启动：${folderPaths.length} 个文件夹，${Object.keys(existingFiles).length} 首已有歌曲`)

    // 3. 封面缓存目录
    const coversDir = join(app.getPath('userData'), 'covers')

    // 4. 创建增量扫描 Worker（赋值给模块级变量，防止引用丢失）
    const workerPath = join(__dirname, 'scanner.js')
    scanWorker = new Worker(workerPath, {
      workerData: {
        folderPaths,
        coversDir,
        mode: 'incremental',
        existingFiles
      }
    })

    // 5. 监听 Worker 消息（复用已有 IPC 事件，渲染进程无需改动）
    scanWorker.on('message', (msg: { type: string; data: unknown }) => {
      const mainWindow = getMainWindow()
      switch (msg.type) {
        case 'song':
          insertSong(msg.data as ScanResult)
          mainWindow?.webContents.send('scan:song-found', msg.data)
          break
        case 'progress':
          mainWindow?.webContents.send('scan:progress', msg.data)
          break
        case 'existing-paths': {
          const { paths } = msg.data as { paths: string[] }
          cleanDeletedSongs(paths)
          break
        }
        case 'done':
          console.log('[增量扫描] 完成')
          mainWindow?.webContents.send('scan:done', msg.data)
          break
        case 'error':
          console.error('[增量扫描] 错误:', msg.data)
          break
        case 'log':
          console.log('[增量扫描]', msg.data)
          break
      }
    })

    scanWorker.on('error', (err) => {
      console.error('[增量扫描] Worker 异常:', err)
    })
  } catch (err) {
    console.error('[增量扫描] 启动失败:', err)
  }
}
