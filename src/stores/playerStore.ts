// =============================================================================
// QinPlayer — 播放控制状态管理 Store
// =============================================================================
// 职责：管理播放相关状态（当前曲目、播放列表、音量、播放模式）
// 设计：低频状态，currentTime 不放这里（高频更新会导致 re-render）
//       currentTime 在 PlayerBar 内部用 useRef + timeupdate 直接更新 DOM
// =============================================================================

import { create } from 'zustand'
import type { Track, PlayMode } from '../types'

// ---------------------------------------------------------------------------
// 状态接口
// ---------------------------------------------------------------------------

interface PlayerState {
  // 状态
  isPlaying: boolean              // 是否正在播放
  currentTrack: Track | null      // 当前播放的歌曲
  playlist: Track[]               // 当前播放列表
  volume: number                  // 音量 (0-1)
  playMode: PlayMode              // 播放模式

  // actions
  setPlaying: (v: boolean) => void
  setCurrentTrack: (t: Track | null) => void
  setPlaylist: (list: Track[]) => void
  setVolume: (v: number) => void
  setPlayMode: (m: PlayMode) => void
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

  // --- 基础 setters ---

  setPlaying: (v) => set({ isPlaying: v }),

  setCurrentTrack: (t) => set({ currentTrack: t }),

  setPlaylist: (list) => set({ playlist: list }),

  setVolume: (v) => {
    // 限制在 0-1 范围内
    const volume = Math.max(0, Math.min(1, v))
    set({ volume })
  },

  setPlayMode: (m) => set({ playMode: m }),

  // --- 切歌逻辑 ---

  nextTrack: () => {
    const { playlist, currentTrack, playMode } = get()
    if (playlist.length === 0 || !currentTrack) return

    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id)

    if (playMode === 'shuffle') {
      // 随机模式：随机选一首（排除当前歌曲）
      if (playlist.length === 1) return
      let randomIndex
      do {
        randomIndex = Math.floor(Math.random() * playlist.length)
      } while (randomIndex === currentIndex)
      set({ currentTrack: playlist[randomIndex] })
    } else {
      // 顺序/单曲循环：下一首（到末尾循环回开头）
      const nextIndex = (currentIndex + 1) % playlist.length
      set({ currentTrack: playlist[nextIndex] })
    }
  },

  prevTrack: () => {
    const { playlist, currentTrack, playMode } = get()
    if (playlist.length === 0 || !currentTrack) return

    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id)

    if (playMode === 'shuffle') {
      // 随机模式：随机选一首
      if (playlist.length === 1) return
      let randomIndex
      do {
        randomIndex = Math.floor(Math.random() * playlist.length)
      } while (randomIndex === currentIndex)
      set({ currentTrack: playlist[randomIndex] })
    } else {
      // 顺序/单曲循环：上一首（到开头循环回末尾）
      const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length
      set({ currentTrack: playlist[prevIndex] })
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
