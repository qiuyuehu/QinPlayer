import { useEffect, useRef } from 'react'

export function useRafLoop(active: boolean, onFrame: FrameRequestCallback): void {
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  useEffect(() => {
    if (!active) return

    let cancelled = false
    let rafId = 0

    const tick: FrameRequestCallback = (time) => {
      if (cancelled) return
      onFrameRef.current(time)
      if (!cancelled) rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [active])
}
