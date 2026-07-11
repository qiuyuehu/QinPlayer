import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDocumentMouseDrag } from '../src/hooks/useDocumentMouseDrag'

describe('useDocumentMouseDrag', () => {
  const addSpy = vi.spyOn(document, 'addEventListener')
  const removeSpy = vi.spyOn(document, 'removeEventListener')

  beforeEach(() => {
    addSpy.mockClear()
    removeSpy.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('start 应注册一组 mousemove 和 mouseup listener', () => {
    const { result } = renderHook(() => useDocumentMouseDrag())

    act(() => result.current.startDocumentMouseDrag({ onMove: vi.fn(), onEnd: vi.fn() }))

    expect(addSpy.mock.calls.filter(([type]) => type === 'mousemove')).toHaveLength(1)
    expect(addSpy.mock.calls.filter(([type]) => type === 'mouseup')).toHaveLength(1)
  })

  it('mouseup 应先清理 listener，再调用一次 onEnd', () => {
    const onEnd = vi.fn()
    const { result } = renderHook(() => useDocumentMouseDrag())
    act(() => result.current.startDocumentMouseDrag({ onMove: vi.fn(), onEnd }))

    act(() => document.dispatchEvent(new MouseEvent('mouseup')))

    expect(onEnd).toHaveBeenCalledTimes(1)
    const moveRemove = removeSpy.mock.calls.findIndex(([type]) => type === 'mousemove')
    const upRemove = removeSpy.mock.calls.findIndex(([type]) => type === 'mouseup')
    expect(removeSpy.mock.invocationCallOrder[moveRemove]).toBeLessThan(onEnd.mock.invocationCallOrder[0])
    expect(removeSpy.mock.invocationCallOrder[upRemove]).toBeLessThan(onEnd.mock.invocationCallOrder[0])
  })

  it('cancel 只清理 listener，不调用业务 onEnd', () => {
    const onEnd = vi.fn()
    const { result } = renderHook(() => useDocumentMouseDrag())
    act(() => result.current.startDocumentMouseDrag({ onMove: vi.fn(), onEnd }))

    act(() => result.current.cancelDocumentMouseDrag())

    expect(onEnd).not.toHaveBeenCalled()
    expect(removeSpy.mock.calls.filter(([type]) => type === 'mousemove')).toHaveLength(1)
    expect(removeSpy.mock.calls.filter(([type]) => type === 'mouseup')).toHaveLength(1)
  })

  it('再次 start 应先清理旧监听，旧 callback 不再执行', () => {
    const firstMove = vi.fn()
    const secondMove = vi.fn()
    const { result } = renderHook(() => useDocumentMouseDrag())
    act(() => result.current.startDocumentMouseDrag({ onMove: firstMove, onEnd: vi.fn() }))

    act(() => result.current.startDocumentMouseDrag({ onMove: secondMove, onEnd: vi.fn() }))
    act(() => document.dispatchEvent(new MouseEvent('mousemove')))

    expect(firstMove).not.toHaveBeenCalled()
    expect(secondMove).toHaveBeenCalledTimes(1)
    expect(removeSpy.mock.calls.filter(([type]) => type === 'mousemove')).toHaveLength(1)
  })

  it('unmount 应清理监听，后续事件不再调用旧 callback', () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const { result, unmount } = renderHook(() => useDocumentMouseDrag())
    act(() => result.current.startDocumentMouseDrag({ onMove, onEnd }))

    unmount()
    document.dispatchEvent(new MouseEvent('mousemove'))
    document.dispatchEvent(new MouseEvent('mouseup'))

    expect(onMove).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
    expect(removeSpy.mock.calls.filter(([type]) => type === 'mousemove')).toHaveLength(1)
    expect(removeSpy.mock.calls.filter(([type]) => type === 'mouseup')).toHaveLength(1)
  })

  it('连续 20 次重启拖拽后 listener 仍应成对清理', () => {
    const { result } = renderHook(() => useDocumentMouseDrag())

    act(() => {
      for (let index = 0; index < 20; index++) {
        result.current.startDocumentMouseDrag({ onMove: vi.fn(), onEnd: vi.fn() })
      }
      result.current.cancelDocumentMouseDrag()
    })

    expect(addSpy.mock.calls.filter(([type]) => type === 'mousemove')).toHaveLength(20)
    expect(addSpy.mock.calls.filter(([type]) => type === 'mouseup')).toHaveLength(20)
    expect(removeSpy.mock.calls.filter(([type]) => type === 'mousemove')).toHaveLength(20)
    expect(removeSpy.mock.calls.filter(([type]) => type === 'mouseup')).toHaveLength(20)
  })
})
