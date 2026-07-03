// =============================================================================
// QinPlayer — 媒体库扫描 Worker
// =============================================================================
// 职责：在独立线程中扫描文件夹、解析 ID3 标签、提取封面
// 注意：Worker 线程绝对不能直接操作 SQLite！
//       只负责解析，通过 postMessage 将 JSON 数据发回主进程
// =============================================================================

import { parentPort, workerData } from 'worker_threads'
import { readdir, stat, writeFile, access } from 'fs/promises'
import { join, extname, basename, dirname } from 'path'
import { createHash } from 'crypto'

// ---------------------------------------------------------------------------
// 类型定义
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

interface WorkerData {
  folderPaths: string[]
  coversDir: string
  mode: 'full' | 'incremental'   // 扫描模式：全量 / 增量
  existingFiles: Record<string, number>  // filePath → mtime 映射（增量模式用）
}

// 支持的音频格式
const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac', '.wma', '.opus'
])

// ---------------------------------------------------------------------------
// 发送消息给主进程（类型安全）
// ---------------------------------------------------------------------------

function sendMessage(type: string, data: unknown): void {
  parentPort?.postMessage({ type, data })
}

// ---------------------------------------------------------------------------
// 递归扫描目录中的音频文件
// ---------------------------------------------------------------------------

