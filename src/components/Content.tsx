// =============================================================================
// QinPlayer — 右侧内容区
// =============================================================================
// 职责：根据当前选中的导航项，渲染对应的页面组件
// 设计：简单的条件渲染路由（不需要 react-router，功能简单够用）
// =============================================================================

import { useUIStore } from '../stores/uiStore'
import Search from '../pages/Search'
import RecentlyPlayed from '../pages/RecentlyPlayed'
import LocalMusic from '../pages/LocalMusic'
import Albums from '../pages/Albums'
import Playlists from '../pages/Playlists'
import Liked from '../pages/Liked'
import Settings from '../pages/Settings'

// ---------------------------------------------------------------------------
// 内容区路由
// ---------------------------------------------------------------------------

function Content() {
  const activeNav = useUIStore((state) => state.activeNav)

  // 根据导航项渲染对应页面
  const renderPage = () => {
    switch (activeNav) {
      case 'search':
        return <Search />
      case 'recent':
        return <RecentlyPlayed />
      case 'local':
        return <LocalMusic />
      case 'albums':
        return <Albums />
      case 'playlists':
        return <Playlists />
      case 'liked':
        return <Liked />
      case 'settings':
        return <Settings />
      default:
        return <LocalMusic />
    }
  }

  return (
    <main className="content">
      {renderPage()}
    </main>
  )
}

export default Content
