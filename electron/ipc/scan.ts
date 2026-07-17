// =============================================================================
// QinPlayer — 文件夹扫描 IPC Handler
// =============================================================================
// 职责：文件夹选择、Worker 生命周期、数据库写入与安全删除对账。
// =============================================================================

import { dialog, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { Worker } from 'worker_threads'
import { getDatabase } from '../db/database'
import { applyScanReconciliation } from './scanReconciliation'
import { createScanRunState, type ScanRunDecision } from './scanRunState'
import {
  isScannerWorkerMessage,
  type ScanResult,
  type ScannerWorkerData,
  type ScannerWorkerMessage
} from '../scanTypes'
import { handleIpc, sendIpc } from './typedIpc'

let scanWorker: Worker | null = null

/** 将 Worker 解析的歌曲数据 upsert 到主进程数据库。 */
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

/** 读取增量扫描所需的 file_path → mtime 映射。 */
function getExistingSongs(): Record<string, number> {
  const db = getDatabase()
  const rows = db.prepare('SELECT file_path, mtime FROM songs').all() as {
    file_path: string
    mtime: number
  }[]
  const map: Record<string, number> = {}
  for (const row of rows) map[row.file_path] = row.mtime
  return map
}

function sendScanFailure(
  getMainWindow: () => BrowserWindow | null,
  label: string,
  reason: string
): void {
  console.error(`[${label}] ${reason}`)
  sendIpc(getMainWindow()?.webContents, 'scan:error', { message: '扫描失败，请重试' })
}

function handleRunDecision(
  decision: ScanRunDecision | null,
  getMainWindow: () => BrowserWindow | null,
  label: string
): void {
  if (!decision) return
  if (decision.type === 'failed-terminal') {
    sendScanFailure(getMainWindow, label, decision.reason)
    return
  }

  try {
    const deletedCount = applyScanReconciliation(getDatabase(), decision.snapshot)
    if (deletedCount > 0) {
      console.log(`[${label}] 已事务式清理 ${deletedCount} 条确认缺失的歌曲记录`)
    }
    console.log(`[${label}] 完成，尝试解析 ${decision.total} 首`)
    sendIpc(getMainWindow()?.webContents, 'scan:done', { total: decision.total })
  } catch (error) {
    sendScanFailure(getMainWindow, label, `删除对账失败: ${String(error)}`)
  }
}

/** 为单个 Worker 建立不可跨 run 复用的终止门。 */
function attachScannerWorker(
  worker: Worker,
  expectedRoots: readonly string[],
  getMainWindow: () => BrowserWindow | null,
  label: string
): void {
  const runState = createScanRunState(expectedRoots)

  worker.on('message', (rawMessage: unknown) => {
    if (scanWorker !== worker || runState.isTerminal()) return
    if (!isScannerWorkerMessage(rawMessage)) {
      handleRunDecision(
        runState.handleProtocolError('结构或字段不符合扫描协议'),
        getMainWindow,
        label
      )
      return
    }

    const message: ScannerWorkerMessage = rawMessage
    const decision = runState.handleMessage(message)
    if (decision) {
      handleRunDecision(decision, getMainWindow, label)
      return
    }

    try {
      switch (message.type) {
        case 'song':
          insertSong(message.data)
          sendIpc(getMainWindow()?.webContents, 'scan:song-found', message.data)
          break
        case 'progress':
          sendIpc(getMainWindow()?.webContents, 'scan:progress', message.data)
          break
        case 'file-error':
          console.error(`[${label}] 单文件错误:`, message.data)
          sendIpc(getMainWindow()?.webContents, 'scan:error', {
            message: '部分文件扫描失败，请检查文件权限'
          })
          break
        case 'log':
          console.log(`[${label}]`, message.data)
          break
        case 'filesystem-snapshot':
        case 'done':
        case 'fatal-error':
          // 由 runState 缓存或结算，不在消息到达时产生数据库副作用。
          break
      }
    } catch (error) {
      handleRunDecision(runState.handleWorkerError(error), getMainWindow, label)
    }
  })

  worker.on('error', (error) => {
    if (scanWorker !== worker) return
    handleRunDecision(runState.handleWorkerError(error), getMainWindow, label)
  })

  worker.on('exit', (code) => {
    if (scanWorker !== worker) return
    handleRunDecision(runState.handleExit(code), getMainWindow, label)
    if (scanWorker === worker) scanWorker = null
  })
}

/** 创建并登记新的扫描 Worker；旧 Worker 的迟到事件会被 run identity 拒绝。 */
function startScannerWorker(
  data: ScannerWorkerData,
  getMainWindow: () => BrowserWindow | null,
  label: string
): Worker {
  const worker = new Worker(join(__dirname, 'scanner.js'), { workerData: data })
  scanWorker = worker
  attachScannerWorker(worker, data.folderPaths, getMainWindow, label)
  return worker
}

/** 注册文件夹选择与手动全量扫描 IPC。 */
export function registerScanIPC(getMainWindow: () => BrowserWindow | null): void {
  handleIpc('select-folder', async () => {
    const result = await dialog.showOpenDialog(getMainWindow()!, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  handleIpc('scan-folder', async (_event, folderPath: string) => {
    try {
      const db = getDatabase()
      db.prepare('INSERT OR IGNORE INTO music_folders (path) VALUES (?)').run(folderPath)
      startScannerWorker({
        folderPaths: [folderPath],
        coversDir: join(app.getPath('userData'), 'covers'),
        mode: 'full',
        existingFiles: {}
      }, getMainWindow, 'Scanner')
      return { success: true }
    } catch (error) {
      console.error('[Scanner] 启动失败:', error)
      return { success: false, error: '扫描启动失败，请重试' }
    }
  })

  console.log('[IPC] 扫描相关通道已注册')
}

/** 应用启动后对所有已注册 roots 执行一次增量扫描。 */
export function startIncrementalScan(getMainWindow: () => BrowserWindow | null): void {
  try {
    const db = getDatabase()
    const folders = db.prepare(
      'SELECT path FROM music_folders ORDER BY id'
    ).all() as { path: string }[]
    if (folders.length === 0) {
      console.log('[增量扫描] 没有已注册的音乐文件夹，跳过')
      return
    }

    const folderPaths = folders.map((folder) => folder.path)
    const existingFiles = getExistingSongs()
    console.log(
      `[增量扫描] 启动：${folderPaths.length} 个文件夹，${Object.keys(existingFiles).length} 首已有歌曲`
    )
    startScannerWorker({
      folderPaths,
      coversDir: join(app.getPath('userData'), 'covers'),
      mode: 'incremental',
      existingFiles
    }, getMainWindow, '增量扫描')
  } catch (error) {
    console.error('[增量扫描] 启动失败:', error)
  }
}