async function scanDirectory(dir: string): Promise<string[]> {
  const files: string[] = []

  try {
    const entries = await readdir(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      try {
        const fileStat = await stat(fullPath)
        if (fileStat.isDirectory()) {
          // 递归扫描子目录
          const subFiles = await scanDirectory(fullPath)
          files.push(...subFiles)
        } else {
          const ext = extname(fullPath).toLowerCase()
          if (AUDIO_EXTENSIONS.has(ext)) {
            files.push(fullPath)
          }
        }
      } catch {
        // 跳过无权限的文件/目录
      }
    }
  } catch {
    // 跳过无权限的目录
  }

  return files
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
    // 没有内嵌封面 → 查找同目录的封面文件
    if (!coverPath) {
      sendMessage('log', `[解析] ${basename(filePath)}: 无内嵌封面，查找同目录封面`)
      coverPath = await findLocalCover(filePath)
      sendMessage('log', `[解析] ${basename(filePath)}: 封面结果 = ${coverPath}`)
    } else {
      sendMessage('log', `[解析] ${basename(filePath)}: 有内嵌封面 = ${coverPath}`)
    }

    return {
      filePath,
      fileName: basename(filePath),
      title: common.title || null,
      artist: common.artist || null,
      album: common.album || null,
      duration: format.duration || null,
      coverPath,
      mtime: fileStat.mtimeMs  // 使用文件真实修改时间，不是 Date.now()
    }
  } catch {
    // 解析失败时，返回基本信息（用文件名兜底）
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
// 封面 Buffer 不能通过 IPC 传给主进程（内存爆炸），
// 必须在 Worker 内部写入磁盘，只返回文件路径
// ---------------------------------------------------------------------------

async function extractAndSaveCover(
  filePath: string,
  picture: { format: string; data: Buffer },
  coversDir: string
): Promise<string | null> {
  try {
    // 用文件路径的 MD5 作为封面文件名（保证唯一性）
    const hash = createHash('md5').update(filePath).digest('hex')
    const ext = picture.format === 'image/jpeg' ? 'jpg' : 'png'
    const coverPath = join(coversDir, `${hash}.${ext}`)

    // 检查是否已缓存（避免重复写入）
    try {
      await access(coverPath)
      return coverPath // 已存在，直接返回路径
    } catch {
      // 不存在，写入缓存
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
// 没有内嵌封面时，查找同目录下常见的封面文件名
// ---------------------------------------------------------------------------

const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.jpeg', 'folder.png']
const COVER_EXTS = ['.jpg', '.jpeg', '.png']

async function findLocalCover(audioFilePath: string): Promise<string | null> {
  try {
    // 用 path 模块替代硬编码的 '\\' 分隔符（跨平台兼容）
    const dir = dirname(audioFilePath)
    const fileName = basename(audioFilePath)
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'))

    sendMessage('log', `[封面查找] 目录: ${dir}`)
    sendMessage('log', `[封面查找] 文件名: ${fileName}`)
    sendMessage('log', `[封面查找] 去扩展名: ${nameWithoutExt}`)

    // 优先：同名封面（如 song.mp3 → song.jpg）
    for (const ext of COVER_EXTS) {
      const coverPath = join(dir, nameWithoutExt + ext)
      sendMessage('log', `[封面查找] 尝试: ${coverPath}`)
      try {
        await access(coverPath)
        sendMessage('log', `[封面查找] ✅ 找到: ${coverPath}`)
        return coverPath
      } catch {
        // 不存在，继续
      }
    }

    // 兜底：通用封面名（cover.jpg / folder.jpg）
    for (const name of COVER_NAMES) {
      const coverPath = join(dir, name)
      sendMessage('log', `[封面查找] 尝试通用: ${coverPath}`)
      try {
        await access(coverPath)
        sendMessage('log', `[封面查找] ✅ 找到通用: ${coverPath}`)
        return coverPath
      } catch {
        // 不存在，继续
      }
    }

    sendMessage('log', `[封面查找] ❌ 未找到任何封面`)
  } catch (e) {
    sendMessage('log', `[封面查找] 异常: ${e}`)
  }
  return null
}

// ---------------------------------------------------------------------------
// 递归扫描目录中的音频文件（返回路径 + mtime，增量模式用）
// ---------------------------------------------------------------------------

interface FileWithMtime {
  filePath: string
  mtimeMs: number
}

async function scanDirectoryWithStat(dir: string): Promise<FileWithMtime[]> {
  const files: FileWithMtime[] = []

  try {
    const entries = await readdir(dir)
    for (const entry of entries) {
      const fullPath = join(dir, entry)
      try {
        const fileStat = await stat(fullPath)
        if (fileStat.isDirectory()) {
          // 递归扫描子目录
          const subFiles = await scanDirectoryWithStat(fullPath)
          files.push(...subFiles)
        } else {
          const ext = extname(fullPath).toLowerCase()
          if (AUDIO_EXTENSIONS.has(ext)) {
            files.push({ filePath: fullPath, mtimeMs: fileStat.mtimeMs })
          }
        }
      } catch {
        // 跳过无权限的文件/目录
      }
    }
  } catch {
    // 跳过无权限的目录
  }

  return files
}

// ---------------------------------------------------------------------------
// 全量扫描（原有逻辑）
// ---------------------------------------------------------------------------

async function fullScan(folderPaths: string[], coversDir: string): Promise<void> {
  // 1. 收集所有音频文件路径
  const allFiles: string[] = []
  for (const folder of folderPaths) {
    const files = await scanDirectory(folder)
    allFiles.push(...files)
  }

  sendMessage('log', `全量扫描：发现 ${allFiles.length} 个音频文件`)
  sendMessage('total', { total: allFiles.length })

  // 2. 逐个解析 ID3 标签
  let processed = 0
  for (const filePath of allFiles) {
    try {
      const result = await parseAudioFile(filePath, coversDir)
      if (result) {
        sendMessage('song', result)
      }
    } catch (err) {
      sendMessage('error', { file: filePath, message: String(err) })
    }

    processed++
    // 每 10 首或最后一首报告进度
    if (processed % 10 === 0 || processed === allFiles.length) {
      const percent = Math.round((processed / allFiles.length) * 100)
      sendMessage('progress', {
        percent,
        currentFile: basename(filePath),
        processed,
        total: allFiles.length
      })
    }
  }
}

// ---------------------------------------------------------------------------
// 增量扫描（启动时自动检测新增/修改的文件）
// ---------------------------------------------------------------------------
// 逻辑：扫描目录 → 对比 existingFiles 映射 → 只解析新增/修改的文件
// 增量扫描不显示进度条（预期秒级完成）
// ---------------------------------------------------------------------------

async function incrementalScan(
  folderPaths: string[],
  coversDir: string,
  existingFiles: Record<string, number>
): Promise<void> {
  // 1. 收集所有音频文件 + 真实 mtime
  const allFiles: FileWithMtime[] = []
  for (const folder of folderPaths) {
    const files = await scanDirectoryWithStat(folder)
    allFiles.push(...files)
  }

  sendMessage('log', `增量扫描：文件系统 ${allFiles.length} 首，数据库 ${Object.keys(existingFiles).length} 首`)

  // 2. 筛选需要解析的文件：新增 或 mtime 变化
  const toProcess: FileWithMtime[] = []
  for (const file of allFiles) {
    const dbMtime = existingFiles[file.filePath]
    if (dbMtime === undefined || file.mtimeMs > dbMtime) {
      // 新增文件 或 文件修改时间比数据库记录的更新
      toProcess.push(file)
    }
  }

  sendMessage('log', `增量扫描：${toProcess.length} 首需要更新`)

  if (toProcess.length === 0) {
    // 没有需要更新的，发送空结果
    sendMessage('total', { total: 0 })
    return
  }

  sendMessage('total', { total: toProcess.length })

  // 3. 只解析需要更新的文件
  let processed = 0
  for (const file of toProcess) {
    try {
      const result = await parseAudioFile(file.filePath, coversDir)
      if (result) {
        sendMessage('song', result)
      }
    } catch (err) {
      sendMessage('error', { file: file.filePath, message: String(err) })
    }
    processed++
    // 增量扫描每 5 首报告一次进度（文件少，频率高一点）
    if (processed % 5 === 0 || processed === toProcess.length) {
      const percent = Math.round((processed / toProcess.length) * 100)
      sendMessage('progress', {
        percent,
        currentFile: basename(file.filePath),
        processed,
        total: toProcess.length
      })
    }
  }

  // 4. 发送文件系统中实际存在的所有文件路径（主进程用来清理已删除的记录）
  const currentPaths = allFiles.map(f => f.filePath)
  sendMessage('existing-paths', { paths: currentPaths })
}

// ---------------------------------------------------------------------------
// 启动扫描（根据 mode 路由到全量或增量）
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { folderPaths, coversDir, mode, existingFiles } = workerData as WorkerData
  sendMessage('log', `Worker 启动，模式=${mode}，文件夹=${folderPaths.length} 个`)

  if (mode === 'incremental') {
    await incrementalScan(folderPaths, coversDir, existingFiles)
  } else {
    await fullScan(folderPaths, coversDir)
  }

  // 扫描完成
  sendMessage('done', { total: 0 })
}

main().catch(err => {
  sendMessage('error', { message: `扫描失败: ${err}` })
})
