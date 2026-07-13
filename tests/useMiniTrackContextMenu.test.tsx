import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMiniTrackContextMenu } from '../src/hooks/useMiniTrackContextMenu'
import type { NativeTrackMenuAction, NativeTrackMenuEntry } from '../src/types/ipc'
import type { Track } from '../src/types'

const trackA: Track = {
  id: 1,
  filePath: 'C:\\music\\a.mp3',
  fileName: 'a.mp3',
  title: '歌曲 A',
  artist: '歌手 A',
  album: '专辑 A',
  duration: 180,
  coverPath: null,
  mtime: 0,
  playCount: 0,
  createdAt: '2026-07-13',
}

const trackB: Track = { ...trackA, id: 2, filePath: 'C:\\music\\b.mp3', fileName: 'b.mp3', title: '歌曲 B' }

function createOptions() {
  return {
    onPlay: vi.fn(),
    onInsertNext: vi.fn(),
    onRemovePriority: vi.fn(),
    onRemovePlaylist: vi.fn(),
    canInsertNext: vi.fn((track: Track) => track.id !== trackA.id),
  }
}

function contextEvent(): React.MouseEvent {
  return { preventDefault: vi.fn() } as unknown as React.MouseEvent
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('useMiniTrackContextMenu', () => {
  const invokeMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    invokeMock.mockResolvedValue(null)
    window.electronAPI = { ...window.electronAPI, invoke: invokeMock }
  })

  it('source 与 priority 应该发送固定 action IDs 和 enabled', async () => {
    const options = createOptions()
    document.documentElement.dataset.theme = 'light'
    document.documentElement.dataset.reducedMotion = 'true'
    const { result } = renderHook(() => useMiniTrackContextMenu(options))

    await act(async () => result.current.open(contextEvent(), trackA, 'source'))
    await act(async () => result.current.open(contextEvent(), trackB, 'priority'))

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'context-menu:show-track', {
      entries: [
        { action: 'play', enabled: true },
        { action: 'insert-next', enabled: false },
        { action: 'remove-playlist', enabled: true },
        { action: 'open-location', enabled: true },
        { action: 'show-info', enabled: true },
      ] satisfies NativeTrackMenuEntry[],
      theme: 'light',
      reducedMotion: true,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'context-menu:show-track', {
      entries: [
        { action: 'play', enabled: true },
        { action: 'remove-priority', enabled: true },
        { action: 'open-location', enabled: true },
        { action: 'show-info', enabled: true },
      ] satisfies NativeTrackMenuEntry[],
      theme: 'light',
      reducedMotion: true,
    })
  })

  it('应该把返回 action 路由到右键时捕获的歌曲', async () => {
    const options = createOptions()
    const { result } = renderHook(() => useMiniTrackContextMenu(options))
    const cases: Array<[NativeTrackMenuAction, 'source' | 'priority']> = [
      ['play', 'source'],
      ['insert-next', 'source'],
      ['remove-playlist', 'source'],
      ['remove-priority', 'priority'],
    ]

    for (const [action, kind] of cases) {
      invokeMock.mockResolvedValueOnce(action)
      await act(async () => result.current.open(contextEvent(), trackB, kind))
    }

    expect(options.onPlay).toHaveBeenCalledWith(trackB)
    expect(options.onInsertNext).toHaveBeenCalledWith(trackB)
    expect(options.onRemovePlaylist).toHaveBeenCalledWith(trackB.id)
    expect(options.onRemovePriority).toHaveBeenCalledWith(trackB.id)
  })

  it('打开目录和歌曲信息应该作用于捕获歌曲', async () => {
    const options = createOptions()
    const { result } = renderHook(() => useMiniTrackContextMenu(options))
    invokeMock.mockResolvedValueOnce('open-location').mockResolvedValueOnce(null)

    await act(async () => result.current.open(contextEvent(), trackB, 'source'))
    expect(invokeMock).toHaveBeenCalledWith('open-file-location', trackB.filePath)

    invokeMock.mockResolvedValueOnce('show-info')
    await act(async () => result.current.open(contextEvent(), trackB, 'source'))
    expect(result.current.songInfoTrack).toEqual(trackB)
    act(() => result.current.closeSongInfo())
    expect(result.current.songInfoTrack).toBeNull()
  })

  it('pending 时第二次右键不应该发起新 invoke', async () => {
    const pending = deferred<NativeTrackMenuAction | null>()
    invokeMock.mockReturnValueOnce(pending.promise)
    const options = createOptions()
    const { result } = renderHook(() => useMiniTrackContextMenu(options))

    let first!: Promise<void>
    act(() => { first = result.current.open(contextEvent(), trackA, 'source') })
    await act(async () => result.current.open(contextEvent(), trackB, 'source'))
    expect(invokeMock).toHaveBeenCalledTimes(1)

    pending.resolve('play')
    await act(async () => first)
    expect(options.onPlay).toHaveBeenCalledWith(trackA)
  })

  it('null、未知 action 和 reject 都不应该执行陈旧动作', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const options = createOptions()
    const { result } = renderHook(() => useMiniTrackContextMenu(options))
    invokeMock.mockResolvedValueOnce(null)
      .mockResolvedValueOnce('unknown')
      .mockRejectedValueOnce(new Error('invoke failed'))

    await act(async () => result.current.open(contextEvent(), trackA, 'source'))
    await act(async () => result.current.open(contextEvent(), trackA, 'source'))
    await act(async () => result.current.open(contextEvent(), trackA, 'source'))

    expect(options.onPlay).not.toHaveBeenCalled()
    expect(options.onInsertNext).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('卸载后 Promise 返回值应该被忽略', async () => {
    const pending = deferred<NativeTrackMenuAction | null>()
    invokeMock.mockReturnValueOnce(pending.promise)
    const options = createOptions()
    const { result, unmount } = renderHook(() => useMiniTrackContextMenu(options))
    let request!: Promise<void>

    act(() => { request = result.current.open(contextEvent(), trackB, 'source') })
    unmount()
    pending.resolve('play')
    await act(async () => request)

    expect(options.onPlay).not.toHaveBeenCalled()
  })

  it('非法或缺失主题时应该按 dark 快照发送', async () => {
    document.documentElement.dataset.theme = 'system'
    document.documentElement.dataset.reducedMotion = 'false'
    const options = createOptions()
    const { result } = renderHook(() => useMiniTrackContextMenu(options))

    await act(async () => result.current.open(contextEvent(), trackA, 'source'))

    expect(invokeMock).toHaveBeenCalledWith('context-menu:show-track', expect.objectContaining({
      theme: 'dark',
      reducedMotion: false,
    }))
  })
})
