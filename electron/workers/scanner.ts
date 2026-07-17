// =============================================================================
// QinPlayer — 媒体库扫描 Worker
// =============================================================================
// 职责：适配 worker_threads、解析 ID3 标签、提取封面。
// 注意：Worker 线程绝对不能直接操作 SQLite！
// =============================================================================

import { parentPort, workerData } from 'worker_threads'
import { readdir, stat, writeFile, access } from 'fs/promises'
import { join, basename, dirname } from 'path'
import { createHash } from 'crypto'
import type { ScanResult, ScannerWorkerData, ScannerWorkerMessage } from '../scanTypes'
import { runScannerCore } from './scannerCore'

/** 向主进程发送经过共享类型约束的内部消息。 */
function sendMessage(message: ScannerWorkerMessage): void {
  parentPort?.postMessage(message)
}

/** 发送只用于诊断的 Worker 日志。 */
function sendLog(message: string): void {
  sendMessage({ type: 'log', data: message })
}

// ---------------------------------------------------------------------------
// 解析单个音频文件的 ID3 标签
// ---------------------------------------------------------------------------

async function parseAudioFile(filePath: string, coversDir: string): Promise<ScanResult | null> {
  try {
    // 获取文件真实 mtime（增量扫描对比用）
    const fileStat = await stat(filePath)

    // 动态导入 music-metadata（ESM 模块）
    const mm = await import('music-metadata')
    const metadata = await mm.parseFile(filePath, { skipCovers: false })
    const { common, format } = metadata

    // 提取封面：优先内嵌，其次同目录 cover.jpg/folder.jpg
    let coverPath: string | null = null
    if (common.picture && common.picture.length > 0) {
      coverPath = await extractAndSaveCover(filePath, common.picture[0], coversDir)
    }
    if (!coverPath) {
      sendLog(`[解析] ${basename(filePath)}: 无内嵌封面，查找同目录封面`)
      coverPath = await findLocalCover(filePath)
      sendLog(`[解析] ${basename(filePath)}: 封面结果 = ${coverPath}`)
    } else {
      sendLog(`[解析] ${basename(filePath)}: 有内嵌封面 = ${coverPath}`)
    }

    return {
      filePath,
      fileName: basename(filePath),
      title: common.title || null,
      artist: common.artist || null,
      album: common.album || null,
      duration: format.duration || null,
      coverPath,
      mtime: fileStat.mtimeMs
    }
  } catch {
    // 保持原有行为：标签解析失败仍用文件名兜底写入曲库。
    const fileStat = await stat(filePath).catch(() => null)
    return {
      filePath,
      fileName: basename(filePath),
      title: null,
      artist: null,
      album: null,
      duration: null,
      coverPath: null,
      mtime: fileStat?.mtimeMs ?? 0
    }
  }
}

// ---------------------------------------------------------------------------
// 提取封面图并写入缓存目录
// ---------------------------------------------------------------------------

async function extractAndSaveCover(
  filePath: string,
  picture: { format: string; data: Buffer },
  coversDir: string
): Promise<string | null> {
  try {
    const hash = createHash('md5').update(filePath).digest('hex')
    const ext = picture.format === 'image/jpeg' ? 'jpg' : 'png'
    const coverPath = join(coversDir, `${hash}.${ext}`)

    try {
      await access(coverPath)
      return coverPath
    } catch {
      // 缓存不存在时继续写入。
    }

    await writeFile(coverPath, picture.data)
    return coverPath
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 查找同目录下的封面文件（兜底方案）
// ---------------------------------------------------------------------------

const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.jpeg', 'folder.png']
const COVER_EXTS = ['.jpg', '.jpeg', '.png']

async function findLocalCover(audioFilePath: string): Promise<string | null> {
  try {
    const dir = dirname(audioFilePath)
    const fileName = basename(audioFilePath)
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'))

    sendLog(`[封面查找] 目录: ${dir}`)
    sendLog(`[封面查找] 文件名: ${fileName}`)
    sendLog(`[封面查找] 去扩展名: ${nameWithoutExt}`)

    for (const ext of COVER_EXTS) {
      const coverPath = join(dir, nameWithoutExt + ext)
      sendLog(`[封面查找] 尝试: ${coverPath}`)
      try {
        await access(coverPath)
        sendLog(`[封面查找] 找到: ${coverPath}`)
        return coverPath
      } catch {
        // 不存在，继续。
      }
    }

    for (const name of COVER_NAMES) {
      const coverPath = join(dir, name)
      sendLog(`[封面查找] 尝试通用: ${coverPath}`)
      try {
        await access(coverPath)
        sendLog(`[封面查找] 找到通用: ${coverPath}`)
        return coverPath
      } catch {
        // 不存在，继续。
      }
    }

    sendLog('[封面查找] 未找到任何封面')
  } catch (error) {
    sendLog(`[封面查找] 异常: ${String(error)}`)
  }
  return null
}

/** 启动共享扫描核心；入口文件本身不再承载遍历和删除协议。 */
async function main(): Promise<void> {
  const data = workerData as ScannerWorkerData
  sendLog(`Worker 启动，模式=${data.mode}，文件夹=${data.folderPaths.length} 个`)
  await runScannerCore(data, {
    readdir: (dirPath) => readdir(dirPath),
    stat: (filePath) => stat(filePath),
    parse: parseAudioFile,
    emit: sendMessage
  })
}

void main().catch((error) => {
  sendMessage({
    type: 'fatal-error',
    data: { message: `扫描 Worker 失败: ${String(error)}` }
  })
})
