// =============================================================================
// QinPlayer — 播放控制状态管理 Store
// =============================================================================
// 职责：管理播放相关状态（当前曲目、播放列表、音量、播放模式）
// 设计：低频状态放 Zustand，高频状态（currentTime）用模块级 ref + RAF
//       useAudioSync hook 统一同步到 AudioEngine
// =============================================================================

import { create } from 'zustand'
import type { Track, PlayMode } from '../types'
import { currentTimeRef } from '../utils/currentTimeRef'
import { useUIStore } from './uiStore'

// ---------------------------------------------------------------------------
// 状态接口
// ---------------------------------------------------------------------------

interface PlayerState {
  // --- 播放状态 ---
  isPlaying: boolean              // 是否正在播放
  currentTrack: Track | null      // 当前播放的歌曲
  playlist: Track[]               // 当前播放列表
  priorityQueue: Track[]          // 尚未消费的优先待播 FIFO
  priorityResumeTrackId: number | null
  priorityConsumedTrackIds: number[]
  volume: number                  // 音量 (0-1)
  playMode: PlayMode              // 播放模式
  fadeEnabled: boolean            // 淡入淡出开关
  lyricOffset: number             // 歌词时间轴偏移量（秒）

  // --- 进度状态 ---
  duration: number                // 总时长（秒）—— 低频，每首歌只变一次
  seekTime: number | null         // 用户拖拽的目标时间（null = 未拖拽）

  // --- actions ---
  setPlaying: (v: boolean) => void
  setCurrentTrack: (t: Track | null) => void
  playTrack: (track: Track) => void
  setPlaylist: (list: Track[]) => void
  addToPriorityQueue: (track: Track) => void
  removeFromPriorityQueue: (trackId: number) => void
  clearPriorityQueue: () => void
  clearUpcoming: () => void
  setVolume: (v: number) => void
  setPlayMode: (m: PlayMode) => void
  setFadeEnabled: (v: boolean) => void
  setLyricOffset: (v: number) => void
  setDuration: (d: number) => void
  setSeekTime: (t: number | null) => void
  nextTrack: () => void
  prevTrack: () => void
}

// ---------------------------------------------------------------------------
// 播放模式循环顺序
// ---------------------------------------------------------------------------

const PLAY_MODE_ORDER: PlayMode[] = ['sequential', 'loop', 'shuffle']

function getTrackDuration(track: Track | null): number {
  return track && Number.isFinite(track.duration) ? Math.max(0, track.duration) : 0
}

function resetTrackProgress(): void {
  currentTimeRef.current = 0
}

// ---------------------------------------------------------------------------
// Store 创建
// ---------------------------------------------------------------------------

