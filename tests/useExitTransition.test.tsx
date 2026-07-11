import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'

import { useExitTransition } from '../src/hooks/useExitTransition'

type ExitControls = ReturnType<typeof useExitTransition>
let controls: ExitControls

function Harness({ onExited, fallbackMs = 200 }: { onExited: () => void; fallbackMs?: number }) {
  controls = useExitTransition(onExited, fallbackMs)
  return (
    <div data-testid="root" onAnimationEnd={controls.handleAnimationEnd}>
      <span data-testid="child" />
    </div>
  )
}

describe('useExitTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.documentElement.removeAttribute('data-reduced-motion')
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.documentElement.removeAttribute('data-reduced-motion')
  })

  it('marks exiting without completing immediately in normal mode', () => {
    const onExited = vi.fn()
    render(<Harness onExited={onExited} />)
    act(() => controls.requestExit())
    expect(controls.isExiting).toBe(true)
    expect(onExited).not.toHaveBeenCalled()
  })

  it('completes once when the root animation ends', () => {
    const onExited = vi.fn()
    const { getByTestId } = render(<Harness onExited={onExited} />)
    act(() => controls.requestExit())
    fireEvent.animationEnd(getByTestId('root'))
    fireEvent.animationEnd(getByTestId('root'))
    act(() => controls.requestExit())
    expect(onExited).toHaveBeenCalledTimes(1)
  })

  it('ignores bubbled animationend events from children', () => {
    const onExited = vi.fn()
    const { getByTestId } = render(<Harness onExited={onExited} />)
    act(() => controls.requestExit())
    fireEvent.animationEnd(getByTestId('child'))
    expect(onExited).not.toHaveBeenCalled()
  })

  it('uses the fallback when animationend is lost', () => {
    const onExited = vi.fn()
    render(<Harness onExited={onExited} fallbackMs={150} />)
    act(() => controls.requestExit())
    act(() => vi.advanceTimersByTime(149))
    expect(onExited).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onExited).toHaveBeenCalledTimes(1)
  })

  it('completes reduced motion in a microtask without a timer', async () => {
    document.documentElement.setAttribute('data-reduced-motion', 'true')
    const onExited = vi.fn()
    render(<Harness onExited={onExited} />)
    act(() => controls.requestExit())
    expect(onExited).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => Promise.resolve())
    expect(onExited).toHaveBeenCalledTimes(1)
  })

  it('clears the fallback when unmounted', () => {
    const onExited = vi.fn()
    const { unmount } = render(<Harness onExited={onExited} fallbackMs={150} />)
    act(() => controls.requestExit())
    unmount()
    act(() => vi.advanceTimersByTime(150))
    expect(onExited).not.toHaveBeenCalled()
  })

  it('still completes after StrictMode effect replay', () => {
    const onExited = vi.fn()
    const { getByTestId } = render(
      <StrictMode>
        <Harness onExited={onExited} />
      </StrictMode>,
    )

    act(() => controls.requestExit())
    fireEvent.animationEnd(getByTestId('root'))

    expect(onExited).toHaveBeenCalledTimes(1)
  })
})
