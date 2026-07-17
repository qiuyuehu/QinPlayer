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
import { getPlaybackTrackKey, usePlayerStore } from '../stores/playerStore'
import { getAudioEngine, hasAudioEngine, type AudioSourceIdentity } from '../utils/AudioEngine'
import {
  clearMediaSession,
  registerMediaSessionActions,
  setPlaybackState,
  unregisterMediaSessionActions,
  updateMediaSession,
} from '../utils/mediaSession'
import { currentTimeRef } from '../utils/currentTimeRef'
import { useUIStore } from '../stores/uiStore'
import { listeningTracker } from '../utils/listeningTracker'

// useAudioSync — 播放器状态同步 hook，驱动 AudioEngine + Media Session + 事件监听
export function useAudioSync() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const seekTime = usePlayerStore((s) => s.seekTime)
  const playbackRetryVersion = usePlayerStore((s) => s.playbackRetryVersion)
  const setDuration = usePlayerStore((s) => s.setDuration)
  const setIsPlaying = usePlayerStore((s) => s.setPlaying)
  const setSeekTime = usePlayerStore((s) => s.setSeekTime)
  const nextTrack = usePlayerStore((s) => s.nextTrack)
  const featureFlags = useUIStore((s) => s.featureFlags)

  // 标记：音频加载完毕后需要自动播放
  type ActiveLoad = AudioSourceIdentity & { trackKey: string }
  const pendingAutoPlay = useRef<ActiveLoad | null>(null)
  const pendingSeekRef = useRef<{ trackKey: string; time: number } | null>(null)
  const activeLoadRef = useRef<ActiveLoad | null>(null)
  // 曲目切换期间旧音频仍可能在淡出并发送事件；新 metadata 就绪前忽略这些事件。
  const trackTransitionRef = useRef(false)
  const trackedTrackKeyRef = useRef<string | null>(null)
  const previousPlayingRef = useRef(isPlaying)
  const handledRetryVersionRef = useRef(playbackRetryVersion)
  const trackingEnabledRef = useRef(featureFlags.playback && featureFlags.profile)
  const fadeEnabled = usePlayerStore((s) => s.fadeEnabled)  // 淡入淡出开关

  // 标记：引擎事件是否已注册
  const eventsRegistered = useRef(false)

  const isActiveLoad = (identity: AudioSourceIdentity | null | undefined): identity is AudioSourceIdentity => {
    const active = activeLoadRef.current
    return !!identity
      && !!active
      && active.source === identity.source
      && active.generation === identity.generation
  }

  const setActiveLoad = (trackKey: string, identity: AudioSourceIdentity): ActiveLoad => {
    const active = { ...identity, trackKey }
    activeLoadRef.current = active
    return active
  }

  const isCurrentActiveLoad = (candidate: ActiveLoad | null | undefined): candidate is ActiveLoad => {
    if (!candidate || !isActiveLoad(candidate)) return false
    const liveTrack = usePlayerStore.getState().currentTrack
    return !!liveTrack && getPlaybackTrackKey(liveTrack) === candidate.trackKey
  }

  const failPlayback = (kind: 'load' | 'play', owner: ActiveLoad): void => {
    const flags = useUIStore.getState().featureFlags
    const player = usePlayerStore.getState()
    if (
      !flags.playback
      || !isCurrentActiveLoad(owner)
    ) return

    pendingAutoPlay.current = null
    player.setPlaying(false)
    player.setPlaybackFailure({
      kind,
      trackKey: owner.trackKey,
      code: kind === 'load' ? 'media-error' : 'play-rejected',
    })
  }

  const clearPlaybackFailure = (owner: ActiveLoad): void => {
    if (!isCurrentActiveLoad(owner)) return
    usePlayerStore.getState().clearPlaybackFailure(owner.trackKey)
  }

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

      const liveFlags = useUIStore.getState().featureFlags
      const livePlayer = usePlayerStore.getState()
      if (
        liveFlags.playback
        && liveFlags.profile
        && engine.playing
        && livePlayer.currentTrack
      ) {
        const trackKey = `${livePlayer.currentTrack.id}:${livePlayer.currentTrack.filePath}`
        listeningTracker.observe(trackKey, time, Date.now())
      }
    })

    engine.onLoadedMetadata((dur, identity) => {
      const active = activeLoadRef.current
      const eventIdentity = identity ?? active
      if (!active || !isActiveLoad(eventIdentity)) return
      const liveTrack = usePlayerStore.getState().currentTrack
      if (!liveTrack || getPlaybackTrackKey(liveTrack) !== active.trackKey) return

      trackTransitionRef.current = false
      setDuration(dur)
      const pendingSeek = pendingSeekRef.current
      if (pendingSeek?.trackKey === active.trackKey) {
        const safeDuration = Number.isFinite(dur) ? Math.max(0, dur) : 0
        const target = Math.min(Math.max(0, pendingSeek.time), safeDuration)
        engine.currentTime = target
        currentTimeRef.current = target
        pendingSeekRef.current = null
      }
      clearPlaybackFailure(active)
      // 音频加载完毕，如果有待播放标记，立即播放
      const pendingPlay = pendingAutoPlay.current
      if (
        pendingPlay
        && pendingPlay.trackKey === active.trackKey
        && pendingPlay.generation === active.generation
      ) {
        pendingAutoPlay.current = null
        const playOwner = active
        engine.play().then(
          () => clearPlaybackFailure(playOwner),
          (err) => {
            if (err?.name !== 'AbortError') failPlayback('play', playOwner)
          },
        )
      }
    })

    engine.onError((error) => {
      const active = activeLoadRef.current
      if (!active || !isActiveLoad(error)) return
      failPlayback('load', active)
    })

    engine.onEnded(() => {
      // 手动切歌的淡出阶段可能收到旧歌曲 ended，不能因此再跳一首。
      if (trackTransitionRef.current) return
      if (!useUIStore.getState().featureFlags.playback) return

      const liveFlags = useUIStore.getState().featureFlags
      if (liveFlags.profile) void listeningTracker.flush()
      listeningTracker.resetSample()

      const livePlayer = usePlayerStore.getState()
      const currentIsDetached = livePlayer.currentTrack !== null
        && !livePlayer.playlist.some((track) => track.id === livePlayer.currentTrack?.id)
      if (
        livePlayer.priorityQueue.length > 0
        || livePlayer.priorityResumeTrackId !== null
        || livePlayer.detachedPlaylistIndex !== null
        || currentIsDetached
      ) {
        setIsPlaying(false)
        nextTrack()
      } else if (livePlayer.playMode === 'loop') {
        engine.currentTime = 0
        currentTimeRef.current = 0
        const playOwner = activeLoadRef.current
        engine.play().then(
          () => {
            if (playOwner) clearPlaybackFailure(playOwner)
          },
          (error) => {
            if (error?.name !== 'AbortError' && playOwner) failPlayback('play', playOwner)
          },
        )
      } else {
        setIsPlaying(false)
        nextTrack()
      }
    })

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

  // profile/playback 关闭时必须立即丢弃 pending，关闭后不允许继续写入统计。
  useEffect(() => {
    const trackingEnabled = featureFlags.playback && featureFlags.profile
    if (trackingEnabledRef.current && !trackingEnabled) {
      listeningTracker.discard()
    } else if (!trackingEnabledRef.current && trackingEnabled) {
      listeningTracker.resetSample()
    }
    trackingEnabledRef.current = trackingEnabled
  }, [featureFlags.playback, featureFlags.profile])

  // 页面刷新/关闭前尽力提交；异步 pagehide 不承诺异常退出零丢失。
  useEffect(() => {
    const handlePageHide = () => {
      const flags = useUIStore.getState().featureFlags
      if (flags.playback && flags.profile) void listeningTracker.flush()
      listeningTracker.resetSample()
    }
    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [])

  // Media Session actions 与功能开关同生命周期，关闭和卸载都必须对称清理。
  useEffect(() => {
    if (!featureFlags.playback || !featureFlags.mediaSession) {
      unregisterMediaSessionActions()
      clearMediaSession()
      return
    }

    const unregister = registerMediaSessionActions({
      play: () => usePlayerStore.getState().setPlaying(true),
      pause: () => usePlayerStore.getState().setPlaying(false),
      prevTrack: () => usePlayerStore.getState().prevTrack(),
      nextTrack: () => usePlayerStore.getState().nextTrack(),
      seekTo: (time) => usePlayerStore.getState().setSeekTime(time),
    })

    return () => {
      unregister()
      clearMediaSession()
    }
  }, [featureFlags.mediaSession, featureFlags.playback])

  // 文字 metadata 先提交，封面由 mediaSession 模块按 generation 异步补齐。
  useEffect(() => {
    if (!featureFlags.playback || !featureFlags.mediaSession || !currentTrack) {
      clearMediaSession()
      return
    }

    void updateMediaSession(currentTrack)
  }, [currentTrack, featureFlags.mediaSession, featureFlags.playback])

  // ---------------------------------------------------------------------------
  // currentTrack 变化 → 加载音频
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const nextTrackKey = currentTrack ? `${currentTrack.id}:${currentTrack.filePath}` : null
    if (trackedTrackKeyRef.current !== nextTrackKey) {
      const flags = useUIStore.getState().featureFlags
      if (trackedTrackKeyRef.current !== null && flags.playback && flags.profile) {
        void listeningTracker.flush()
      }
      listeningTracker.resetSample()
      trackedTrackKeyRef.current = nextTrackKey
      pendingAutoPlay.current = null
      if (pendingSeekRef.current?.trackKey !== nextTrackKey) pendingSeekRef.current = null
    }

    if (!featureFlags.playback) {
      trackTransitionRef.current = false
      pendingAutoPlay.current = null
      pendingSeekRef.current = null
      activeLoadRef.current = null
      if (hasAudioEngine()) getAudioEngine().invalidatePendingLoads()
      return
    }
    if (!currentTrack) {
      trackTransitionRef.current = false
      currentTimeRef.current = 0
      pendingAutoPlay.current = null
      pendingSeekRef.current = null
      activeLoadRef.current = null
      if (hasAudioEngine()) getAudioEngine().invalidatePendingLoads()
      return
    }

    const trackKey = getPlaybackTrackKey(currentTrack)
    trackTransitionRef.current = true
    currentTimeRef.current = 0

    const restoreSeek = usePlayerStore.getState().seekTime
    if (restoreSeek !== null) {
      pendingSeekRef.current = {
        trackKey,
        time: Number.isFinite(restoreSeek) && restoreSeek >= 0 ? restoreSeek : 0,
      }
      setSeekTime(null)
    }

    // 懒创建引擎（此时可能已有用户交互上下文）
    const engine = getAudioEngine()
    if (!eventsRegistered.current) {
      // 如果事件还没注册，先注册
      eventsRegistered.current = true
      registerEngineEvents(engine)
    }

    const url = window.electronAPI.getAudioUrl(currentTrack.id, currentTrack.mtime)
    console.log('[useAudioSync] 加载歌曲:', currentTrack.title, url)

    // ⚠️ 用 getState() 实时读取，避免未列入依赖的 fadeEnabled/isPlaying 形成旧闭包
    const { fadeEnabled: currentFade, isPlaying: currentPlaying } = usePlayerStore.getState()
    const shouldFade = featureFlags.fadeEffect && currentFade

    // 根据 fadeEnabled 决定是否使用淡入淡出
    if (shouldFade && currentPlaying) {
      // 淡入淡出模式：fadeOut → load → play → fadeIn
      const fadePromise = engine.loadWithFade(url, 500)
      const fadeIdentity = engine.latestLoadOperationIdentity
      const active = fadeIdentity ? setActiveLoad(trackKey, fadeIdentity) : null
      fadePromise.then((identity) => {
        if (identity && active && isActiveLoad(identity)) clearPlaybackFailure(active)
      }).catch((err) => {
        if (
          err?.name !== 'AbortError'
          && active
          && isActiveLoad(active)
          && usePlayerStore.getState().currentTrack
          && getPlaybackTrackKey(usePlayerStore.getState().currentTrack!) === trackKey
        ) {
          console.error('[useAudioSync] loadWithFade 失败:', err)
          // 降级：直接加载播放
          const fallback = setActiveLoad(trackKey, engine.load(url))
          pendingAutoPlay.current = currentPlaying ? fallback : null
        }
      })
    } else {
      // 普通模式：直接加载
      const active = setActiveLoad(trackKey, engine.load(url))

      // 如果当前应该播放，标记加载完后自动播放
      if (currentPlaying) {
        pendingAutoPlay.current = active
      }
    }
  }, [currentTrack, featureFlags.playback, featureFlags.fadeEffect, setSeekTime])

  // Retry 重新加载同一 Track，不经过 playTrack，因此不会清队列或重复记账。
  useEffect(() => {
    if (handledRetryVersionRef.current === playbackRetryVersion) return
    handledRetryVersionRef.current = playbackRetryVersion

    const flags = useUIStore.getState().featureFlags
    const liveTrack = usePlayerStore.getState().currentTrack
    if (!flags.playback || !liveTrack) return

    const trackKey = getPlaybackTrackKey(liveTrack)
    const retryTime = currentTimeRef.current
    pendingSeekRef.current = {
      trackKey,
      time: Number.isFinite(retryTime) && retryTime >= 0 ? retryTime : 0,
    }
    trackTransitionRef.current = true

    const engine = getAudioEngine()
    if (!eventsRegistered.current) {
      eventsRegistered.current = true
      registerEngineEvents(engine)
    }
    const url = window.electronAPI.getAudioUrl(liveTrack.id, liveTrack.mtime)
    const active = setActiveLoad(trackKey, engine.load(url))
    pendingAutoPlay.current = active
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackRetryVersion])

  // ---------------------------------------------------------------------------
  // isPlaying 变化 → 播放/暂停
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const wasPlaying = previousPlayingRef.current
    if (wasPlaying && !isPlaying) {
      const flags = useUIStore.getState().featureFlags
      if (flags.playback && flags.profile) void listeningTracker.flush()
      listeningTracker.resetSample()
    } else if (!wasPlaying && isPlaying) {
      listeningTracker.resetSample()
    }
    previousPlayingRef.current = isPlaying

    if (!featureFlags.playback) {
      if (isPlaying) setIsPlaying(false)
      pendingAutoPlay.current = null
      pendingSeekRef.current = null
      activeLoadRef.current = null
      if (hasAudioEngine()) getAudioEngine().invalidatePendingLoads()
      return
    }

    if (!hasAudioEngine()) return
    const engine = getAudioEngine()

    if (isPlaying) {
      const active = activeLoadRef.current
      if (
        trackTransitionRef.current
        && active
        && pendingSeekRef.current?.trackKey === active.trackKey
      ) return

      const liveTrack = usePlayerStore.getState().currentTrack
      if (!liveTrack) return
      const trackKey = getPlaybackTrackKey(liveTrack)
      const playOwner = activeLoadRef.current
      if (!playOwner || playOwner.trackKey !== trackKey) return
      const p = engine.play()
      if (p) {
        p.then(
          () => clearPlaybackFailure(playOwner),
          (err) => {
            if (err?.name === 'AbortError') {
              if (isCurrentActiveLoad(playOwner)) {
                pendingAutoPlay.current = playOwner
              }
            } else {
              console.error('[useAudioSync] 播放失败:', err)
              failPlayback('play', playOwner)
            }
          },
        )
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
    if (!featureFlags.playback || !currentTrack) {
      pendingSeekRef.current = null
      if (seekTime !== null) setSeekTime(null)
      return
    }
    if (seekTime === null) return

    const trackKey = getPlaybackTrackKey(currentTrack)
    const targetTime = Number.isFinite(seekTime) ? Math.max(0, seekTime) : 0

    const liveFlags = useUIStore.getState().featureFlags
    if (liveFlags.profile) void listeningTracker.flush()
    listeningTracker.resetSample()

    if (!hasAudioEngine()) {
      pendingSeekRef.current = { trackKey, time: targetTime }
      setSeekTime(null)
      return
    }

    const engine = getAudioEngine()
    if (trackTransitionRef.current || engine.duration <= 0) {
      pendingSeekRef.current = { trackKey, time: targetTime }
      setSeekTime(null)
      return
    }

    const clampedTime = Math.min(targetTime, engine.duration)
    pendingSeekRef.current = null
    engine.currentTime = clampedTime
    currentTimeRef.current = clampedTime
    setSeekTime(null)
  }, [seekTime, currentTrack, setSeekTime, featureFlags.playback])

  useEffect(() => () => {
    pendingAutoPlay.current = null
    pendingSeekRef.current = null
    activeLoadRef.current = null
    if (hasAudioEngine()) getAudioEngine().invalidatePendingLoads()
  }, [])

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
