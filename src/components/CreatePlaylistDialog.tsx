// =============================================================================
// QinPlayer — 新建歌单弹窗
// =============================================================================
// 职责：输入歌单名称，确认创建
// =============================================================================

import { useState, useRef, useEffect } from 'react'
import { useExitTransition } from '../hooks/useExitTransition'

interface CreatePlaylistDialogProps {
  onConfirm: (name: string) => Promise<void>
  onCancel: () => void
}

// CreatePlaylistDialog — 新建歌单弹窗，输入名称 + 确认/取消
function CreatePlaylistDialog({ onConfirm, onCancel }: CreatePlaylistDialogProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { isExiting, requestExit, handleAnimationEnd } = useExitTransition(onCancel, 220)

  // 自动聚焦输入框
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 确认创建
  const handleConfirm = async () => {
    const trimmed = name.trim()
    if (!trimmed || submittingRef.current || isExiting) return

    submittingRef.current = true
    setSubmitting(true)
    try {
      await onConfirm(trimmed)
      requestExit()
    } catch {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  // 回车确认
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    }
  }

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submittingRef.current) requestExit()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [requestExit])

  return (
    <div
      className={`dialog-overlay ${isExiting ? 'dialog-overlay--exit' : 'dialog-overlay--enter'}`}
      onClick={() => { if (!submitting) requestExit() }}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className={`dialog ${isExiting ? 'dialog--exit' : 'dialog--enter'}`} onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog__title">新建歌单</h3>
        <input
          ref={inputRef}
          className="dialog__input"
          type="text"
          placeholder="输入歌单名称"
          value={name}
          disabled={submitting}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="dialog__actions">
          <button className="dialog__btn dialog__btn--cancel" onClick={requestExit} disabled={submitting}>
            取消
          </button>
          <button
            className="dialog__btn dialog__btn--confirm"
            onClick={handleConfirm}
            disabled={!name.trim() || submitting}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreatePlaylistDialog
