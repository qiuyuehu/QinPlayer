// =============================================================================
// QinPlayer — 通用右键菜单组件
// =============================================================================
// 职责：渲染上下文菜单，处理边界情况（靠近窗口边缘时向上弹出）
// 复用场景：歌曲列表、歌单列表等任何需要右键菜单的地方
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'

// 菜单项定义
export interface MenuItem {
  label: string
  icon?: string
  disabled?: boolean
  children?: MenuItem[]      // 子菜单
  action?: () => void        // 点击执行
}

interface ContextMenuProps {
  items: MenuItem[]
  x: number                  // 鼠标 X 坐标
  y: number                  // 鼠标 Y 坐标
  onClose: () => void
}

function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })
  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null)

  // 计算菜单位置（处理边界溢出）
  useEffect(() => {
    if (!menuRef.current) return

    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight

    let posX = x
    let posY = y

    // 右边溢出 → 向左弹出
    if (x + rect.width > windowWidth) {
      posX = windowWidth - rect.width - 8
    }

    // 底部溢出 → 向上弹出
    if (y + rect.height > windowHeight) {
      posY = y - rect.height
    }

    setPosition({ x: posX, y: posY })
  }, [x, y])

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    // 用 setTimeout 避免触发右键的 click 事件立即关闭菜单
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('contextmenu', handleClickOutside)
    }, 0)

    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('contextmenu', handleClickOutside)
    }
  }, [onClose])

  // ESC 关闭菜单
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 点击菜单项
  const handleItemClick = useCallback((item: MenuItem) => {
    if (item.disabled) return
    if (item.children) return  // 有子菜单，不执行 action
    item.action?.()
    onClose()
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className={`context-menu__item ${item.disabled ? 'context-menu__item--disabled' : ''}`}
          onClick={() => handleItemClick(item)}
          onMouseEnter={() => item.children ? setSubmenuIndex(index) : setSubmenuIndex(null)}
        >
          {item.icon && <span className="context-menu__icon">{item.icon}</span>}
          <span className="context-menu__label">{item.label}</span>
          {item.children && <span className="context-menu__arrow">›</span>}

          {/* 子菜单 */}
          {item.children && submenuIndex === index && (
            <div className="context-menu context-menu__submenu">
              {item.children.map((child, childIndex) => (
                <div
                  key={childIndex}
                  className={`context-menu__item ${child.disabled ? 'context-menu__item--disabled' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!child.disabled) {
                      child.action?.()
                      onClose()
                    }
                  }}
                >
                  {child.icon && <span className="context-menu__icon">{child.icon}</span>}
                  <span className="context-menu__label">{child.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default ContextMenu
