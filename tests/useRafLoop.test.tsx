import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useRafLoop } from '../src/hooks/useRafLoop'

describe('useRafLoop', () => {
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextId = 0
  const requestRaf = vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextId
    callbacks.set(id, callback)
    return id
  })
  const cancelRaf = vi.fn((id: number) => callbacks.delete(id))
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

  beforeEach(() => {
    callbacks.clear()
    nextId = 0
    requestRaf.mockClear()
    cancelRaf.mockClear()
    globalThis.requestAnimationFrame = requestRaf
    globalThis.cancelAnimationFrame = cancelRaf
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
  })

  function runFrame(id: number, time = 16): void {
    const callback = callbacks.get(id)
    callbacks.delete(id)
    act(() => callback?.(time))
  }

  it('active=false 时不注册 RAF', () => {
    renderHook(() => useRafLoop(false, vi.fn()))
    expect(requestRaf).not.toHaveBeenCalled()
  })

  it('active=true 时逐帧调用并保持单条循环', () => {
    const onFrame = vi.fn()
    renderHook(() => useRafLoop(true, onFrame))
    expect([...callbacks.keys()]).toEqual([1])

    runFrame(1, 25)
    expect(onFrame).toHaveBeenCalledWith(25)
    expect([...callbacks.keys()]).toEqual([2])
  })

  it('true→false 应 cancel，旧 callback 被手动触发也不能重排', () => {
    const onFrame = vi.fn()
    const view = renderHook(({ active }) => useRafLoop(active, onFrame), {
      initialProps: { active: true },
    })
    const staleCallback = callbacks.get(1)

    view.rerender({ active: false })
    expect(cancelRaf).toHaveBeenCalledWith(1)
    act(() => staleCallback?.(30))

    expect(onFrame).not.toHaveBeenCalled()
    expect(requestRaf).toHaveBeenCalledTimes(1)
  })

  it('false→true 恢复时应创建新循环', () => {
    const view = renderHook(({ active }) => useRafLoop(active, vi.fn()), {
      initialProps: { active: false },
    })
    view.rerender({ active: true })
    expect([...callbacks.keys()]).toEqual([1])

    view.rerender({ active: false })
    view.rerender({ active: true })
    expect([...callbacks.keys()]).toEqual([2])
  })

  it('onFrame 变化时使用最新引用且不创建并行循环', () => {
    const first = vi.fn()
    const second = vi.fn()
    const view = renderHook(({ onFrame }) => useRafLoop(true, onFrame), {
      initialProps: { onFrame: first },
    })

    view.rerender({ onFrame: second })
    expect(requestRaf).toHaveBeenCalledTimes(1)
    runFrame(1)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect([...callbacks.keys()]).toEqual([2])
  })

  it('unmount 应 cancel 且旧 callback 不能重排', () => {
    const onFrame = vi.fn()
    const view = renderHook(() => useRafLoop(true, onFrame))
    const staleCallback = callbacks.get(1)

    view.unmount()
    act(() => staleCallback?.(40))

    expect(cancelRaf).toHaveBeenCalledWith(1)
    expect(onFrame).not.toHaveBeenCalled()
    expect(requestRaf).toHaveBeenCalledTimes(1)
  })

  it('连续启停 50 次后最多保留一条循环且最终为零', () => {
    const view = renderHook(({ active }) => useRafLoop(active, vi.fn()), {
      initialProps: { active: false },
    })

    for (let index = 0; index < 50; index++) {
      view.rerender({ active: true })
      expect(callbacks.size).toBe(1)
      view.rerender({ active: false })
      expect(callbacks.size).toBe(0)
    }

    expect(requestRaf).toHaveBeenCalledTimes(50)
    expect(cancelRaf).toHaveBeenCalledTimes(50)
  })
})
