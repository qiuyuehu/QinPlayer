// =============================================================================
// QinPlayer — 根组件
// =============================================================================
// 职责：组装布局（标题栏 + 导航栏 + 内容区 + 播放控制条）、主题管理
// 布局：TitleBar 固定顶部，中间 Sidebar + Content 占满，PlayerBar 固定底部
// 水合：启动时从数据库恢复播放状态，加载完成前显示骨架屏
// =============================================================================

import { useState, useEffect, useRef } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Content from './components/Content'
import PlayerBar from './components/PlayerBar'
import MiniPlayer from './components/MiniPlayer'
import CloseConfirmDialog from './components/CloseConfirmDialog'
import { useTheme } from './hooks/useTheme'
import { useReducedMotion } from './hooks/useReducedMotion'
import { useAudioSync } from './hooks/useAudioSync'
import { restorePlayerState, usePlayerStore } from './stores/playerStore'
import { useUIStore } from './stores/uiStore'
import { useEqStore } from './stores/eqStore'
import type { Theme } from './types'
import type { CloseResponse, IpcPushChannels } from './types/ipc'
import { isNavAllowed } from './utils/featureFlags'
import { setAudioEngineEqualizerEnabled } from './utils/AudioEngine'

// App — 根组件，组装布局 + 主题管理 + 水合播放状态
function App() {
  // 水合状态（数据库加载完成前显示骨架屏）
  const [isHydrated, setIsHydrated] = useState(false)
  const [closeRequest, setCloseRequest] = useState<IpcPushChannels['close:request'] | null>(null)
  const closeRequestRef = useRef<IpcPushChannels['close:request'] | null>(null)

  // 当前导航项（歌词界面时隐藏导航栏和播放栏）
  const activeNav = useUIStore((state) => state.activeNav)
  const isLyricsMode = activeNav === 'lyrics'
  const isMiniMode = useUIStore((state) => state.isMiniMode)
  const featureFlags = useUIStore((state) => state.featureFlags)

  // 初始化主题系统
  useTheme()
  useReducedMotion()

  // 初始化音频同步
  useAudioSync()

  // 根级监听独立于水合和三种应用壳层，确保任何可见状态都能响应关闭询问。
  useEffect(() => {
    const unsubscribe = window.electronAPI.on('close:request', (payload: IpcPushChannels['close:request']) => {
      if (!payload || typeof payload.requestId !== 'string' || payload.requestId.length === 0) return
      if (closeRequestRef.current) return
      closeRequestRef.current = payload
      setCloseRequest(payload)
    })
    window.electronAPI.send('close:ready')
    return unsubscribe
  }, [])

  const handleCloseResponse = (response: CloseResponse): void => {
    if (closeRequestRef.current?.requestId !== response.requestId) return
    closeRequestRef.current = null
    window.electronAPI.send('close:respond', response)
    setCloseRequest(null)
  }

  const closeDialog = closeRequest ? (
    <CloseConfirmDialog
      key={closeRequest.requestId}
      requestId={closeRequest.requestId}
      onRespond={handleCloseResponse}
    />
  ) : null

  // 迷你模式切换时通知主进程调整窗口尺寸
  useEffect(() => {
    if (!featureFlags.miniMode || !featureFlags.tray) return
    window.electronAPI.send('window:set-mini-mode', isMiniMode)
  }, [isMiniMode, featureFlags.miniMode, featureFlags.tray])

  // 启动时恢复播放状态 + 主题设置 + 歌词偏移量 + 淡入淡出 + 均衡器
  useEffect(() => {
    async function hydrate() {
      try {
        // ★ 启动顺序不可调：flags 必须先于播放状态和均衡器水合。
        const flags = await window.electronAPI.getFeatureFlags()
        useUIStore.getState().setFeatureFlags(flags)
        setAudioEngineEqualizerEnabled(flags.equalizer)

        if (!isNavAllowed(useUIStore.getState().activeNav, flags)) {
          useUIStore.getState().setActiveNav('local')
        }

        if ((!flags.miniMode || !flags.tray) && useUIStore.getState().isMiniMode) {
          useUIStore.getState().setMiniMode(false)
        }

        // 并行恢复：播放状态 + 主题设置 + 歌词偏移量 + 淡入淡出
        const [, savedTheme, savedLyricOffset, savedFadeEnabled, savedReducedMotion] = await Promise.all([
          flags.playback ? restorePlayerState() : Promise.resolve(),
          window.electronAPI.invoke('settings:get', { key: 'theme' }) as Promise<string | null>,
          window.electronAPI.invoke('settings:get', { key: 'lyricOffset' }) as Promise<string | null>,
          window.electronAPI.invoke('settings:get', { key: 'fadeEnabled' }) as Promise<string | null>,
          window.electronAPI.invoke('settings:get', { key: 'reducedMotion' }) as Promise<string | null>,
        ])

        // 恢复均衡器设置（独立加载，不阻塞其他恢复）
        if (flags.equalizer) {
          useEqStore.getState().loadFromDb()
        }

        // 恢复主题（如果有保存的值）
        if (savedTheme && ['dark', 'light', 'system'].includes(savedTheme)) {
          useUIStore.getState().setTheme(savedTheme as Theme)
        }

        // 仅显式的 true 开启手动减少动画，其余值统一按关闭处理。
        useUIStore.getState().setReducedMotion(savedReducedMotion === 'true')

        // 恢复歌词偏移量
        if (savedLyricOffset) {
          const offset = parseFloat(savedLyricOffset)
          if (!isNaN(offset)) {
            usePlayerStore.getState().setLyricOffset(offset)
          }
        }

        // 恢复淡入淡出设置
        if (savedFadeEnabled) {
          usePlayerStore.getState().setFadeEnabled(flags.fadeEffect && savedFadeEnabled === 'true')
        } else if (!flags.fadeEffect) {
          usePlayerStore.getState().setFadeEnabled(false)
        }
      } catch (e) {
        console.error('[App] 水合失败:', e)
      } finally {
        setIsHydrated(true)
      }
    }
    hydrate()
  }, [])

  // 加载中显示骨架屏
  if (!isHydrated) {
    return (
      <>
      <div className="app">
        <TitleBar />
        <div className="app__main">
          <div className="app__skeleton">
            <div className="app__skeleton-sidebar" />
            <div className="app__skeleton-content">
              <div className="app__skeleton-bar" style={{ width: '40%' }} />
              <div className="app__skeleton-bar" style={{ width: '60%' }} />
              <div className="app__skeleton-bar" style={{ width: '50%' }} />
            </div>
          </div>
        </div>
        {/* 骨架屏底部：用占位条替代真实 PlayerBar */}
        <div className="app__skeleton-playerbar">
          <div className="app__skeleton-bar" style={{ width: '30%', height: '12px' }} />
          <div className="app__skeleton-bar" style={{ width: '50%', height: '8px' }} />
          <div className="app__skeleton-bar" style={{ width: '20%', height: '12px' }} />
        </div>
      </div>
      {closeDialog}
      </>
    )
  }

  return (
    <>
    <div className="app">
      {/* 迷你模式：只显示 MiniPlayer */}
      {isMiniMode ? (
        <MiniPlayer />
      ) : (
        <>
          {/* 自定义标题栏（歌词界面时不渲染） */}
          {!isLyricsMode && <TitleBar />}

          {/* 主体区域：左侧导航栏 + 右侧内容区 */}
          <div className="app__main">
            {/* 歌词界面时隐藏导航栏 */}
            {!isLyricsMode && <Sidebar />}
            <Content />
          </div>

          {/* 底部播放控制条（歌词界面时隐藏） */}
          {!isLyricsMode && <PlayerBar />}
        </>
      )}
    </div>
    {closeDialog}
    </>
  )
}

export default App
