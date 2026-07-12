import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const audioEngine = vi.hoisted(() => ({
  setEqGain: vi.fn(),
  setAllEqGains: vi.fn(),
}))

vi.mock('../src/utils/AudioEngine', () => ({
  getAudioEngine: () => audioEngine,
}))

import { EQ_PRESETS, useEqStore } from '../src/stores/eqStore'

describe('均衡器状态', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    audioEngine.setEqGain.mockClear()
    audioEngine.setAllEqGains.mockClear()
    useEqStore.setState({ gains: Array(10).fill(0), activePreset: null, loaded: false })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('非法单段增益应该被忽略', () => {
    const before = useEqStore.getState().gains

    useEqStore.getState().setGain(3, Number.NaN)
    useEqStore.getState().setGain(3, Number.POSITIVE_INFINITY)
    useEqStore.getState().setGain(3, 99)

    expect(useEqStore.getState().gains).toEqual(before)
    expect(audioEngine.setEqGain).not.toHaveBeenCalled()
  })

  it('应用预设应该一次性提交完整 gains', () => {
    const rock = EQ_PRESETS.find((preset) => preset.name === 'rock')!

    useEqStore.getState().applyPreset('rock')

    expect(useEqStore.getState().gains).toEqual(rock.gains)
    expect(audioEngine.setAllEqGains).toHaveBeenCalledTimes(1)
    expect(audioEngine.setAllEqGains).toHaveBeenCalledWith(rock.gains)
    expect(audioEngine.setEqGain).not.toHaveBeenCalled()
  })
})
