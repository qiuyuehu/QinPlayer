import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { IconChevronDown } from './Icons'
import type { SortOrder } from '../types'

export interface SortField<T extends string> {
  value: T
  label: string
}

export interface SortMenuProps<T extends string> {
  fields: readonly SortField<T>[]
  sortBy: T
  sortOrder: SortOrder
  ariaLabel: string
  onSortByChange: (value: T) => void
  onSortOrderChange: (value: SortOrder) => void
}

interface MenuOption {
  key: string
  label: string
  checked: boolean
  select: () => void
}

function SortMenu<T extends string>({
  fields,
  sortBy,
  sortOrder,
  ariaLabel,
  onSortByChange,
  onSortOrderChange,
}: SortMenuProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const popupId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedField = fields.find((field) => field.value === sortBy) ?? fields[0]
  const fieldLabel = selectedField?.label ?? ''
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
    const currentIndex = fields.findIndex((field) => field.value === sortBy)
    queueMicrotask(() => itemRefs.current[Math.max(0, currentIndex)]?.focus())
  }, [fields, isOpen, sortBy])

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

  const selectSortBy = useCallback((value: T) => {
    onSortByChange(value)
    closeMenu(true)
  }, [closeMenu, onSortByChange])

  const selectSortOrder = useCallback((value: SortOrder) => {
    onSortOrderChange(value)
    closeMenu(true)
  }, [closeMenu, onSortOrderChange])

  const fieldOptions: MenuOption[] = fields.map((field) => ({
    key: field.value,
    label: field.label,
    checked: sortBy === field.value,
    select: () => selectSortBy(field.value),
  }))
  const orderOptions: MenuOption[] = [
    { key: 'asc', label: '升序', checked: sortOrder === 'asc', select: () => selectSortOrder('asc') },
    { key: 'desc', label: '降序', checked: sortOrder === 'desc', select: () => selectSortOrder('desc') },
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
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1 + allOptions.length) % allOptions.length
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + allOptions.length) % allOptions.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = allOptions.length - 1
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
      className={`sort-menu__item ${option.checked ? 'sort-menu__item--checked' : ''}`}
      tabIndex={-1}
      onClick={option.select}
    >
      <span className="sort-menu__check" aria-hidden="true">{option.checked ? '●' : ''}</span>
      <span className="sort-menu__label">{option.label}</span>
    </button>
  )

  return (
    <div className="sort-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="sort-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={popupId}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="sort-menu__summary">{fieldLabel} · {orderLabel}</span>
        <IconChevronDown width={14} height={14} className={`sort-menu__chevron ${isOpen ? 'sort-menu__chevron--open' : ''}`} />
      </button>

      {isOpen && (
        <div id={popupId} className="sort-menu__popup" role="menu" aria-label={ariaLabel} onKeyDown={handleMenuKeyDown}>
          <div role="group" aria-label="排序字段">
            {fieldOptions.map((option, index) => renderOption(option, index))}
          </div>
          <div className="sort-menu__separator" role="separator" />
          <div role="group" aria-label="排序方向">
            {orderOptions.map((option, index) => renderOption(option, index + fieldOptions.length))}
          </div>
        </div>
      )}
    </div>
  )
}

export default SortMenu
