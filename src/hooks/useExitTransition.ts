import { useCallback, useEffect, useRef, useState, type AnimationEvent } from 'react'

import { isReducedMotionActive } from '../utils/motionPreference'

export function useExitTransition(onExited: () => void, fallbackMs: number) {
  const [isExiting, setIsExiting] = useState(false)
  const exitingRef = useRef(false)
  const completedRef = useRef(false)
  const mountedRef = useRef(true)
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onExitedRef = useRef(onExited)
  onExitedRef.current = onExited

  const completeExit = useCallback(() => {
    if (completedRef.current || !mountedRef.current) return
    completedRef.current = true
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current)
      fallbackRef.current = null
    }
    onExitedRef.current()
  }, [])

  const requestExit = useCallback(() => {
    if (exitingRef.current || completedRef.current) return
    exitingRef.current = true
    setIsExiting(true)

    if (isReducedMotionActive()) {
      queueMicrotask(completeExit)
      return
    }

    fallbackRef.current = setTimeout(completeExit, fallbackMs)
  }, [completeExit, fallbackMs])

  const handleAnimationEnd = useCallback((event: AnimationEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || !exitingRef.current) return
    completeExit()
  }, [completeExit])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (fallbackRef.current) clearTimeout(fallbackRef.current)
    }
  }, [])

  return { isExiting, requestExit, handleAnimationEnd }
}
