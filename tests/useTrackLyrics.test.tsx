/**
 * useTrackLyrics 测试
 * 覆盖歌词路径派生、空状态、切歌清空和异步竞态
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTrackLyrics } from '../src/hooks/useTrackLyrics'
import type { Track } from '../src/types'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createTrack(id: number, fileStem: string): Track {
  return {
    id,
    filePath: `C:\\music\\${fileStem}.mp3`,
    fileName: `${fileStem}.mp3`,
    title: `歌曲 ${fileStem}`,
    artist: '测试歌手',
    album: '测试专辑',
    duration: 180,
    coverPath: null,
    mtime: 0,
    playCount: 0,
    createdAt: '2026-07-10',
  }
}

const trackA = createTrack(1, 'a')
const trackB = createTrack(2, 'b')
const invokeMock = vi.fn()
const originalInvoke = window.electronAPI.invoke

async function resolveRequest(
  deferred: Deferred<string | null>,
  content: string | null,
): Promise<void> {
  await act(async () => {
    deferred.resolve(content)
    await deferred.promise
  })
}

describe('useTrackLyrics', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    window.electronAPI.invoke = invokeMock
  })

  afterEach(() => {
    window.electronAPI.invoke = originalInvoke
  })

  it('读取歌曲时应该派生同名 LRC 路径并返回解析结果', async () => {
    invokeMock.mockResolvedValue('[00:01.00]第一句\n[00:02.00]第二句')

    const { result } = renderHook(() => useTrackLyrics(trackA))

    await waitFor(() => expect(result.current).toHaveLength(2))
    expect(invokeMock).toHaveBeenCalledWith('read-lrc-file', 'C:\\music\\a.lrc')
    expect(result.current).toEqual([
      { time: 1, text: '第一句' },
      { time: 2, text: '第二句' },
    ])
  })

  it('传入 null 时应该立即返回空数组且不读取 IPC', () => {
    const { result } = renderHook(() => useTrackLyrics(null))

    expect(result.current).toEqual([])
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it.each([
    ['null', null],
    ['空字符串', ''],
  ])('读取结果为%s时应该返回空数组', async (_label, content) => {
    invokeMock.mockResolvedValue(content)

    const { result } = renderHook(() => useTrackLyrics(trackA))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1))
    await act(async () => Promise.resolve())
    expect(result.current).toEqual([])
  })

  it('读取失败时应该返回空数组且不抛出异常', async () => {
    invokeMock.mockRejectedValue(new Error('读取失败'))

    const { result } = renderHook(() => useTrackLyrics(trackA))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1))
    await act(async () => Promise.resolve())
    expect(result.current).toEqual([])
  })

  it('切到待加载歌曲时应该立即隐藏上一首歌词', async () => {
    const requestA = createDeferred<string | null>()
    const requestB = createDeferred<string | null>()
    invokeMock
      .mockReturnValueOnce(requestA.promise)
      .mockReturnValueOnce(requestB.promise)
    const { result, rerender } = renderHook(
      ({ track }) => useTrackLyrics(track),
      { initialProps: { track: trackA as Track | null } },
    )

    await resolveRequest(requestA, '[00:01.00]甲歌词')
    await waitFor(() => expect(result.current[0]?.text).toBe('甲歌词'))

    rerender({ track: trackB })

    expect(result.current).toEqual([])
    await resolveRequest(requestB, '[00:01.00]乙歌词')
    await waitFor(() => expect(result.current[0]?.text).toBe('乙歌词'))
  })

  it('快速 A→B→A 时应该只保留最后一次 A 的歌词', async () => {
    const firstARequest = createDeferred<string | null>()
    const bRequest = createDeferred<string | null>()
    const secondARequest = createDeferred<string | null>()
    invokeMock
      .mockReturnValueOnce(firstARequest.promise)
      .mockReturnValueOnce(bRequest.promise)
      .mockReturnValueOnce(secondARequest.promise)
    const { result, rerender } = renderHook(
      ({ track }) => useTrackLyrics(track),
      { initialProps: { track: trackA as Track | null } },
    )

    rerender({ track: trackB })
    rerender({ track: trackA })
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(3))

    await resolveRequest(secondARequest, '[00:01.00]最终甲歌词')
    await waitFor(() => expect(result.current[0]?.text).toBe('最终甲歌词'))
    await resolveRequest(bRequest, '[00:01.00]迟到乙歌词')
    await resolveRequest(firstARequest, '[00:01.00]迟到甲歌词')

    expect(result.current).toEqual([{ time: 1, text: '最终甲歌词' }])
  })

  it('更换同一歌曲路径时应该重新读取且立即清空旧歌词', async () => {
    const firstRequest = createDeferred<string | null>()
    const movedRequest = createDeferred<string | null>()
    const movedTrack = { ...trackA, filePath: 'D:\\music\\a.mp3' }
    invokeMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(movedRequest.promise)
    const { result, rerender } = renderHook(
      ({ track }) => useTrackLyrics(track),
      { initialProps: { track: trackA } },
    )

    await resolveRequest(firstRequest, '[00:01.00]旧路径歌词')
    await waitFor(() => expect(result.current[0]?.text).toBe('旧路径歌词'))

    rerender({ track: movedTrack })

    expect(result.current).toEqual([])
    expect(invokeMock).toHaveBeenLastCalledWith('read-lrc-file', 'D:\\music\\a.lrc')
    await resolveRequest(movedRequest, '[00:01.00]新路径歌词')
    await waitFor(() => expect(result.current[0]?.text).toBe('新路径歌词'))
  })

  it('卸载后迟到的读取结果不应该产生状态更新警告', async () => {
    const request = createDeferred<string | null>()
    invokeMock.mockReturnValue(request.promise)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderHook(() => useTrackLyrics(trackA))

    unmount()
    await resolveRequest(request, '[00:01.00]迟到歌词')

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
