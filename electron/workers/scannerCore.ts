// =============================================================================
// QinPlayer — 可测试的扫描核心
// =============================================================================
// 负责遍历、增量筛选、解析编排与快照消息；不访问 SQLite/worker_threads。
// =============================================================================

import { win32 } from 'path'
import type {
  FilesystemSnapshot,
  ScanResult,
  ScannerWorkerData,
  ScannerWorkerMessage
} from '../scanTypes'

export interface ScannedFile {
  filePath: string
  mtimeMs: number
}

export interface ScannerFileStat {
  isDirectory(): boolean
  mtimeMs: number
}

export interface ScannerCoreAdapters {
  readdir(dirPath: string): Promise<string[]>
  stat(filePath: string): Promise<ScannerFileStat>
  parse(filePath: string, coversDir: string): Promise<ScanResult | null>
  emit(message: ScannerWorkerMessage): void
}

export interface ScannerCoreResult {
  roots: string[]
  discoveredFiles: ScannedFile[]
  filesToProcess: ScannedFile[]
  unavailablePaths: string[]
  attemptedParseCount: number
}

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac', '.wma', '.opus'
])

function normalizeAbsolutePath(filePath: string): string {
  if (typeof filePath !== 'string' || !win32.isAbsolute(filePath)) {
    throw new Error(`扫描路径不是 Windows 绝对路径: ${String(filePath)}`)
  }
  return win32.resolve(filePath)
}

function pathKey(filePath: string): string {
  return normalizeAbsolutePath(filePath).toLowerCase()
}

function addUniquePath(paths: Map<string, string>, filePath: string): string {
  const normalized = normalizeAbsolutePath(filePath)
  const key = normalized.toLowerCase()
  const existing = paths.get(key)
  if (existing) return existing
  paths.set(key, normalized)
  return normalized
}

async function scanDirectory(
  dirPath: string,
  adapters: ScannerCoreAdapters,
  files: Map<string, ScannedFile>,
  unavailablePaths: Map<string, string>
): Promise<void> {
  let entries: string[]
  try {
    entries = await adapters.readdir(dirPath)
  } catch {
    addUniquePath(unavailablePaths, dirPath)
    return
  }

  for (const entry of entries) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error(`目录返回了非法 entry: ${String(entry)}`)
    }

    const fullPath = win32.join(dirPath, entry)
    let fileStat: ScannerFileStat
    try {
      fileStat = await adapters.stat(fullPath)
    } catch {
      addUniquePath(unavailablePaths, fullPath)
      continue
    }

    if (fileStat.isDirectory()) {
      await scanDirectory(fullPath, adapters, files, unavailablePaths)
      continue
    }

    if (!AUDIO_EXTENSIONS.has(win32.extname(fullPath).toLowerCase())) continue
    const normalized = normalizeAbsolutePath(fullPath)
    const key = normalized.toLowerCase()
    if (!files.has(key)) {
      files.set(key, { filePath: normalized, mtimeMs: fileStat.mtimeMs })
    }
  }
}

function buildExistingMtimes(existingFiles: Record<string, number>): Map<string, number> {
  const mtimes = new Map<string, number>()
  for (const [filePath, mtime] of Object.entries(existingFiles)) {
    if (!Number.isFinite(mtime)) continue
    try {
      mtimes.set(pathKey(filePath), mtime)
    } catch {
      // 畸形历史记录不能阻止真实文件重新解析。
    }
  }
  return mtimes
}

function selectFilesToProcess(
  mode: ScannerWorkerData['mode'],
  discoveredFiles: ScannedFile[],
  existingFiles: Record<string, number>
): ScannedFile[] {
  if (mode === 'full') return [...discoveredFiles]
  const existingMtimes = buildExistingMtimes(existingFiles)
  return discoveredFiles.filter((file) => {
    const databaseMtime = existingMtimes.get(pathKey(file.filePath))
    return databaseMtime === undefined || file.mtimeMs > databaseMtime
  })
}

function emitProgress(
  mode: ScannerWorkerData['mode'],
  file: ScannedFile,
  processed: number,
  total: number,
  emit: ScannerCoreAdapters['emit']
): void {
  const interval = mode === 'full' ? 10 : 5
  if (processed % interval !== 0 && processed !== total) return
  emit({
    type: 'progress',
    data: {
      percent: Math.round((processed / total) * 100),
      currentFile: win32.basename(file.filePath),
      processed,
      total
    }
  })
}

/**
 * 执行一次扫描。只有遍历编排完整时才发送 snapshot + done；单文件失败不终止本轮。
 */
export async function runScannerCore(
  data: ScannerWorkerData,
  adapters: ScannerCoreAdapters
): Promise<ScannerCoreResult | null> {
  try {
    const rootsByKey = new Map<string, string>()
    for (const folderPath of data.folderPaths) addUniquePath(rootsByKey, folderPath)
    const roots = [...rootsByKey.values()]
    const filesByKey = new Map<string, ScannedFile>()
    const unavailableByKey = new Map<string, string>()

    for (const root of roots) {
      await scanDirectory(root, adapters, filesByKey, unavailableByKey)
    }

    const discoveredFiles = [...filesByKey.values()]
    const unavailablePaths = [...unavailableByKey.values()]
    const filesToProcess = selectFilesToProcess(data.mode, discoveredFiles, data.existingFiles)
    adapters.emit({
      type: 'log',
      data: data.mode === 'full'
        ? `全量扫描：发现 ${discoveredFiles.length} 个音频文件`
        : `增量扫描：文件系统 ${discoveredFiles.length} 首，数据库 ${Object.keys(data.existingFiles).length} 首`
    })
    if (data.mode === 'incremental') {
      adapters.emit({ type: 'log', data: `增量扫描：${filesToProcess.length} 首需要更新` })
    }

    let attemptedParseCount = 0
    for (const file of filesToProcess) {
      attemptedParseCount += 1
      try {
        const result = await adapters.parse(file.filePath, data.coversDir)
        if (result) {
          adapters.emit({ type: 'song', data: result })
        } else {
          adapters.emit({
            type: 'file-error',
            data: { file: file.filePath, message: '解析未返回歌曲信息' }
          })
        }
      } catch (error) {
        adapters.emit({
          type: 'file-error',
          data: { file: file.filePath, message: String(error) }
        })
      }
      emitProgress(data.mode, file, attemptedParseCount, filesToProcess.length, adapters.emit)
    }

    const snapshot: FilesystemSnapshot = {
      roots,
      existingPaths: discoveredFiles.map((file) => file.filePath),
      unavailablePaths
    }
    adapters.emit({ type: 'filesystem-snapshot', data: snapshot })
    adapters.emit({ type: 'done', data: { total: attemptedParseCount } })

    return {
      roots,
      discoveredFiles,
      filesToProcess,
      unavailablePaths,
      attemptedParseCount
    }
  } catch (error) {
    adapters.emit({
      type: 'fatal-error',
      data: { message: `扫描失败: ${String(error)}` }
    })
    return null
  }
}
