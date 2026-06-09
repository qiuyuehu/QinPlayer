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
//   AudioEngine timeupdate → setCurrentTime()
//   AudioEngine loadedmetadata → setDuration()
//   AudioEngine ended → nextTrack()
// =============================================================================

import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { getAudioEngine, hasAudioEngine } from '../utils/AudioEngine'

export function useAudioSync() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const seekTime = usePlayerStore((s) => s.seekTime)
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime)
  const setDuration = usePlayerStore((s) => s.setDuration)
  const setIsPlaying = usePlayerStore((s) => s.setPlaying)
  const setSeekTime = usePlayerStore((s) => s.setSeekTime)
  const nextTrack = usePlayerStore((s) => s.nextTrack)

  // 标记：音频加载完毕后需要自动播放
  const pendingAutoPlay = useRef(false)

  // 标记：引擎事件是否已注册
  const eventsRegistered = useRef(false)

  // ---------------------------------------------------------------------------
  // 注册 AudioEngine 事件（只注册一次）
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // 轮询等待引擎创建（可能由 SongList 的点击创建）
    const registerEvents = () => {
      if (eventsRegistered.current) return true
      if (!hasAudioEngine()) return false

      eventsRegistered.current = true
      const engine = getAudioEngine()

      engine.onTimeUpdate((time, dur) => {
        setCurrentTime(time)
        if (dur > 0) setDuration(dur)
      })

      engine.onLoadedMetadata((dur) => {
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
        setIsPlaying(false)
        nextTrack()
      })

      return true
    }

    if (registerEvents()) return

    const timer = setInterval(() => {
      if (registerEvents()) clearInterval(timer)
    }, 300)

    return () => clearInterval(timer)
  }, [setCurrentTime, setDuration, setIsPlaying, nextTrack])

  // ---------------------------------------------------------------------------
  // currentTrack 变化 → 加载音频
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!currentTrack) return

    // 懒创建引擎（此时可能已有用户交互上下文）
    const engine = getAudioEngine()
    if (!eventsRegistered.current) {
      // 如果事件还没注册，先注册
      eventsRegistered.current = true
      engine.onTimeUpdate((time, dur) => {
        setCurrentTime(time)
        if (dur > 0) setDuration(dur)
      })
      engine.onLoadedMetadata((dur) => {
        setDuration(dur)
        if (pendingAutoPlay.current) {
          pendingAutoPlay.current = false
          engine.play().catch((err) => {
            if (err.name !== 'AbortError') setIsPlaying(false)
          })
        }
      })
      engine.onEnded(() => {
        setIsPlaying(false)
        nextTrack()
      })
    }

    const url = window.electronAPI.getAudioUrl(currentTrack.filePath)
    console.log('[useAudioSync] 加载歌曲:', currentTrack.title, url)
    engine.load(url)

    // 如果当前应该播放，标记加载完后自动播放
    if (isPlaying) {
      pendingAutoPlay.current = true
    }
  }, [currentTrack])  // 只依赖 currentTrack

  // ---------------------------------------------------------------------------
  // isPlaying 变化 → 播放/暂停
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!hasAudioEngine()) return
    const engine = getAudioEngine()

    if (isPlaying) {
      const p = engine.play()
      if (p) {
        p.catch((err) => {
          if (err.name === 'AbortError') {
            // 音频还没加载完，等 loadedmetadata 后再播
            pendingAutoPlay.current = true
          } else {
            console.error('[useAudioSync] 播放失败:', err)
            setIsPlaying(false)
          }
        })
      }
    } else {
      engine.pause()
    }
  }, [isPlaying, setIsPlaying])

  // ---------------------------------------------------------------------------
  // volume 变化 → 设置音量
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!hasAudioEngine()) return
    getAudioEngine().setVolume(volume)
  }, [volume])

  // ---------------------------------------------------------------------------
  // seekTime 变化 → 跳转进度
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (seekTime === null || isNaN(seekTime)) return
    if (!hasAudioEngine()) return

    const engine = getAudioEngine()
    engine.currentTime = seekTime
    setCurrentTime(seekTime)
    setSeekTime(null)
  }, [seekTime, setCurrentTime, setSeekTime])
}
