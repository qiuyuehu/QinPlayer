import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useReducedMotion } from '../src/hooks/useReducedMotion'
import { useUIStore } from '../src/stores/uiStore'

function Harness(): null {
  useReducedMotion()
  return null
}

describe('useReducedMotion', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-reduced-motion')
    useUIStore.setState({ reducedMotion: false })
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-reduced-motion')
    useUIStore.setState({ reducedMotion: false })
  })

  it('applies and removes the root attribute when store state changes', () => {
    const { unmount } = render(<Harness />)
    expect(document.documentElement).not.toHaveAttribute('data-reduced-motion')

    act(() => useUIStore.getState().setReducedMotion(true))
    expect(document.documentElement).toHaveAttribute('data-reduced-motion', 'true')

    act(() => useUIStore.getState().setReducedMotion(false))
    expect(document.documentElement).not.toHaveAttribute('data-reduced-motion')

    act(() => useUIStore.getState().setReducedMotion(true))
    unmount()
    expect(document.documentElement).toHaveAttribute('data-reduced-motion', 'true')
  })
})
