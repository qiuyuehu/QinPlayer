// =============================================================================
// QinPlayer — 播放控制状态管理 Store
// =============================================================================
// 职责：管理播放相关状态（当前曲目、播放列表、音量、播放模式、进度）
// 设计：所有音频相关状态都在这里，useAudioSync hook 统一同步到 AudioEngine
// =============================================================================

import { create } from 'zustand'
import type { Track, PlayMode } from '../types'

// ---------------------------------------------------------------------------
// 状态接口
// ---------------------------------------------------------------------------

interface PlayerState {
  // --- 播放状态 ---
  isPlaying: boolean              // 是否正在播放
  currentTrack: Track | null      // 当前播放的歌曲
  playlist: Track[]               // 当前播放列表
  volume: number                  // 音量 (0-1)
  playMode: PlayMode              // 播放模式

  // --- 进度状态 ---
  currentTime: number             // 当前播放位置（秒）
  duration: number                // 总时长（秒）
  seekTime: number | null         // 用户拖拽的目标时间（null = 未拖拽）

  // --- actions ---
  setPlaying: (v: boolean) => void
  setCurrentTrack: (t: Track | null) => void
  setPlaylist: (list: Track[]) => void
  setVolume: (v: number) => void
  setPlayMode: (m: PlayMode) => void
  setCurrentTime: (t: number) => void
  setDuration: (d: number) => void
  setSeekTime: (t: number | null) => void
  nextTrack: () => void
  prevTrack: () => void
}

// ---------------------------------------------------------------------------
// 播放模式循环顺序
// ---------------------------------------------------------------------------

const PLAY_MODE_ORDER: PlayMode[] = ['sequential', 'loop', 'shuffle']

// ---------------------------------------------------------------------------
// Store 创建
// ---------------------------------------------------------------------------

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // 初始状态
  isPlaying: false,
  currentTrack: null,
  playlist: [],
  volume: 0.8,                    // 默认音量 80%
  playMode: 'sequential',         // 默认顺序播放
  currentTime: 0,
  duration: 0,
  seekTime: null,

  // --- 基础 setters ---

  setPlaying: (v) => set({ isPlaying: v }),

  setCurrentTrack: (t) => set({ currentTrack: t, currentTime: 0, duration: 0 }),

  setPlaylist: (list) => set({ playlist: list }),

  setVolume: (v) => {
    const volume = Math.max(0, Math.min(1, v))
    set({ volume })
  },

  setPlayMode: (m) => set({ playMode: m }),

  setCurrentTime: (t) => set({ currentTime: t }),

  setDuration: (d) => set({ duration: d }),

  setSeekTime: (t) => set({ seekTime: t }),

  // --- 切歌逻辑 ---

  nextTrack: () => {
    const { playlist, currentTrack, playMode } = get()
    if (playlist.length === 0 || !currentTrack) return

    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id)

    if (playMode === 'shuffle') {
      if (playlist.length === 1) return
      let randomIndex
      do {
        randomIndex = Math.floor(Math.random() * playlist.length)
      } while (randomIndex === currentIndex)
      set({ currentTrack: playlist[randomIndex], currentTime: 0, duration: 0, isPlaying: true })
    } else {
      const nextIndex = (currentIndex + 1) % playlist.length
      set({ currentTrack: playlist[nextIndex], currentTime: 0, duration: 0, isPlaying: true })
    }
  },

  prevTrack: () => {
    const { playlist, currentTrack, playMode } = get()
    if (playlist.length === 0 || !currentTrack) return

    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id)

    if (playMode === 'shuffle') {
      if (playlist.length === 1) return
      let randomIndex
      do {
        randomIndex = Math.floor(Math.random() * playlist.length)
      } while (randomIndex === currentIndex)
      set({ currentTrack: playlist[randomIndex], currentTime: 0, duration: 0, isPlaying: true })
    } else {
      const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length
      set({ currentTrack: playlist[prevIndex], currentTime: 0, duration: 0, isPlaying: true })
    }
  },
}))

// ---------------------------------------------------------------------------
// 辅助函数：切换播放模式
// ---------------------------------------------------------------------------

export function togglePlayMode(current: PlayMode): PlayMode {
  const index = PLAY_MODE_ORDER.indexOf(current)
  return PLAY_MODE_ORDER[(index + 1) % PLAY_MODE_ORDER.length]
}
