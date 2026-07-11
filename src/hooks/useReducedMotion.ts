import { useLayoutEffect } from 'react'

import { useUIStore } from '../stores/uiStore'
import { applyReducedMotionAttribute } from '../utils/motionPreference'

export function useReducedMotion(): void {
  const reducedMotion = useUIStore((state) => state.reducedMotion)

  useLayoutEffect(() => {
    applyReducedMotionAttribute(reducedMotion)
  }, [reducedMotion])
}
