import { app } from 'electron'
import { realpath, stat } from 'fs/promises'
import { win32 } from 'path'

import { getDatabase } from './database'

export interface MediaResourceDatabase {
  prepare: (sql: string) => {
    get: (...params: unknown[]) => unknown
    all: (...params: unknown[]) => unknown[]
  }
}

export interface MediaResourceFileSystem {
  realpath: (path: string) => Promise<string>
  stat: (path: string) => Promise<{ isFile(): boolean; isDirectory(): boolean }>
}

export interface ResolvedMediaResource {
  filePath: string
  contentType: string
}

export interface MediaResourceRepositoryDependencies {
  getDatabase: () => MediaResourceDatabase
  getUserDataPath: () => string
  fileSystem: MediaResourceFileSystem
}

const AUDIO_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  '.opus': 'audio/ogg',
}

const IMAGE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

function assertSongId(songId: number): void {
  if (!Number.isSafeInteger(songId) || songId <= 0) {
    throw new TypeError('song id 必须是正安全整数')
  }
}

function isPathWithin(rootPath: string, candidatePath: string): boolean {
  const root = win32.resolve(rootPath).toLowerCase()
  const candidate = win32.resolve(candidatePath).toLowerCase()
  const relative = win32.relative(root, candidate)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${win32.sep}`)
    && !win32.isAbsolute(relative)
  )
}

async function resolveOrdinaryFile(
  fileSystem: MediaResourceFileSystem,
  filePath: unknown,
  contentTypes: Readonly<Record<string, string>>,
): Promise<ResolvedMediaResource | null> {
  if (typeof filePath !== 'string' || !win32.isAbsolute(filePath)) return null
  try {
    const resolvedPath = await fileSystem.realpath(filePath)
    const fileStat = await fileSystem.stat(resolvedPath)
    if (!fileStat.isFile()) return null
    const contentType = contentTypes[win32.extname(resolvedPath).toLowerCase()]
    return contentType ? { filePath: resolvedPath, contentType } : null
  } catch {
    return null
  }
}

async function resolveExistingRoot(
  fileSystem: MediaResourceFileSystem,
  rootPath: string,
): Promise<string | null> {
  if (!win32.isAbsolute(rootPath)) return null
  try {
    const resolvedRoot = await fileSystem.realpath(rootPath)
    const rootStat = await fileSystem.stat(resolvedRoot)
    return rootStat.isDirectory() ? resolvedRoot : null
  } catch {
    return null
  }
}

export function createMediaResourceRepository(dependencies: MediaResourceRepositoryDependencies) {
  const resolveAudio = async (songId: number): Promise<ResolvedMediaResource | null> => {
    assertSongId(songId)
    const database = dependencies.getDatabase()
    const row = database.prepare('SELECT file_path FROM songs WHERE id = ?').get(songId) as {
      file_path?: unknown
    } | undefined
    if (!row) return null

    const resource = await resolveOrdinaryFile(dependencies.fileSystem, row.file_path, AUDIO_CONTENT_TYPES)
    if (!resource) return null
    const roots = database.prepare('SELECT path FROM music_folders ORDER BY id').all() as Array<{ path?: unknown }>
    for (const rowRoot of roots) {
      if (typeof rowRoot.path !== 'string') continue
      const resolvedRoot = await resolveExistingRoot(dependencies.fileSystem, rowRoot.path)
      if (resolvedRoot && isPathWithin(resolvedRoot, resource.filePath)) return resource
    }
    return null
  }

  const resolveCover = async (songId: number): Promise<ResolvedMediaResource | null> => {
    assertSongId(songId)
    const row = dependencies.getDatabase()
      .prepare('SELECT file_path, cover_path FROM songs WHERE id = ?')
      .get(songId) as { file_path?: unknown; cover_path?: unknown } | undefined
    if (!row || typeof row.file_path !== 'string') return null

    const resource = await resolveOrdinaryFile(dependencies.fileSystem, row.cover_path, IMAGE_CONTENT_TYPES)
    if (!resource) return null

    const allowedRoots: string[] = []
    const coversRoot = await resolveExistingRoot(
      dependencies.fileSystem,
      win32.join(dependencies.getUserDataPath(), 'covers'),
    )
    if (coversRoot) allowedRoots.push(coversRoot)
    const resolvedSong = await resolveOrdinaryFile(dependencies.fileSystem, row.file_path, AUDIO_CONTENT_TYPES)
    if (resolvedSong) allowedRoots.push(win32.dirname(resolvedSong.filePath))

    return allowedRoots.some((root) => isPathWithin(root, resource.filePath)) ? resource : null
  }

  const resolveAvatar = async (): Promise<ResolvedMediaResource | null> => {
    const row = dependencies.getDatabase()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('avatarPath') as { value?: unknown } | undefined
    if (!row) return null
    const resource = await resolveOrdinaryFile(dependencies.fileSystem, row.value, IMAGE_CONTENT_TYPES)
    if (!resource) return null
    const avatarRoot = await resolveExistingRoot(
      dependencies.fileSystem,
      win32.join(dependencies.getUserDataPath(), 'avatar'),
    )
    return avatarRoot && isPathWithin(avatarRoot, resource.filePath) ? resource : null
  }

  return { resolveAudio, resolveCover, resolveAvatar }
}

export const mediaResourceRepository = createMediaResourceRepository({
  getDatabase,
  getUserDataPath: () => app.getPath('userData'),
  fileSystem: { realpath, stat },
})