export const usePlayerStore = create<PlayerState>((set, get) => {
  const commitTrack = (track: Track, extraState: Partial<PlayerState> = {}): void => {
    const flags = useUIStore.getState().featureFlags
    if (!flags.playback) return

    resetTrackProgress()
    set({
      ...extraState,
      currentTrack: track,
      duration: getTrackDuration(track),
      isPlaying: true,
    })

    if (flags.recent) {
      void window.electronAPI.invoke('songs:recordPlay', { songId: track.id })
    }
    void window.electronAPI.invoke('songs:updatePlayCount', { songId: track.id })
  }

  return {
  // 初始状态
  isPlaying: false,
  currentTrack: null,
  playlist: [],
  priorityQueue: [],
  priorityResumeTrackId: null,
  priorityConsumedTrackIds: [],
  volume: 0.8,                    // 默认音量 80%
  playMode: 'sequential',         // 默认顺序播放
  fadeEnabled: true,              // 默认开启淡入淡出
  lyricOffset: 0,                 // 默认无偏移
  duration: 0,
  seekTime: null,

  // --- 基础 setters ---

  setPlaying: (v) => set({ isPlaying: v }),

  setCurrentTrack: (t) => {
    resetTrackProgress()
    set({ currentTrack: t, duration: getTrackDuration(t) })
  },

  // 用户主动播放代表新意图，必须取消尚未消费的插队状态。
  playTrack: (track) => {
    commitTrack(track, {
      priorityQueue: [],
      priorityResumeTrackId: null,
      priorityConsumedTrackIds: [],
    })
  },

  setPlaylist: (list) => set({
    playlist: list,
    priorityQueue: [],
    priorityResumeTrackId: null,
    priorityConsumedTrackIds: [],
  }),

  addToPriorityQueue: (track) => {
    const { currentTrack, priorityQueue } = get()
    if (currentTrack?.id === track.id || priorityQueue.some((item) => item.id === track.id)) return
    set({ priorityQueue: [...priorityQueue, track] })
  },

  removeFromPriorityQueue: (trackId) => {
    set((state) => ({ priorityQueue: state.priorityQueue.filter((track) => track.id !== trackId) }))
  },

  clearPriorityQueue: () => set({ priorityQueue: [] }),

  clearUpcoming: () => {
    const { playlist, currentTrack } = get()
    const currentIndex = currentTrack ? playlist.findIndex((track) => track.id === currentTrack.id) : -1
    set({
      playlist: currentIndex >= 0 ? playlist.slice(0, currentIndex + 1) : playlist,
      priorityQueue: [],
    })
  },

  setVolume: (v) => {
    const volume = Math.max(0, Math.min(1, v))
    set({ volume })
  },

  setPlayMode: (m) => set({ playMode: m }),

  setFadeEnabled: (v) => set({ fadeEnabled: v }),

  setLyricOffset: (v) => set({ lyricOffset: v }),

  setDuration: (d) => set({ duration: d }),

  setSeekTime: (t) => set({ seekTime: t }),

  // --- 切歌逻辑 ---

  nextTrack: () => {
    const flags = useUIStore.getState().featureFlags
    if (!flags.playback) return

    const state = get()
    const { playlist, currentTrack, playMode, priorityQueue, priorityResumeTrackId, priorityConsumedTrackIds } = state

    if (priorityQueue.length > 0) {
      const [nextPriorityTrack, ...remainingPriorityQueue] = priorityQueue
      commitTrack(nextPriorityTrack, {
        priorityQueue: remainingPriorityQueue,
        priorityResumeTrackId: priorityResumeTrackId ?? currentTrack?.id ?? null,
        priorityConsumedTrackIds: [...priorityConsumedTrackIds, nextPriorityTrack.id],
      })
      return
    }

    if (priorityResumeTrackId !== null) {
      const resumeIndex = playlist.findIndex((track) => track.id === priorityResumeTrackId)
      if (resumeIndex >= 0) {
        let restoredTrack: Track | undefined
        if (playMode === 'loop') {
          restoredTrack = playlist[resumeIndex]
        } else if (playMode === 'shuffle') {
          const candidates = playlist.filter((track) => track.id !== priorityResumeTrackId && !priorityConsumedTrackIds.includes(track.id))
          restoredTrack = candidates.length > 0
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : playlist.find((track) => track.id !== priorityResumeTrackId)
        } else {
          for (let offset = 1; offset <= playlist.length; offset++) {
            const candidate = playlist[(resumeIndex + offset) % playlist.length]
            if (!priorityConsumedTrackIds.includes(candidate.id)) {
              restoredTrack = candidate
              break
            }
          }
        }
        commitTrack(restoredTrack ?? playlist[resumeIndex], {
          priorityResumeTrackId: null,
          priorityConsumedTrackIds: [],
        })
        return
      }

      set({ priorityResumeTrackId: null, priorityConsumedTrackIds: [] })
    }

    if (playlist.length === 0 || !currentTrack) return
    const currentIndex = playlist.findIndex((track) => track.id === currentTrack.id)
    if (currentIndex < 0) return

    if (playMode === 'shuffle') {
      if (playlist.length === 1) return
      let randomIndex
      do {
        randomIndex = Math.floor(Math.random() * playlist.length)
      } while (randomIndex === currentIndex)
      commitTrack(playlist[randomIndex])
    } else {
      // 顺序/单曲循环：取下一首索引，到末尾则回到第一首
      const nextIndex = (currentIndex + 1) % playlist.length
      commitTrack(playlist[nextIndex])
    }
  },

  prevTrack: () => {
    const flags = useUIStore.getState().featureFlags
    if (!flags.playback) return

    const { playlist, currentTrack, playMode, priorityResumeTrackId } = get()
    if (priorityResumeTrackId !== null) {
      const resumeTrack = playlist.find((track) => track.id === priorityResumeTrackId)
      set({ priorityResumeTrackId: null, priorityConsumedTrackIds: [] })
      if (resumeTrack) commitTrack(resumeTrack)
      return
    }
    if (playlist.length === 0 || !currentTrack) return

    const currentIndex = playlist.findIndex((t) => t.id === currentTrack.id)
    if (currentIndex < 0) return

    if (playMode === 'shuffle') {
      if (playlist.length === 1) return
      let randomIndex
      do {
        randomIndex = Math.floor(Math.random() * playlist.length)
      } while (randomIndex === currentIndex)
      commitTrack(playlist[randomIndex])
    } else {
      // 顺序/单曲循环：取上一首索引，到开头则回到最后一首
      const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length
      commitTrack(playlist[prevIndex])
    }
  },
  }
})

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

