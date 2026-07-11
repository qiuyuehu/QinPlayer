import { useCallback, useEffect, useRef } from 'react'

interface DocumentMouseDragHandlers {
  onMove: (event: MouseEvent) => void
  onEnd: (event: MouseEvent) => void
}

interface ActiveDocumentMouseDrag {
  move: (event: MouseEvent) => void
  up: (event: MouseEvent) => void
}

export function useDocumentMouseDrag() {
  const activeDragRef = useRef<ActiveDocumentMouseDrag | null>(null)

  const cancelDocumentMouseDrag = useCallback(() => {
    const activeDrag = activeDragRef.current
    if (!activeDrag) return

    document.removeEventListener('mousemove', activeDrag.move)
    document.removeEventListener('mouseup', activeDrag.up)
    activeDragRef.current = null
  }, [])

  const startDocumentMouseDrag = useCallback((handlers: DocumentMouseDragHandlers) => {
    cancelDocumentMouseDrag()

    const move = (event: MouseEvent) => handlers.onMove(event)
    const up = (event: MouseEvent) => {
      // ★ 业务结束回调可能抛错，必须先完成全局 listener 清理。
      cancelDocumentMouseDrag()
      handlers.onEnd(event)
    }

    activeDragRef.current = { move, up }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [cancelDocumentMouseDrag])

  useEffect(() => cancelDocumentMouseDrag, [cancelDocumentMouseDrag])

  return { startDocumentMouseDrag, cancelDocumentMouseDrag }
}
