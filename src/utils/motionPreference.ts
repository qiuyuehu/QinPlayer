const REDUCED_MOTION_ATTRIBUTE = 'data-reduced-motion'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function applyReducedMotionAttribute(enabled: boolean): void {
  if (typeof document === 'undefined') return

  if (enabled) {
    document.documentElement.setAttribute(REDUCED_MOTION_ATTRIBUTE, 'true')
  } else {
    document.documentElement.removeAttribute(REDUCED_MOTION_ATTRIBUTE)
  }
}

export function isReducedMotionActive(): boolean {
  if (
    typeof document !== 'undefined'
    && document.documentElement.getAttribute(REDUCED_MOTION_ATTRIBUTE) === 'true'
  ) {
    return true
  }

  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_QUERY).matches
}
