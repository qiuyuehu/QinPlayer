// =============================================================================
// QinPlayer — 音频同步 Hook
// =============================================================================
// 职责：监听 Zustand 状态变化，统一驱动 AudioEngine
// 设计：所有音频操作都通过 Zustand 状态驱动，组件不直接操作 AudioEngine
//
// 同步关系：
//   currentTrack 变化 → AudioEngine.load() + play()
//   isPlaying 变化   → AudioEngine.play() / pause()
//   volume 变化      → AudioEngine.setVolume()
//   seekTime 变化    → AudioEngine.currentTime = seekTime
//   AudioEngine timeupdate → currentTimeRef.current（共享 ref，不触发 re-render）
//   AudioEngine loadedmetadata → setDuration()
//   AudioEngine ended → nextTrack()
// =============================================================================

import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { getAudioEngine, hasAudioEngine } from '../utils/AudioEngine'
import { updateMediaSession, setPlaybackState, registerMediaSessionActions } from '../utils/mediaSession'
import { currentTimeRef } from '../utils/currentTimeRef'
import { useUIStore } from '../stores/uiStore'

// useAudioSync — 播放器状态同步 hook，驱动 AudioEngine + Media Session + 事件监听
export function useAudioSync() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const seekTime = usePlayerStore((s) => s.seekTime)
  const setDuration = usePlayerStore((s) => s.setDuration)
  const setIsPlaying = usePlayerStore((s) => s.setPlaying)
  const setSeekTime = usePlayerStore((s) => s.setSeekTime)
  const nextTrack = usePlayerStore((s) => s.nextTrack)
  const featureFlags = useUIStore((s) => s.featureFlags)

  // 标记：音频加载完毕后需要自动播放
  const pendingAutoPlay = useRef(false)
  const pendingSeekRef = useRef<number | null>(null)  // 启动时恢复的 seek 位置
  // 曲目切换期间旧音频仍可能在淡出并发送事件；新 metadata 就绪前忽略这些事件。
  const trackTransitionRef = useRef(false)
  const fadeEnabled = usePlayerStore((s) => s.fadeEnabled)  // 淡入淡出开关

  // 标记：引擎事件是否已注册
  const eventsRegistered = useRef(false)

  // ---------------------------------------------------------------------------
  // 注册 AudioEngine 事件（抽取为公共函数，消除重复）
  // ---------------------------------------------------------------------------
  // ⚠️ 用函数封装事件注册逻辑，避免在两个 useEffect 中重复 ~60 行代码
  // ---------------------------------------------------------------------------
  const registerEngineEvents = (engine: ReturnType<typeof getAudioEngine>) => {
    engine.onTimeUpdate((time, dur) => {
      if (trackTransitionRef.current) return
      currentTimeRef.current = time    // 写入共享 ref，不触发 re-render
      if (dur > 0) setDuration(dur)
    })

    engine.onLoadedMetadata((dur) => {
      trackTransitionRef.current = false
      setDuration(dur)
      // 音频加载完毕，如果有待播放标记，立即播放
      if (pendingAutoPlay.current) {
        pendingAutoPlay.current = false
        engine.play().catch((err) => {
          if (err.name !== 'AbortError') setIsPlaying(false)
        })
      }
    })

    engine.onEnded(() => {
      // 手动切歌的淡出阶段可能收到旧歌曲 ended，不能因此再跳一首。
      if (trackTransitionRef.current) return
      if (!useUIStore.getState().featureFlags.playback) return

      const mode = usePlayerStore.getState().playMode
      if (mode === 'loop') {
        engine.currentTime = 0
        engine.play().catch(() => {})
      } else {
        setIsPlaying(false)
        nextTrack()
      }
    })

    if (useUIStore.getState().featureFlags.mediaSession) {
      // 注册 Media Session 动作回调（键盘多媒体键、任务栏按钮）
      registerMediaSessionActions({
        play: () => usePlayerStore.getState().setPlaying(true),
        pause: () => usePlayerStore.getState().setPlaying(false),
        prevTrack: () => usePlayerStore.getState().prevTrack(),
        nextTrack: () => usePlayerStore.getState().nextTrack(),
        seekTo: (time) => usePlayerStore.getState().setSeekTime(time)
      })
    }
  }

  // ---------------------------------------------------------------------------
  // 注册 AudioEngine 事件（只注册一次）
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!featureFlags.playback) return

    // 轮询等待引擎创建（可能由 SongList 的点击创建）
    const tryRegister = () => {
      if (eventsRegistered.current) return true
      if (!hasAudioEngine()) return false

      eventsRegistered.current = true
      const engine = getAudioEngine()
      registerEngineEvents(engine)
      return true
    }

    if (tryRegister()) return

    const timer = setInterval(() => {
      if (tryRegister()) clearInterval(timer)
    }, 300)

    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureFlags.playback])

  // ---------------------------------------------------------------------------
  // currentTrack 变化 → 加载音频
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!featureFlags.playback) {
      trackTransitionRef.current = false
      return
    }
    if (!currentTrack) {
      trackTransitionRef.current = false
      currentTimeRef.current = 0
      return
    }

    trackTransitionRef.current = true
    currentTimeRef.current = 0

    // 懒创建引擎（此时可能已有用户交互上下文）
    const engine = getAudioEngine()
    if (!eventsRegistered.current) {
      // 如果事件还没注册，先注册
      eventsRegistered.current = true
      registerEngineEvents(engine)
    }

    const url = window.electronAPI.getAudioUrl(currentTrack.filePath)
    console.log('[useAudioSync] 加载歌曲:', currentTrack.title, url)

    // ⚠️ 暗礁 1：更新 Media Session（封面图需转 Blob URL）
    if (featureFlags.mediaSession) {
      updateMediaSession(currentTrack)
    }

    // ⚠️ 用 getState() 实时读取，避免未列入依赖的 fadeEnabled/isPlaying 形成旧闭包
    const { fadeEnabled: currentFade, isPlaying: currentPlaying } = usePlayerStore.getState()
    const shouldFade = featureFlags.fadeEffect && currentFade

    // 根据 fadeEnabled 决定是否使用淡入淡出
    if (shouldFade && currentPlaying) {
      // 淡入淡出模式：fadeOut → load → play → fadeIn
      engine.loadWithFade(url, 500).catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('[useAudioSync] loadWithFade 失败:', err)
          // 降级：直接加载播放
          engine.load(url)
          pendingAutoPlay.current = true
        }
      })
    } else {
      // 普通模式：直接加载
      engine.load(url)

      // 如果当前应该播放，标记加载完后自动播放
      if (currentPlaying) {
        pendingAutoPlay.current = true
      }
    }
  }, [currentTrack, featureFlags.playback, featureFlags.mediaSession, featureFlags.fadeEffect])

  // ---------------------------------------------------------------------------
  // isPlaying 变化 → 播放/暂停
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!featureFlags.playback) {
      if (isPlaying) setIsPlaying(false)
      return
    }

    if (!hasAudioEngine()) return
    const engine = getAudioEngine()

    if (isPlaying) {
      const p = engine.play()
      if (p) {
        p.catch((err) => {
          if (err.name === 'AbortError') {
            pendingAutoPlay.current = true
          } else {
            console.error('[useAudioSync] 播放失败:', err)
            setIsPlaying(false)
          }
        })
      }
      if (featureFlags.mediaSession) setPlaybackState('playing')
    } else {
      engine.pause()
      if (featureFlags.mediaSession) setPlaybackState('paused')
    }
  }, [isPlaying, setIsPlaying, featureFlags.playback, featureFlags.mediaSession])

  // ---------------------------------------------------------------------------
  // volume 变化 → 设置音量
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!featureFlags.playback) return
    if (!hasAudioEngine()) return
    getAudioEngine().setVolume(volume)
  }, [volume, featureFlags.playback])

  // ---------------------------------------------------------------------------
  // seekTime 变化 → 跳转进度
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!featureFlags.playback) return
    if (seekTime === null || isNaN(seekTime)) return

    if (!hasAudioEngine()) {
      // 引擎还没创建（启动恢复场景），存到 ref 等加载完后 seek
      pendingSeekRef.current = seekTime
      setSeekTime(null)
      return
    }

    const engine = getAudioEngine()
    engine.currentTime = seekTime
    currentTimeRef.current = seekTime
    setSeekTime(null)
  }, [seekTime, setSeekTime, featureFlags.playback])

  // ---------------------------------------------------------------------------
  // 播放状态变化 → 通知主进程（托盘菜单需要）
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!featureFlags.playback || !featureFlags.tray) return
    window.electronAPI.send('player:playing-changed', isPlaying)
  }, [isPlaying, featureFlags.playback, featureFlags.tray])

  // ---------------------------------------------------------------------------
  // 监听托盘事件（托盘右键菜单的播放控制）
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!featureFlags.playback || !featureFlags.tray) return

    const unsubPlayPause = window.electronAPI.on('tray:play-pause', () => {
      const current = usePlayerStore.getState().isPlaying
      usePlayerStore.getState().setPlaying(!current)
    })

    const unsubPrev = window.electronAPI.on('tray:prev', () => {
      usePlayerStore.getState().prevTrack()
    })

    const unsubNext = window.electronAPI.on('tray:next', () => {
      usePlayerStore.getState().nextTrack()
    })

    return () => {
      unsubPlayPause()
      unsubPrev()
      unsubNext()
    }
  }, [featureFlags.playback, featureFlags.tray])
}
