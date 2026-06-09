// =============================================================================
// QinPlayer — 新建歌单弹窗
// =============================================================================
// 职责：输入歌单名称，确认创建
// =============================================================================

import { useState, useRef, useEffect } from 'react'

interface CreatePlaylistDialogProps {
  onConfirm: (name: string) => void
  onCancel: () => void
}

function CreatePlaylistDialog({ onConfirm, onCancel }: CreatePlaylistDialogProps) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 自动聚焦输入框
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 确认创建
  const handleConfirm = () => {
    const trimmed = name.trim()
    if (trimmed) {
      onConfirm(trimmed)
    }
  }

  // 回车确认
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog__title">新建歌单</h3>
        <input
          ref={inputRef}
          className="dialog__input"
          type="text"
          placeholder="输入歌单名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="dialog__actions">
          <button className="dialog__btn dialog__btn--cancel" onClick={onCancel}>
            取消
          </button>
          <button
            className="dialog__btn dialog__btn--confirm"
            onClick={handleConfirm}
            disabled={!name.trim()}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreatePlaylistDialog
