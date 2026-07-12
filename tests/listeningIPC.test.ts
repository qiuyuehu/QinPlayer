import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: electronMock.handle } }))

import { registerListeningIPC, type ListeningIPCRepository } from '../electron/ipc/listening'
import type { IpcChannels } from '../src/types/ipc'

describe('听歌统计 IPC', () => {
  const repository: ListeningIPCRepository = {
    increment: vi.fn(),
    getDays: vi.fn(() => [{ date: '2026-07-12', seconds: 10 }]),
    getRanking: vi.fn(() => []),
  }
  const flags = { profile: true, playback: true }
  const handlers = new Map<string, (...args: unknown[]) => unknown>()

  beforeEach(() => {
    vi.clearAllMocks()
    flags.profile = true
    flags.playback = true
    handlers.clear()
    electronMock.handle.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    })
    registerListeningIPC(() => flags, repository)
  })

  it('应该注册三个 handler 并转发合法请求', async () => {
    await handlers.get('listening:addSeconds')?.({}, { date: '2026-07-12', seconds: 10 })
    expect(repository.increment).toHaveBeenCalledWith({ date: '2026-07-12', seconds: 10 })
    expect(await handlers.get('listening:getDays')?.({})).toEqual([{ date: '2026-07-12', seconds: 10 }])
    expect(await handlers.get('listening:getRanking')?.({}, { limit: 10 })).toEqual([])
    expect(repository.getRanking).toHaveBeenCalledWith(10)
  })

  it.each(['listening:addSeconds', 'listening:getDays', 'listening:getRanking'])(
    'profile=false 时 %s 应在访问 repository 前拒绝',
    async (channel) => {
      flags.profile = false
      const args = channel === 'listening:addSeconds'
        ? [{}, { date: '2026-07-12', seconds: 1 }]
        : channel === 'listening:getRanking'
          ? [{}, { limit: 10 }]
          : [{}]

      await expect(Promise.resolve(handlers.get(channel)?.(...args))).rejects.toThrow('个人统计功能已关闭')
      expect(repository.increment).not.toHaveBeenCalled()
      expect(repository.getDays).not.toHaveBeenCalled()
      expect(repository.getRanking).not.toHaveBeenCalled()
    },
  )

  it('playback=false 时读取可用但写入应被拒绝', async () => {
    flags.playback = false

    await expect(Promise.resolve(handlers.get('listening:addSeconds')?.(
      {},
      { date: '2026-07-12', seconds: 1 },
    ))).rejects.toThrow('播放功能已关闭')
    expect(await handlers.get('listening:getDays')?.({})).toEqual([{ date: '2026-07-12', seconds: 10 }])
    expect(repository.increment).not.toHaveBeenCalled()
  })

  it('repository 异常应该记录中文上下文并继续 reject', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(repository.getDays).mockImplementationOnce(() => {
      throw new Error('database failed')
    })

    await expect(Promise.resolve(handlers.get('listening:getDays')?.({}))).rejects.toThrow('database failed')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('读取听歌日统计失败'), expect.any(Error))
  })

  it('共享类型与 preload 白名单应该同时包含三个通道', () => {
    const channels: Array<keyof IpcChannels> = [
      'listening:addSeconds',
      'listening:getDays',
      'listening:getRanking',
    ]
    const preload = readFileSync(resolve('electron/preload.ts'), 'utf8')

    for (const channel of channels) expect(preload).toContain(`'${channel}'`)
  })
})
