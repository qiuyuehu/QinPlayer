// =============================================================================
// QinPlayer — 扫描 Worker 内部协议
// =============================================================================

import { win32 } from 'path'
// 仅用于 Worker 与主进程，不进入 preload 或 Renderer IPC。
// =============================================================================

export interface ScanResult {
  filePath: string
  fileName: string
  title: string | null
  artist: string | null
  album: string | null
  duration: number | null
  coverPath: string | null
  mtime: number
}

export interface ScanProgress {
  percent: number
  currentFile: string
  processed: number
  total: number
}

export interface FilesystemSnapshot {
  roots: string[]
  existingPaths: string[]
  unavailablePaths: string[]
}

export interface ScannerWorkerData {
  folderPaths: string[]
  coversDir: string
  mode: 'full' | 'incremental'
  existingFiles: Record<string, number>
}

export type ScannerWorkerMessage =
  | { type: 'song'; data: ScanResult }
  | { type: 'progress'; data: ScanProgress }
  | { type: 'file-error'; data: { file: string; message: string } }
  | { type: 'fatal-error'; data: { message: string } }
  | { type: 'log'; data: string }
  | { type: 'filesystem-snapshot'; data: FilesystemSnapshot }
  | { type: 'done'; data: { total: number } }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isAbsolutePathArray(value: unknown): value is string[] {
  return isStringArray(value)
    && value.every((item) => item.length > 0 && win32.isAbsolute(item))
}

/** 校验 Worker 提供的文件系统快照结构。 */
export function isFilesystemSnapshot(value: unknown): value is FilesystemSnapshot {
  if (!isRecord(value)) return false
  return isAbsolutePathArray(value.roots)
    && value.roots.length > 0
    && isAbsolutePathArray(value.existingPaths)
    && isAbsolutePathArray(value.unavailablePaths)
}

function isScanResult(value: unknown): value is ScanResult {
  if (!isRecord(value)) return false
  return typeof value.filePath === 'string'
    && typeof value.fileName === 'string'
    && isNullableString(value.title)
    && isNullableString(value.artist)
    && isNullableString(value.album)
    && (value.duration === null || isFiniteNumber(value.duration))
    && isNullableString(value.coverPath)
    && isFiniteNumber(value.mtime)
}

function isScanProgress(value: unknown): value is ScanProgress {
  if (!isRecord(value)) return false
  return isFiniteNumber(value.percent)
    && typeof value.currentFile === 'string'
    && Number.isInteger(value.processed)
    && Number.isInteger(value.total)
    && (value.processed as number) >= 0
    && (value.total as number) >= 0
}

/** 拒绝畸形或未知的 Worker 消息，避免不可信快照进入删除决策。 */
export function isScannerWorkerMessage(value: unknown): value is ScannerWorkerMessage {
  if (!isRecord(value) || typeof value.type !== 'string' || !('data' in value)) return false

  switch (value.type) {
    case 'song':
      return isScanResult(value.data)
    case 'progress':
      return isScanProgress(value.data)
    case 'file-error':
      return isRecord(value.data)
        && typeof value.data.file === 'string'
        && typeof value.data.message === 'string'
    case 'fatal-error':
      return isRecord(value.data) && typeof value.data.message === 'string'
    case 'log':
      return typeof value.data === 'string'
    case 'filesystem-snapshot':
      return isFilesystemSnapshot(value.data)
    case 'done':
      return isRecord(value.data)
        && Number.isInteger(value.data.total)
        && (value.data.total as number) >= 0
    default:
      return false
  }
}
