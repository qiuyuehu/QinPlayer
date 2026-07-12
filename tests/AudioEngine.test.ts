import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioEngine, setAudioEngineEqualizerEnabled } from '../src/utils/AudioEngine'

class FakeAudioParam {
  value = 1
  cancelScheduledValues = vi.fn()
  linearRampToValueAtTime = vi.fn((value: number) => { this.value = value })
  setTargetAtTime = vi.fn((value: number) => { this.value = value })
  setValueAtTime = vi.fn((value: number) => { this.value = value })
}

class FakeNode {
  connections: FakeNode[] = []
  connect = vi.fn((node: FakeNode) => {
    this.connections.push(node)
    return node
  })
  disconnect = vi.fn()
}

class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam()
}

class FakeBiquadFilterNode extends FakeGainNode {
  type: BiquadFilterType = 'peaking'
  frequency = new FakeAudioParam()
  Q = new FakeAudioParam()

  getFrequencyResponse = vi.fn((_frequencies: Float32Array, magnitudes: Float32Array) => {
    magnitudes.fill(Math.pow(10, this.gain.value / 20))
  })
}

class FakeAudioContext {
  currentTime = 0
  sampleRate = 44100
  destination = new FakeNode()
  state: AudioContextState = 'running'
  close = vi.fn(async () => undefined)
  createBiquadFilter = vi.fn(() => new FakeBiquadFilterNode())
  createGain = vi.fn(() => new FakeGainNode())
  createMediaElementSource = vi.fn(() => new FakeNode())
  resume = vi.fn(async () => undefined)
}

interface AudioEngineInternals {
  _currentEqGains: number[]
  eqHeadroomGain: FakeGainNode
  fadeGain: FakeGainNode
  volumeGain: FakeGainNode
}

describe('AudioEngine 均衡器', () => {
  beforeEach(() => {
    setAudioEngineEqualizerEnabled(true)
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('应该始终保存完整的十段 EQ 状态', () => {
    const engine = new AudioEngine()
    engine.setEqGain(3, 5)

    const gains = (engine as unknown as AudioEngineInternals)._currentEqGains
    expect(gains).toHaveLength(10)
    expect(gains).toEqual([0, 0, 0, 5, 0, 0, 0, 0, 0, 0])
    expect(Object.keys(gains)).toHaveLength(10)
  })

  it.each([
    [-1, 5],
    [10, 5],
    [3, Number.NaN],
    [3, Number.POSITIVE_INFINITY],
    [3, 99],
  ])('应该拒绝非法单段增益 %#', (index, value) => {
    const engine = new AudioEngine()
    engine.setEqGain(index, value)

    expect((engine as unknown as AudioEngineInternals)._currentEqGains).toEqual(Array(10).fill(0))
  })

  it('应该拒绝非法批量 gains', () => {
    const engine = new AudioEngine()
    engine.setAllEqGains([0, 0, 0])
    engine.setAllEqGains(Array(10).fill(Number.NaN))

    expect((engine as unknown as AudioEngineInternals)._currentEqGains).toEqual(Array(10).fill(0))
  })

  it('淡入淡出不应该覆盖用户音量', () => {
    const engine = new AudioEngine()
    engine.fadeIn(100)
    engine.setVolume(0.35)
    engine.fadeIn(100)
    engine.fadeOut(100)

    const internals = engine as unknown as AudioEngineInternals
    expect(internals.volumeGain.gain.value).toBe(0.35)
    expect(internals.fadeGain.gain.value).toBe(0)
  })

  it('应该为正增益预设应用有限的 headroom', () => {
    const engine = new AudioEngine()
    engine.setAllEqGains([8, 10, 6, 2, 0, 0, 0, 2, 4, 2])
    engine.fadeIn(100)

    const headroom = (engine as unknown as AudioEngineInternals).eqHeadroomGain.gain.value
    expect(Number.isFinite(headroom)).toBe(true)
    expect(headroom).toBeGreaterThan(0)
    expect(headroom).toBeLessThan(1)
  })
})
