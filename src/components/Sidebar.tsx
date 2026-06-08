// =============================================================================
// QinPlayer — 左侧导航栏
// =============================================================================
// 职责：显示导航项列表，点击切换右侧内容区
// 样式：固定宽度 ~220px，Apple Music 风格
// =============================================================================

import { useUIStore } from '../stores/uiStore'

// 导航项定义
const NAV_ITEMS = [
  { id: 'search',      label: '搜索',     icon: '🔍' },
  { id: 'recent',      label: '最近播放', icon: '🕐' },
  { id: 'local',       label: '本地音乐', icon: '🎵' },
  { id: 'albums',      label: '专辑',     icon: '💿' },
  { id: 'playlists',   label: '歌单',     icon: '📋' },
  { id: 'liked',       label: '我喜欢的', icon: '❤️' },
  { id: 'settings',    label: '设置',     icon: '⚙️' },
]

function Sidebar() {
  // 当前选中的导航项
  const activeNav = useUIStore((state) => state.activeNav)
  const setActiveNav = useUIStore((state) => state.setActiveNav)

  return (
    <nav className="sidebar">
      {/* 导航项列表 */}
      <ul className="sidebar__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              className={`sidebar__item ${activeNav === item.id ? 'sidebar__item--active' : ''}`}
              onClick={() => setActiveNav(item.id)}
            >
              <span className="sidebar__icon">{item.icon}</span>
              <span className="sidebar__label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default Sidebar
