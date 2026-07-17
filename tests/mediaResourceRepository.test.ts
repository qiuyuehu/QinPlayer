import { describe, expect, it, vi } from 'vitest'

import {
  createMediaResourceRepository,
  type MediaResourceDatabase,
  type MediaResourceFileSystem,
} from '../electron/db/mediaResourceRepository'

interface RepositoryFixtureOptions {
  audioPath?: string | null
  coverPath?: string | null
  avatarPath?: string | null
  musicRoots?: string[]
  realPaths?: Record<string, string>
  nonFiles?: string[]
  nonDirectories?: string[]
}

function createFixture(options: RepositoryFixtureOptions = {}) {
  const queryCalls: Array<{ sql: string; params: unknown[] }> = []
  const audioPath = options.audioPath === undefined ? 'C:\\Music\\album\\song.mp3' : options.audioPath
  const coverPath = options.coverPath === undefined ? 'C:\\UserData\\covers\\song.jpg' : options.coverPath
  const avatarPath = options.avatarPath === undefined ? 'C:\\UserData\\avatar\\avatar.png' : options.avatarPath
  const musicRoots = options.musicRoots ?? ['C:\\Music']

  const database: MediaResourceDatabase = {
    prepare: vi.fn((sql: string) => ({
      get: (...params: unknown[]) => {
        queryCalls.push({ sql, params })
        if (sql.includes('SELECT file_path, cover_path')) {
          return audioPath === null ? undefined : { file_path: audioPath, cover_path: coverPath }
        }
        if (sql.includes('SELECT file_path')) {
          return audioPath === null ? undefined : { file_path: audioPath }
        }
        if (sql.includes('FROM settings')) {
          return avatarPath === null ? undefined : { value: avatarPath }
        }
        return undefined
      },
      all: (...params: unknown[]) => {
        queryCalls.push({ sql, params })
        return sql.includes('FROM music_folders') ? musicRoots.map((path) => ({ path })) : []
      },
    })),
  }
  const realPaths = options.realPaths ?? {}
  const nonFiles = new Set(options.nonFiles ?? [])
  const nonDirectories = new Set(options.nonDirectories ?? [])
  const directoryPaths = new Set([
    ...musicRoots,
    'C:\\UserData\\covers',
    'C:\\UserData\\avatar',
  ].map((path) => realPaths[path] ?? path))
  const fileSystem: MediaResourceFileSystem = {
    realpath: vi.fn(async (path: string) => realPaths[path] ?? path),
    stat: vi.fn(async (path: string) => ({
      isFile: () => !directoryPaths.has(path) && !nonFiles.has(path),
      isDirectory: () => directoryPaths.has(path) && !nonDirectories.has(path),
    })),
  }
  const repository = createMediaResourceRepository({
    getDatabase: () => database,
    getUserDataPath: () => 'C:\\UserData',
    fileSystem,
  })

  return { repository, database, fileSystem, queryCalls }
}

describe('media resource repository', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    '拒绝非法 song id %s',
    async (id) => {
      const { repository, database } = createFixture()
      await expect(repository.resolveAudio(id)).rejects.toThrow('正安全整数')
      expect(database.prepare).not.toHaveBeenCalled()
    },
  )

  it('audio 使用参数绑定按 id 查询并限制在注册 music root', async () => {
    const { repository, queryCalls } = createFixture()
    await expect(repository.resolveAudio(7)).resolves.toEqual({
      filePath: 'C:\\Music\\album\\song.mp3',
      contentType: 'audio/mpeg',
    })
    expect(queryCalls.find((call) => call.sql.includes('SELECT file_path'))?.params).toEqual([7])
    expect(queryCalls.find((call) => call.sql.includes('FROM music_folders'))?.params).toEqual([])
  })

  it('未知 song id、空 cover 和空 avatar 都返回 not found', async () => {
    await expect(createFixture({ audioPath: null }).repository.resolveAudio(1)).resolves.toBeNull()
    await expect(createFixture({ coverPath: null }).repository.resolveCover(1)).resolves.toBeNull()
    await expect(createFixture({ avatarPath: null }).repository.resolveAvatar()).resolves.toBeNull()
  })

  it('audio 拒绝 Music2 前缀碰撞与 realpath 后逃逸', async () => {
    await expect(createFixture({
      audioPath: 'C:\\Music2\\song.mp3',
    }).repository.resolveAudio(1)).resolves.toBeNull()

    await expect(createFixture({
      audioPath: 'C:\\Music\\link\\song.mp3',
      realPaths: { 'C:\\Music\\link\\song.mp3': 'C:\\Outside\\song.mp3' },
    }).repository.resolveAudio(1)).resolves.toBeNull()
  })

  it('audio 必须是受支持扩展的普通文件', async () => {
    await expect(createFixture({ audioPath: 'C:\\Music\\song.txt' }).repository.resolveAudio(1)).resolves.toBeNull()
    await expect(createFixture({ nonFiles: ['C:\\Music\\album\\song.mp3'] }).repository.resolveAudio(1)).resolves.toBeNull()
  })

  it('注册 music root 本身不是目录时拒绝授权', async () => {
    await expect(createFixture({
      audioPath: 'C:\\Music\\song.mp3',
      nonDirectories: ['C:\\Music'],
    }).repository.resolveAudio(1)).resolves.toBeNull()
  })

  it('cover 只允许该 song mapping 指向 covers 或歌曲目录中的图片', async () => {
    await expect(createFixture().repository.resolveCover(2)).resolves.toEqual({
      filePath: 'C:\\UserData\\covers\\song.jpg',
      contentType: 'image/jpeg',
    })
    await expect(createFixture({
      coverPath: 'C:\\Music\\album\\cover.png',
    }).repository.resolveCover(2)).resolves.toEqual({
      filePath: 'C:\\Music\\album\\cover.png',
      contentType: 'image/png',
    })
    await expect(createFixture({
      coverPath: 'C:\\Other\\cover.jpg',
    }).repository.resolveCover(2)).resolves.toBeNull()
  })

  it('cover 拒绝扩展名错配与 symlink 逃逸', async () => {
    await expect(createFixture({
      coverPath: 'C:\\UserData\\covers\\cover.gif',
    }).repository.resolveCover(1)).resolves.toBeNull()
    await expect(createFixture({
      coverPath: 'C:\\UserData\\covers\\link.jpg',
      realPaths: { 'C:\\UserData\\covers\\link.jpg': 'C:\\Outside\\link.jpg' },
    }).repository.resolveCover(1)).resolves.toBeNull()
  })

  it('avatar 只读 settings.avatarPath，并限制在 userData/avatar 的图片普通文件', async () => {
    const { repository, queryCalls } = createFixture()
    await expect(repository.resolveAvatar()).resolves.toEqual({
      filePath: 'C:\\UserData\\avatar\\avatar.png',
      contentType: 'image/png',
    })
    expect(queryCalls.find((call) => call.sql.includes('FROM settings'))?.params).toEqual(['avatarPath'])

    await expect(createFixture({
      avatarPath: 'C:\\UserData\\avatar2\\avatar.png',
    }).repository.resolveAvatar()).resolves.toBeNull()
    await expect(createFixture({
      avatarPath: 'C:\\UserData\\avatar\\link.jpg',
      realPaths: { 'C:\\UserData\\avatar\\link.jpg': 'C:\\Outside\\avatar.jpg' },
    }).repository.resolveAvatar()).resolves.toBeNull()
  })
})
