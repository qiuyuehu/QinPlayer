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
  fadeEnabled: boolean            // 淡入淡出开关

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
  setFadeEnabled: (v: boolean) => void
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
  fadeEnabled: true,              // 默认开启淡入淡出
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

  setFadeEnabled: (v) => set({ fadeEnabled: v }),

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

// ---------------------------------------------------------------------------
// 状态持久化（保存到 SQLite settings 表）
// ---------------------------------------------------------------------------
// 只保存关键设置，不保存 currentTime（进度位置）
// 防抖保存，避免频繁写入
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null

/** 防抖保存播放状态到数据库 */
function debouncedSave(state: PlayerState): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const settings = [
      { key: 'volume', value: String(state.volume) },
      { key: 'playMode', value: state.playMode },
      { key: 'lastTrackId', value: state.currentTrack ? String(state.currentTrack.id) : '' },
    ]
    for (const s of settings) {
      window.electronAPI.invoke('settings:set', s).catch(() => {})
    }
  }, 500)
}

// 监听 store 变化，自动保存（排除 currentTime 高频更新）
usePlayerStore.subscribe((state) => {
  debouncedSave(state)
})

// 播放中每 5 秒保存 currentTime（独立定时器，不走防抖）
let progressSaveTimer: ReturnType<typeof setInterval> | null = null
usePlayerStore.subscribe((state) => {
  if (state.isPlaying && !progressSaveTimer) {
    progressSaveTimer = setInterval(() => {
      const ct = usePlayerStore.getState().currentTime
      if (ct > 0) {
        window.electronAPI.invoke('settings:set', { key: 'lastCurrentTime', value: String(ct) }).catch(() => {})
      }
    }, 5000)
  } else if (!state.isPlaying && progressSaveTimer) {
    clearInterval(progressSaveTimer)
    progressSaveTimer = null
  }
})

/** 启动时从数据库恢复播放状态 */
export async function restorePlayerState(): Promise<void> {
  try {
    const [volumeStr, playMode, lastTrackId, lastTimeStr] = await Promise.all([
      window.electronAPI.invoke('settings:get', { key: 'volume' }) as Promise<string | null>,
      window.electronAPI.invoke('settings:get', { key: 'playMode' }) as Promise<string | null>,
      window.electronAPI.invoke('settings:get', { key: 'lastTrackId' }) as Promise<string | null>,
      window.electronAPI.invoke('settings:get', { key: 'lastCurrentTime' }) as Promise<string | null>,
    ])

    console.log('[PlayerStore] 恢复状态 - volume:', volumeStr, 'playMode:', playMode, 'lastTrackId:', lastTrackId, 'lastTime:', lastTimeStr)

    const state: Partial<PlayerState> = {}

    // 恢复音量
    if (volumeStr) {
      const v = parseFloat(volumeStr)
      if (!isNaN(v)) state.volume = v
    }

    // 恢复播放模式
    if (playMode && ['sequential', 'loop', 'shuffle'].includes(playMode)) {
      state.playMode = playMode as PlayMode
    }

    // 恢复上次播放的歌曲
    if (lastTrackId) {
      const songId = parseInt(lastTrackId, 10)
      if (!isNaN(songId)) {
        const allSongs = await window.electronAPI.invoke('songs:getAll') as Track[]
        console.log('[PlayerStore] 数据库歌曲数:', allSongs.length, '查找 ID:', songId)
        const track = allSongs.find(s => s.id === songId)
        if (track) {
          state.currentTrack = track
          state.playlist = allSongs
          // 恢复播放进度（通过 seekTime，useAudioSync 加载后会自动 seek）
          if (lastTimeStr) {
            const lastTime = parseFloat(lastTimeStr)
            if (!isNaN(lastTime) && lastTime > 0) {
              state.seekTime = lastTime
              state.currentTime = lastTime
              console.log('[PlayerStore] 恢复进度:', lastTime, '秒')
            }
          }
          console.log('[PlayerStore] 恢复歌曲:', track.title)
        } else {
          console.log('[PlayerStore] 未找到 ID 为', songId, '的歌曲')
        }
      }
    }

    usePlayerStore.setState(state)
    console.log('[PlayerStore] 恢复完成:', state)
  } catch (e) {
    console.error('[PlayerStore] 恢复状态失败:', e)
  }
}