type PersistentPlayerSettingKey = 'volume' | 'playMode' | 'lastTrackId'

let saveTimer: ReturnType<typeof setTimeout> | null = null
let suppressPlayerSettingsPersistence = false
const pendingPlayerSettings = new Map<PersistentPlayerSettingKey, string>()

function schedulePlayerSettingSave(key: PersistentPlayerSettingKey, value: string): void {
  pendingPlayerSettings.set(key, value)
  if (saveTimer) return

  saveTimer = setTimeout(() => {
    saveTimer = null
    const settings = Array.from(pendingPlayerSettings.entries())
    pendingPlayerSettings.clear()

    for (const [settingKey, settingValue] of settings) {
      window.electronAPI
        .invoke('settings:set', { key: settingKey, value: settingValue })
        .catch((error) => {
          console.error(`[PlayerStore] 保存设置 ${settingKey} 失败:`, error)
        })
    }
  }, 500)
}

// 只记录真正变化的持久化字段；无关状态不创建或延后 timer。
usePlayerStore.subscribe((state, previousState) => {
  if (suppressPlayerSettingsPersistence) return

  if (state.volume !== previousState.volume) {
    schedulePlayerSettingSave('volume', String(state.volume))
  }
  if (state.playMode !== previousState.playMode) {
    schedulePlayerSettingSave('playMode', state.playMode)
  }
  if (state.currentTrack?.id !== previousState.currentTrack?.id) {
    schedulePlayerSettingSave('lastTrackId', state.currentTrack ? String(state.currentTrack.id) : '')
  }
})

// 播放中每 5 秒保存 currentTime（独立定时器，不走防抖）
// 从 currentTimeRef 读取（不依赖 Zustand，避免高频 re-render）
let progressSaveTimer: ReturnType<typeof setInterval> | null = null
usePlayerStore.subscribe((state, previousState) => {
  if (state.isPlaying === previousState.isPlaying) return

  if (state.isPlaying && !progressSaveTimer) {
    progressSaveTimer = setInterval(() => {
      const ct = currentTimeRef.current
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
    if (!useUIStore.getState().featureFlags.playback) {
      console.log('[PlayerStore] playback=false，跳过播放状态恢复')
      return
    }

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
          state.duration = getTrackDuration(track)
          // 恢复播放进度（通过 seekTime，useAudioSync 加载后会自动 seek）
          if (lastTimeStr) {
            const lastTime = parseFloat(lastTimeStr)
            if (!isNaN(lastTime) && lastTime > 0) {
              state.seekTime = lastTime
              currentTimeRef.current = lastTime  // 写入共享 ref（不触发 re-render）
              console.log('[PlayerStore] 恢复进度:', lastTime, '秒')
            }
          }
          console.log('[PlayerStore] 恢复歌曲:', track.title)
        } else {
          console.log('[PlayerStore] 未找到 ID 为', songId, '的歌曲')
        }
      }
    }

    suppressPlayerSettingsPersistence = true
    try {
      usePlayerStore.setState(state)
    } finally {
      suppressPlayerSettingsPersistence = false
    }
    console.log('[PlayerStore] 恢复完成:', state)
  } catch (e) {
    console.error('[PlayerStore] 恢复状态失败:', e)
  }
}
