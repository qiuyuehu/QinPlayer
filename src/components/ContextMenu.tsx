// =============================================================================
// QinPlayer — 通用右键菜单组件
// =============================================================================
// 职责：渲染上下文菜单，处理边界情况（靠近窗口边缘时向上弹出）
// 复用场景：歌曲列表、歌单列表等任何需要右键菜单的地方
// 设计要点：
//   - 边界检测：菜单靠近窗口边缘时自动调整位置（右溢出→左弹，底溢出→上弹）
//   - 子菜单：hover 展开，通过 submenuIndex 状态控制显隐
//   - 关闭机制：点击外部 / ESC 键 / 执行操作后自动关闭
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'

// ---------------------------------------------------------------------------
// 菜单项定义
// ---------------------------------------------------------------------------
// 支持嵌套子菜单：children 有值时显示展开箭头，hover 时渲染子菜单
// disabled 项点击无效且样式变灰

export interface MenuItem {
  label: string
  icon?: React.ReactNode       // 菜单项图标（支持 SVG 组件或字符）
  disabled?: boolean       // 禁用状态，点击无效且样式变灰
  children?: MenuItem[]    // 子菜单数据，有值时显示展开箭头
  action?: () => void      // 点击菜单项执行的回调
}

interface ContextMenuProps {
  items: MenuItem[]
  x: number                // 鼠标 X 坐标（相对于视口）
  y: number                // 鼠标 Y 坐标（相对于视口）
  onClose: () => void
}

// ContextMenu — 通用右键菜单，支持子菜单 + 边界溢出自动调整
function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  // ref 用于读取菜单实际渲染尺寸，计算边界溢出
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })          // 经过边界修正后的实际定位
  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null) // 当前展开的子菜单索引

  // ---------------------------------------------------------------------------
  // 计算菜单位置（处理边界溢出）
  // ---------------------------------------------------------------------------
  // 菜单渲染后立即检测是否超出窗口，超出则自动调整位置
  useEffect(() => {
    if (!menuRef.current) return

    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()  // 获取菜单实际渲染尺寸（含 padding/border）
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight

    let posX = x
    let posY = y

    // 右边溢出 → 向左弹出，留 8px 边距避免贴边
    if (x + rect.width > windowWidth) {
      posX = windowWidth - rect.width - 8
    }

    // 底部溢出 → 向上弹出，菜单从鼠标位置向上展开
    if (y + rect.height > windowHeight) {
      posY = y - rect.height
    }

    setPosition({ x: posX, y: posY })
  }, [x, y])

  // ---------------------------------------------------------------------------
  // 点击外部关闭菜单
  // ---------------------------------------------------------------------------
  // 监听全局 click 和 contextmenu 事件，点击菜单外任意位置关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // contains 判断点击目标是否在菜单内部，不在则关闭
        onClose()
      }
    }

    // 用 setTimeout(0) 延迟到下一个事件循环，避免当前右键事件的 click 冒泡立即关闭菜单
    const listenerTimer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('contextmenu', handleClickOutside)
    }, 0)

    // cleanup：组件卸载时移除全局事件监听，防止内存泄漏
    return () => {
      clearTimeout(listenerTimer)
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('contextmenu', handleClickOutside)
    }
  }, [onClose])

  // ---------------------------------------------------------------------------
  // ESC 关闭菜单
  // ---------------------------------------------------------------------------
  // 标准 UX：按 Escape 键关闭弹出层
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()  // ESC 键关闭
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // ---------------------------------------------------------------------------
  // 点击菜单项
  // ---------------------------------------------------------------------------
  // 禁用项不响应，有子菜单的项不执行 action（由子菜单处理）
  const handleItemClick = useCallback((item: MenuItem) => {
    if (item.disabled) return              // 禁用项直接忽略
    if (item.children) return              // 有子菜单的项：hover 展开，点击不关闭父菜单
    item.action?.()
    onClose()                              // 执行操作后关闭菜单
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: position.x, top: position.y }}  // 使用修正后的坐标定位
    >
      {items.map((item, index) => (
        <div
          key={index}
          className={`context-menu__item ${item.disabled ? 'context-menu__item--disabled' : ''}`} // 禁用项添加灰色样式
          onClick={() => handleItemClick(item)}
          onMouseEnter={() => item.children ? setSubmenuIndex(index) : setSubmenuIndex(null)} // hover 时展开对应子菜单
        >
          {item.icon && <span className="context-menu__icon">{item.icon}</span>}
          <span className="context-menu__label">{item.label}</span>
          {item.children && <span className="context-menu__arrow">›</span>}  {/* 有子菜单时显示右箭头 */}

          {/* 子菜单 —— 只在 hover 到对应父项时渲染，通过 submenuIndex 控制显隐 */}
          {item.children && submenuIndex === index && (
            <div className="context-menu context-menu__submenu">
              {item.children.map((child, childIndex) => (
                <div
                  key={childIndex}
                  className={`context-menu__item ${child.disabled ? 'context-menu__item--disabled' : ''}`} // 子菜单项同样支持禁用
                  onClick={(e) => {
                    e.stopPropagation()   // 阻止冒泡到父菜单，防止父菜单的 onClick 也触发
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
