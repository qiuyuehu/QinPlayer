// =============================================================================
// QinPlayer — Mini 主题歌曲菜单
// =============================================================================
// 职责：渲染主进程提供的受限菜单项，并将选择结果回传给专用 preload
// =============================================================================

import { useEffect } from 'react'
import type { NativeTrackMenuAction, NativeTrackMenuDisplayEntry } from '../types/ipc'

interface MiniContextMenuProps {
  entries: NativeTrackMenuDisplayEntry[]
  onResolve: (action: NativeTrackMenuAction | null) => void
}

function MiniContextMenu({ entries, onResolve }: MiniContextMenuProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onResolve(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onResolve])

  return (
    <div className="mini-context-menu-shell">
      <div className="context-menu mini-context-menu" role="menu" aria-label="歌曲菜单">
        {entries.map((entry) => (
          <button
            key={entry.action}
            type="button"
            className={`context-menu__item ${entry.enabled ? '' : 'context-menu__item--disabled'}`}
            role="menuitem"
            disabled={!entry.enabled}
            onClick={() => onResolve(entry.action)}
          >
            <span className="context-menu__label">{entry.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default MiniContextMenu
