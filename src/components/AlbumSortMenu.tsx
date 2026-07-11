// =============================================================================
// QinPlayer — 专辑排序菜单
// =============================================================================
// 职责：以受控单选菜单切换专辑网格的排序字段和方向
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { IconChevronDown } from './Icons'
import type { AlbumSortBy } from '../utils/albumSort'
import type { SortOrder } from '../types'

export interface AlbumSortMenuProps {
  sortBy: AlbumSortBy
  sortOrder: SortOrder
  onSortByChange: (value: AlbumSortBy) => void
  onSortOrderChange: (value: SortOrder) => void
}

interface MenuOption {
  key: string
  label: string
  checked: boolean
  select: () => void
}

const MENU_ID = 'album-sort-menu-popup'

function AlbumSortMenu({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
}: AlbumSortMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const fieldLabel = sortBy === 'name' ? '专辑名' : '歌手'
  const orderLabel = sortOrder === 'asc' ? '升序' : '降序'

  const restoreTriggerFocus = useCallback(() => {
    queueMicrotask(() => triggerRef.current?.focus())
  }, [])

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setIsOpen(false)
    if (restoreFocus) restoreTriggerFocus()
  }, [restoreTriggerFocus])

  useEffect(() => {
    if (!isOpen) return

    const fieldIndex = sortBy === 'name' ? 0 : 1
    queueMicrotask(() => itemRefs.current[fieldIndex]?.focus())
  }, [isOpen, sortBy])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeMenu(true)
    }
    const handleFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocusIn)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [closeMenu, isOpen])

  const selectSortBy = useCallback((value: AlbumSortBy) => {
    onSortByChange(value)
    closeMenu(true)
  }, [closeMenu, onSortByChange])

  const selectSortOrder = useCallback((value: SortOrder) => {
    onSortOrderChange(value)
    closeMenu(true)
  }, [closeMenu, onSortOrderChange])

  const fieldOptions: MenuOption[] = [
    {
      key: 'name',
      label: '专辑名',
      checked: sortBy === 'name',
      select: () => selectSortBy('name'),
    },
    {
      key: 'artist',
      label: '歌手',
      checked: sortBy === 'artist',
      select: () => selectSortBy('artist'),
    },
  ]
  const orderOptions: MenuOption[] = [
    {
      key: 'asc',
      label: '升序',
      checked: sortOrder === 'asc',
      select: () => selectSortOrder('asc'),
    },
    {
      key: 'desc',
      label: '降序',
      checked: sortOrder === 'desc',
      select: () => selectSortOrder('desc'),
    },
  ]
  const allOptions = [...fieldOptions, ...orderOptions]

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    setIsOpen(true)
  }

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') return

    const currentIndex = itemRefs.current.findIndex((item) => item === document.activeElement)
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1 + allOptions.length) % allOptions.length
    } else if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + allOptions.length) % allOptions.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = allOptions.length - 1
    }

    if (nextIndex === null) return
    event.preventDefault()
    itemRefs.current[nextIndex]?.focus()
  }

  const renderOption = (option: MenuOption, index: number) => (
    <button
      key={option.key}
      ref={(element) => { itemRefs.current[index] = element }}
      type="button"
      role="menuitemradio"
      aria-checked={option.checked}
      className={`album-sort-menu__item ${option.checked ? 'album-sort-menu__item--checked' : ''}`}
      tabIndex={-1}
      onClick={option.select}
    >
      <span className="album-sort-menu__check" aria-hidden="true">
        {option.checked ? '●' : ''}
      </span>
      <span className="album-sort-menu__label">{option.label}</span>
    </button>
  )

  return (
    <div className="album-sort-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="album-sort-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={MENU_ID}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="album-sort-menu__summary">
          排序：{fieldLabel} · {orderLabel}
        </span>
        <IconChevronDown
          width={14}
          height={14}
          className={`album-sort-menu__chevron ${isOpen ? 'album-sort-menu__chevron--open' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          id={MENU_ID}
          className="album-sort-menu__popup"
          role="menu"
          aria-label="专辑排序"
          onKeyDown={handleMenuKeyDown}
        >
          <div role="group" aria-label="排序字段">
            {fieldOptions.map((option, index) => renderOption(option, index))}
          </div>
          <div className="album-sort-menu__separator" role="separator" />
          <div role="group" aria-label="排序方向">
            {orderOptions.map((option, index) => renderOption(option, index + fieldOptions.length))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AlbumSortMenu
