import { describe, expect, it, vi } from 'vitest'

import { createListeningTracker } from '../src/utils/listeningTracker'

function localMs(year: number, month: number, day: number, hour: number, minute: number, second = 0): number {
  return new Date(year, month - 1, day, hour, minute, second).getTime()
}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('真实听歌时长 tracker', () => {
  it('首次样本只建立基线，正常推进按 media 与 wall 较小值累计', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const tracker = createListeningTracker({ persist, flushThresholdSeconds: 30 })

    tracker.observe('track-1', 10, localMs(2026, 7, 12, 10, 0))
    tracker.observe('track-1', 15, localMs(2026, 7, 12, 10, 0, 2))
    await tracker.flush()

    expect(persist).toHaveBeenCalledWith('2026-07-12', 2)
  })

  it('暂停、卡顿、负 delta、seek、切歌和循环归零不应虚增', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const tracker = createListeningTracker({ persist })
    const start = localMs(2026, 7, 12, 10, 0)

    tracker.observe('a', 10, start)
    tracker.observe('a', 10, start + 1000)
    tracker.observe('a', 9, start + 2000)
    tracker.resetSample()
    tracker.observe('a', 100, start + 3000)
    tracker.observe('b', 101, start + 4000)
    tracker.observe('b', 0, start + 5000)
    await tracker.flush()

    expect(persist).not.toHaveBeenCalled()
  })

  it('向前 seek 最多只计算真实墙钟时间', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const tracker = createListeningTracker({ persist })
    const start = localMs(2026, 7, 12, 10, 0)

    tracker.observe('a', 10, start)
    tracker.observe('a', 200, start + 1500)
    await tracker.flush()

    expect(persist).toHaveBeenCalledWith('2026-07-12', 1)
  })

  it('跨本地午夜应该按墙钟区间比例拆分', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const tracker = createListeningTracker({ persist })
    const start = localMs(2026, 7, 12, 23, 59, 58)

    tracker.observe('a', 10, start)
    tracker.observe('a', 14, start + 4000)
    await tracker.flush()

    expect(persist.mock.calls).toEqual([
      ['2026-07-12', 2],
      ['2026-07-13', 2],
    ])
  })

  it('小数秒余数应该跨 flush 保留', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const tracker = createListeningTracker({ persist })
    const start = localMs(2026, 7, 12, 10, 0)

    tracker.observe('a', 0, start)
    tracker.observe('a', 0.6, start + 600)
    await tracker.flush()
    expect(persist).not.toHaveBeenCalled()

    tracker.observe('a', 1.2, start + 1200)
    await tracker.flush()
    expect(persist).toHaveBeenCalledWith('2026-07-12', 1)
  })

  it('累计达到阈值应该自动 flush 且不创建 interval', async () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const persist = vi.fn().mockResolvedValue(undefined)
    const tracker = createListeningTracker({ persist, flushThresholdSeconds: 30 })
    const start = localMs(2026, 7, 12, 10, 0)

    tracker.observe('a', 0, start)
    tracker.observe('a', 30, start + 30_000)
    await tracker.flush()

    expect(persist).toHaveBeenCalledWith('2026-07-12', 30)
    expect(intervalSpy).not.toHaveBeenCalled()
    intervalSpy.mockRestore()
  })

  it('flush 期间新增秒数不应被旧批次清空', async () => {
    const firstWrite = deferred()
    const persist = vi.fn()
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValue(undefined)
    const tracker = createListeningTracker({ persist, flushThresholdSeconds: 999 })
    const start = localMs(2026, 7, 12, 10, 0)

    tracker.observe('a', 0, start)
    tracker.observe('a', 10, start + 10_000)
    const firstFlush = tracker.flush()
    await Promise.resolve()
    expect(persist).toHaveBeenCalledWith('2026-07-12', 10)
    tracker.observe('a', 15, start + 15_000)
    firstWrite.resolve()
    await firstFlush
    await tracker.flush()

    expect(persist.mock.calls).toEqual([
      ['2026-07-12', 10],
      ['2026-07-12', 5],
    ])
  })

  it('单日失败应回补该日并继续写其他日期', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const persist = vi.fn(async (date: string) => {
      if (date === '2026-07-12') throw new Error('write failed')
    })
    const tracker = createListeningTracker({ persist, flushThresholdSeconds: 999 })

    tracker.observe('a', 0, localMs(2026, 7, 12, 23, 59, 58))
    tracker.observe('a', 4, localMs(2026, 7, 13, 0, 0, 2))
    await tracker.flush()

    expect(persist).toHaveBeenCalledWith('2026-07-12', 2)
    expect(persist).toHaveBeenCalledWith('2026-07-13', 2)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('2026-07-12'), expect.any(Error))

    persist.mockResolvedValue(undefined)
    await tracker.flush()
    expect(persist).toHaveBeenLastCalledWith('2026-07-12', 2)
  })

  it('超过 300 秒应该切块，中间失败不重发已成功块', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const persist = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValue(undefined)
    const tracker = createListeningTracker({ persist, flushThresholdSeconds: 999 })
    const start = localMs(2026, 7, 12, 10, 0)

    tracker.observe('a', 0, start)
    tracker.observe('a', 650, start + 650_000)
    await tracker.flush()
    expect(persist.mock.calls).toEqual([
      ['2026-07-12', 300],
      ['2026-07-12', 300],
    ])

    await tracker.flush()
    expect(persist.mock.calls.slice(2)).toEqual([
      ['2026-07-12', 300],
      ['2026-07-12', 50],
    ])
    expect(errorSpy).toHaveBeenCalled()
  })

  it('reset 只重置样本，discard 同时丢弃 pending', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const tracker = createListeningTracker({ persist })
    const start = localMs(2026, 7, 12, 10, 0)

    tracker.observe('a', 0, start)
    tracker.observe('a', 5, start + 5000)
    tracker.resetSample()
    tracker.observe('a', 100, start + 10_000)
    tracker.observe('a', 102, start + 12_000)
    tracker.discard()
    await tracker.flush()

    expect(persist).not.toHaveBeenCalled()
  })
})
