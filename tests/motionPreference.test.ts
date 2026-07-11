import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyReducedMotionAttribute,
  isReducedMotionActive,
} from '../src/utils/motionPreference'

const REDUCED_MOTION_ATTRIBUTE = 'data-reduced-motion'
const originalMatchMedia = window.matchMedia
const originalReducedMotionAttribute = document.documentElement.getAttribute(
  REDUCED_MOTION_ATTRIBUTE,
)

function setMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  })
}

describe('motionPreference', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(REDUCED_MOTION_ATTRIBUTE)
    setMatchMedia(false)
  })

  afterEach(() => {
    if (originalReducedMotionAttribute === null) {
      document.documentElement.removeAttribute(REDUCED_MOTION_ATTRIBUTE)
    } else {
      document.documentElement.setAttribute(
        REDUCED_MOTION_ATTRIBUTE,
        originalReducedMotionAttribute,
      )
    }

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    })
    vi.restoreAllMocks()
  })

  it('sets the reduced-motion attribute when enabled', () => {
    applyReducedMotionAttribute(true)

    expect(document.documentElement).toHaveAttribute(REDUCED_MOTION_ATTRIBUTE, 'true')
  })

  it('removes the reduced-motion attribute when disabled', () => {
    document.documentElement.setAttribute(REDUCED_MOTION_ATTRIBUTE, 'true')

    applyReducedMotionAttribute(false)

    expect(document.documentElement).not.toHaveAttribute(REDUCED_MOTION_ATTRIBUTE)
  })

  it('treats the manual preference as active', () => {
    applyReducedMotionAttribute(true)

    expect(isReducedMotionActive()).toBe(true)
  })

  it('uses the system preference when there is no manual preference', () => {
    setMatchMedia(true)

    expect(isReducedMotionActive()).toBe(true)
  })

  it('returns false when manual and system preferences are both disabled', () => {
    expect(isReducedMotionActive()).toBe(false)
  })

  it('works without matchMedia', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: undefined,
    })

    expect(() => isReducedMotionActive()).not.toThrow()
    expect(isReducedMotionActive()).toBe(false)

    applyReducedMotionAttribute(true)
    expect(isReducedMotionActive()).toBe(true)
  })
})
