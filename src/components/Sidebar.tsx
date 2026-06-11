// =============================================================================
// QinPlayer — 左侧导航栏
// =============================================================================
// 职责：搜索框 + 导航项列表，点击切换右侧内容区
// 样式：固定宽度 ~220px，Apple Music 风格
// =============================================================================

import { useState, useCallback, useRef, useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { IconClock, IconMusic, IconDisc, IconList, IconStar, IconGear } from './Icons'

// 导航项定义（使用 SVG 图标组件，统一扁平 stroke 风格）
const NAV_ITEMS = [
  { id: 'recent',      label: '最近播放', Icon: IconClock },
  { id: 'local',       label: '本地音乐', Icon: IconMusic },
  { id: 'albums',      label: '专辑',     Icon: IconDisc },
  { id: 'playlists',   label: '歌单',     Icon: IconList },
  { id: 'liked',       label: '我喜欢的', Icon: IconStar },
  { id: 'settings',    label: '设置',     Icon: IconGear },
]

// Sidebar — 左侧导航栏，切换页面（最近/本地/专辑/歌单/喜欢/设置）
function Sidebar() {
  // 当前选中的导航项
  const activeNav = useUIStore((state) => state.activeNav)
  const setActiveNav = useUIStore((state) => state.setActiveNav)
  const setSearchQuery = useUIStore((state) => state.setSearchQuery)

  // 搜索框本地状态（防抖用，不直接写 store）
  const [inputValue, setInputValue] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 上次非搜索页面的导航项（搜索结束后恢复）
  const prevNavRef = useRef(activeNav)

  // 输入变化时防抖更新搜索
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)

    // 清除上次防抖
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    if (value.trim()) {
      // 有输入 → 自动切到搜索页面
      if (activeNav !== 'search') {
        prevNavRef.current = activeNav
      }
      setActiveNav('search')

      // 防抖 300ms 后更新搜索关键词
      debounceTimer.current = setTimeout(() => {
        setSearchQuery(value.trim())
      }, 300)
    } else {
      // 清空 → 恢复之前的页面
      setSearchQuery('')
      if (activeNav === 'search') {
        setActiveNav(prevNavRef.current)
      }
    }
  }, [activeNav, setActiveNav, setSearchQuery])

  // 点击导航项时，清空搜索框
  const handleNavClick = useCallback((id: string) => {
    setInputValue('')
    setSearchQuery('')
    setActiveNav(id)
  }, [setActiveNav, setSearchQuery])

  // 组件卸载时清除防抖定时器
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [])

  return (
    <nav className="sidebar">
      {/* 搜索框 */}
      <div className="sidebar__search">
        <input
          className="sidebar__search-input"
          type="text"
          placeholder="搜索歌曲..."
          value={inputValue}
          onChange={handleInputChange}
        />
      </div>

      {/* 导航项列表 */}
      <ul className="sidebar__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              className={`sidebar__item ${activeNav === item.id ? 'sidebar__item--active' : ''}`}
              onClick={() => handleNavClick(item.id)}
            >
              <span className="sidebar__icon"><item.Icon width={16} height={16} /></span>
              <span className="sidebar__label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default Sidebar
