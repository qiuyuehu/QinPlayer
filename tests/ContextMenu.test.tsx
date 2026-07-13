import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ContextMenu from '../src/components/ContextMenu'

function renderMenu(onClose = vi.fn()) {
  render(<ContextMenu items={[{ label: '播放' }]} x={24} y={24} onClose={onClose} />)
  return onClose
}

function dispatchContextMenu({ prevented }: { prevented: boolean }) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  if (prevented) event.preventDefault()
  document.body.dispatchEvent(event)
}

describe('ContextMenu listener lifecycle', () => {
  const addSpy = vi.spyOn(document, 'addEventListener')
  const removeSpy = vi.spyOn(document, 'removeEventListener')

  beforeEach(() => {
    vi.useFakeTimers()
    addSpy.mockClear()
    removeSpy.mockClear()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('timeout 执行后卸载应成对移除 click 和 contextmenu listener', () => {
    const view = render(<ContextMenu items={[]} x={0} y={0} onClose={vi.fn()} />)
    act(() => vi.runOnlyPendingTimers())

    expect(addSpy.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1)
    expect(addSpy.mock.calls.filter(([type]) => type === 'contextmenu')).toHaveLength(1)

    view.unmount()
    expect(removeSpy.mock.calls.filter(([type]) => type === 'click')).toHaveLength(1)
    expect(removeSpy.mock.calls.filter(([type]) => type === 'contextmenu')).toHaveLength(1)
  })

  it('timeout 执行前卸载，之后推进 timers 不得新增 listener', () => {
    const view = render(<ContextMenu items={[]} x={0} y={0} onClose={vi.fn()} />)

    view.unmount()
    act(() => vi.runOnlyPendingTimers())

    expect(addSpy.mock.calls.filter(([type]) => type === 'click')).toHaveLength(0)
    expect(addSpy.mock.calls.filter(([type]) => type === 'contextmenu')).toHaveLength(0)
  })

  it('连续挂载卸载 50 次后不应残留 listener 或 timer', () => {
    for (let index = 0; index < 50; index++) {
      const view = render(<ContextMenu items={[]} x={0} y={0} onClose={vi.fn()} />)
      if (index % 2 === 0) act(() => vi.runOnlyPendingTimers())
      view.unmount()
    }
    act(() => vi.runOnlyPendingTimers())

    expect(addSpy.mock.calls.filter(([type]) => type === 'click')).toHaveLength(25)
    expect(addSpy.mock.calls.filter(([type]) => type === 'contextmenu')).toHaveLength(25)
    expect(removeSpy.mock.calls.filter(([type]) => type === 'click')).toHaveLength(50)
    expect(removeSpy.mock.calls.filter(([type]) => type === 'contextmenu')).toHaveLength(50)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('ContextMenu outside contextmenu handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('不会被已经由触发源消费的右键事件立即关闭', () => {
    const onClose = renderMenu()

    act(() => vi.runAllTimers())
    dispatchContextMenu({ prevented: true })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('会由菜单外新的未消费右键事件关闭', () => {
    const onClose = renderMenu()

    act(() => vi.runAllTimers())
    dispatchContextMenu({ prevented: false })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
