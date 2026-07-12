import { useCallback, useEffect, useRef, useState } from 'react'
import type { CloseDecision, CloseResponse } from '../types/ipc'

interface CloseConfirmDialogProps {
  requestId: string
  onRespond: (response: CloseResponse) => void
}

function CloseConfirmDialog({ requestId, onRespond }: CloseConfirmDialogProps) {
  const [remember, setRemember] = useState(false)
  const respondedRef = useRef(false)

  const respond = useCallback((decision: CloseDecision) => {
    if (respondedRef.current) return
    respondedRef.current = true
    onRespond({ requestId, decision, remember: decision === 'cancel' ? false : remember })
  }, [onRespond, remember, requestId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      respond('cancel')
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [respond])

  return (
    <div className="dialog-overlay dialog-overlay--enter close-dialog-overlay">
      <section className="dialog dialog--enter close-dialog" role="dialog" aria-modal="true" aria-labelledby="close-dialog-title">
        <h2 id="close-dialog-title" className="close-dialog__title">关闭 QinPlayer</h2>
        <label className="close-dialog__remember">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <span>不再询问</span>
        </label>
        <div className="close-dialog__actions">
          <button type="button" className="close-dialog__button" onClick={() => respond('minimize')}>最小化到托盘</button>
          <button type="button" className="close-dialog__button close-dialog__button--danger" onClick={() => respond('exit')}>退出</button>
        </div>
      </section>
    </div>
  )
}

export default CloseConfirmDialog
