// =============================================================================
// QinPlayer — 右侧内容区
// =============================================================================
// 职责：根据当前选中的导航项，渲染对应的页面组件
// 设计：简单的条件渲染路由（不需要 react-router，功能简单够用）
// 动画：导航切换时内容区淡入（opacity 0→1，200ms）
// =============================================================================

import { useState, useEffect, useRef } from 'react'
import { useUIStore } from '../stores/uiStore'
import Search from '../pages/Search'
import RecentlyPlayed from '../pages/RecentlyPlayed'
import LocalMusic from '../pages/LocalMusic'
import Albums from '../pages/Albums'
import Playlists from '../pages/Playlists'
import Liked from '../pages/Liked'
import Lyrics from '../pages/Lyrics'
import Settings from '../pages/Settings'
import MyProfile from '../pages/MyProfile'
import { isNavAllowed } from '../utils/featureFlags'
import { isReducedMotionActive } from '../utils/motionPreference'

// ---------------------------------------------------------------------------
// 内容区路由
// ---------------------------------------------------------------------------

function Content() {
  const activeNav = useUIStore((state) => state.activeNav)
  const featureFlags = useUIStore((state) => state.featureFlags)
  const [lyricsVisible, setLyricsVisible] = useState(activeNav === 'lyrics' && featureFlags.lyrics)
  const [lyricsPhase, setLyricsPhase] = useState<'enter' | 'active' | 'exit' | 'done'>(
    activeNav === 'lyrics' && featureFlags.lyrics ? 'active' : 'done'
  )
  const [showMainContent, setShowMainContent] = useState(activeNav !== 'lyrics' || !featureFlags.lyrics)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (activeNav === 'lyrics' && featureFlags.lyrics) {
      setLyricsVisible(true)
      setShowMainContent(false)

      // 减弱动画时直接跳到 active，否则播放 300ms 进入动画
      if (isReducedMotionActive()) {
        setLyricsPhase('active')
      } else {
        setLyricsPhase('enter')
        timerRef.current = setTimeout(() => {
          setLyricsPhase('active')
          timerRef.current = null
        }, 300)
      }
      return
    }

    if (lyricsVisible) {
      setLyricsPhase('exit')
      if (isReducedMotionActive()) {
        setLyricsVisible(false)
        setLyricsPhase('done')
        setShowMainContent(true)
        return
      }
      timerRef.current = setTimeout(() => {
        setLyricsVisible(false)
        setLyricsPhase('done')
        setShowMainContent(true)
        timerRef.current = null
      }, 300)
      return
    }

    setLyricsPhase('done')
    setShowMainContent(true)
  }, [activeNav, featureFlags.lyrics, lyricsVisible])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const resolvedNav = isNavAllowed(activeNav, featureFlags) ? activeNav : 'local'

  // 根据已解析的导航项渲染页面，wrapper key 与实际页面保持一致。
  const renderPage = () => {
    switch (resolvedNav) {
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
      case 'profile':
        return <MyProfile />
      default:
        return <LocalMusic />
    }
  }

  return (
    <main className="content">
      {lyricsVisible && (
        <div className={`content__lyrics-layer content__lyrics-layer--${lyricsPhase}`}>
          <Lyrics />
        </div>
      )}
      {showMainContent && (
        <div key={resolvedNav} className="content__fade-wrapper">
          {renderPage()}
        </div>
      )}
    </main>
  )
}

export default Content
