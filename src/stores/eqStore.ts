// =============================================================================
// QinPlayer — 均衡器状态管理 Store
// =============================================================================
// 职责：管理 10 段均衡器增益状态、预设切换、持久化
// 设计：修改增益时同步更新 audioEngine + 防抖保存到数据库
// =============================================================================

import { create } from 'zustand'
import { getAudioEngine } from '../utils/AudioEngine'

// ---------------------------------------------------------------------------
// 常量定义
// ---------------------------------------------------------------------------

/** 频段标签（与 BiquadFilterNode 频率一一对应） */
export const EQ_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'] as const

/** 增益范围 */
export const EQ_MIN = -12
export const EQ_MAX = 12

/** 均衡器预设定义 */
export interface EqPreset {
  name: string      // 预设名称
  label: string     // 显示文字
  gains: readonly number[]  // 10 个频段增益（dB）
}

/** 预设列表 */
export const EQ_PRESETS: readonly EqPreset[] = [
  {
    name: 'pop',
    label: '流行',
    gains: [0, 2, 4, 2, 0, 2, 4, 4, 2, 0],
  },
  {
    name: 'rock',
    label: '摇滚',
    gains: [4, 6, 4, 2, 0, 2, 4, 6, 4, 2],
  },
  {
    name: 'classical',
    label: '古典',
    gains: [0, 0, 0, 0, 0, 0, 0, 2, 4, 6],
  },
  {
    name: 'bass',
    label: '低音增强',
    gains: [8, 10, 6, 2, 0, 0, 0, 2, 4, 2],
  },
  {
    name: 'vocal',
    label: '人声突出',
    gains: [-2, -1, 2, 4, 6, 4, 2, 0, -1, -2],
  },
]

/** 默认增益（全部归零） */
const DEFAULT_GAINS: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

// ---------------------------------------------------------------------------
// Store 接口
// ---------------------------------------------------------------------------

interface EqState {
  /** 10 个频段的增益值（dB），索引 0-9 对应 32Hz-16kHz */
  gains: number[]
  /** 当前激活的预设名称（null 表示自定义/未选中任何预设） */
  activePreset: string | null
  /** 是否已从数据库加载完成 */
  loaded: boolean

  /** 设置单个频段增益 */
  setGain: (index: number, value: number) => void
  /** 应用预设（批量更新增益） */
  applyPreset: (presetName: string) => void
  /** 全部重置为 0dB */
  resetAll: () => void
  /** 从数据库加载均衡器设置 */
  loadFromDb: () => Promise<void>
  /** 标记加载完成 */
  setLoaded: (loaded: boolean) => void
}

// ---------------------------------------------------------------------------
// 防抖保存
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null

/** 防抖保存均衡器增益到数据库（500ms） */
function debouncedSave(gains: number[]): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.electronAPI.invoke('eq:save', { gains }).catch(() => {})
  }, 500)
}

// ---------------------------------------------------------------------------
// Store 创建
// ---------------------------------------------------------------------------

export const useEqStore = create<EqState>((set, get) => ({
  // 初始状态
  gains: [...DEFAULT_GAINS],
  activePreset: null,
  loaded: false,

  /** 设置单个频段增益，同步到 audioEngine + 防抖保存 */
  setGain: (index, value) => {
    if (!Number.isInteger(index) || index < 0 || index >= DEFAULT_GAINS.length || !Number.isFinite(value) || value < EQ_MIN || value > EQ_MAX) return

    const newGains = [...get().gains]
    newGains[index] = Math.round(value * 10) / 10  // 保留一位小数

    // 检查是否匹配某个预设
    const matchedPreset = EQ_PRESETS.find(p =>
      p.gains.every((g, i) => g === newGains[i])
    )

    set({ gains: newGains, activePreset: matchedPreset?.name || null })

    // 同步到音频引擎
    getAudioEngine().setEqGain(index, newGains[index])

    // 防抖保存
    debouncedSave(newGains)
  },

  /** 应用预设（批量更新所有频段增益） */
  applyPreset: (presetName) => {
    const preset = EQ_PRESETS.find(p => p.name === presetName)
    if (!preset) return

    const newGains = [...preset.gains]
    set({ gains: newGains, activePreset: presetName })

    // 单次提交完整状态，避免预设经过 10 个中间状态。
    getAudioEngine().setAllEqGains(newGains)

    // 防抖保存
    debouncedSave(newGains)
  },

  /** 全部重置为 0dB */
  resetAll: () => {
    const newGains = [...DEFAULT_GAINS]
    set({ gains: newGains, activePreset: null })

    // 同步到音频引擎
    getAudioEngine().setAllEqGains(newGains)

    // 防抖保存
    debouncedSave(newGains)
  },

  /** 从数据库加载均衡器设置 */
  loadFromDb: async () => {
    try {
      const saved = await window.electronAPI.invoke('eq:get') as string | null
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length === 10) {
          const gains = parsed.map((g: unknown) => {
            const num = Number(g)
            return Math.max(EQ_MIN, Math.min(EQ_MAX, Number.isFinite(num) ? Math.round(num * 10) / 10 : 0))
          })

          // 检查是否匹配某个预设
          const matchedPreset = EQ_PRESETS.find(p =>
            p.gains.every((g, i) => g === gains[i])
          )

          set({ gains, activePreset: matchedPreset?.name || null })

          // 同步到音频引擎（如果已初始化）
          try {
            const engine = getAudioEngine()
            engine.setAllEqGains(gains)
          } catch {
            // audioEngine 可能还未初始化（首次播放前），忽略
          }

          console.log('[EqStore] 从数据库加载均衡器设置:', gains)
        }
      }
    } catch (e) {
      console.error('[EqStore] 加载均衡器设置失败:', e)
    } finally {
      set({ loaded: true })
    }
  },

  /** 标记加载完成 */
  setLoaded: (loaded) => set({ loaded }),
}))
