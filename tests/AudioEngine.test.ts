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

class FakeAudioElement {
  src = ''
  currentSrc = ''
  currentTime = 0
  duration = 0
  volume = 1
  paused = true
  error: { code: number; message: string } | null = null
  private listeners = new Map<string, Array<() => void>>()

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener()
  }

  load = vi.fn(() => {
    this.currentSrc = this.src
  })

  play = vi.fn(async () => {
    this.paused = false
  })

  pause = vi.fn(() => {
    this.paused = true
  })
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

describe('AudioEngine 加载提交权', () => {
  let audio: FakeAudioElement

  beforeEach(() => {
    vi.useFakeTimers()
    setAudioEngineEqualizerEnabled(true)
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('Audio', class {
      constructor() {
        audio = new FakeAudioElement()
        return audio
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('media error 应该返回安全 code 与发生时的 source generation', () => {
    const engine = new AudioEngine()
    const onError = vi.fn()
    engine.onError(onError)
    const identity = engine.load('qinplayer://audio/1?v=1')
    audio.emit('loadstart')
    audio.error = { code: 4, message: 'C:\\private\\track.mp3' }

    audio.emit('error')

    expect(onError).toHaveBeenCalledWith({
      code: 4,
      source: 'qinplayer://audio/1?v=1',
      generation: identity.generation,
    })
    expect(onError.mock.calls[0][0]).not.toHaveProperty('message')
  })

  it('每次公开 load 都应该递增 source generation', () => {
    const engine = new AudioEngine()

    const first = engine.load('qinplayer://audio/1?v=1')
    const second = engine.load('qinplayer://audio/2?v=1')

    expect(second.generation).toBeGreaterThan(first.generation)
    expect(second.source).toBe('qinplayer://audio/2?v=1')
  })

  it('loadedmetadata 应该携带当前 source identity', () => {
    const engine = new AudioEngine()
    const onLoadedMetadata = vi.fn()
    engine.onLoadedMetadata(onLoadedMetadata)
    const identity = engine.load('qinplayer://audio/1?v=1')
    audio.emit('loadstart')
    audio.duration = 180

    audio.emit('loadedmetadata')

    expect(onLoadedMetadata).toHaveBeenCalledWith(180, identity)
  })

  it('旧 generation 的错误 identity 可与当前 source 区分', () => {
    const engine = new AudioEngine()
    const errors: Array<{ source: string; generation: number }> = []
    engine.onError((error) => errors.push(error))
    const first = engine.load('qinplayer://audio/1?v=1')
    audio.emit('loadstart')
    audio.error = { code: 3, message: 'aborted old source' }
    audio.emit('error')
    const second = engine.load('qinplayer://audio/2?v=1')

    expect(errors[0]).toMatchObject(first)
    expect(errors[0].generation).not.toBe(second.generation)
  })

  it('destroy 后不再提交 media error', () => {
    const engine = new AudioEngine()
    const onError = vi.fn()
    engine.onError(onError)
    engine.load('qinplayer://audio/1?v=1')
    audio.emit('loadstart')

    engine.destroy()
    audio.error = { code: 4, message: 'late' }
    audio.emit('error')

    expect(onError).not.toHaveBeenCalled()
  })

  it('B commit 后、B loadstart 前的迟到 A error 不得标记成 B', () => {
    const engine = new AudioEngine()
    const onError = vi.fn()
    engine.onError(onError)
    engine.load('qinplayer://audio/1?v=1')
    audio.emit('loadstart')

    const second = engine.load('qinplayer://audio/2?v=1')
    audio.error = { code: 3, message: 'queued A error' }
    audio.emit('error')
    expect(onError).not.toHaveBeenCalled()

    audio.emit('loadstart')
    audio.error = { code: 4, message: 'B error' }
    audio.emit('error')
    expect(onError).toHaveBeenCalledWith({ ...second, code: 4 })
  })

  it('B commit 后、B loadstart 前的迟到 A metadata 不得标记成 B', () => {
    const engine = new AudioEngine()
    const onLoadedMetadata = vi.fn()
    engine.onLoadedMetadata(onLoadedMetadata)
    engine.load('qinplayer://audio/1?v=1')
    audio.emit('loadstart')

    const second = engine.load('qinplayer://audio/2?v=1')
    audio.duration = 111
    audio.emit('loadedmetadata')
    expect(onLoadedMetadata).not.toHaveBeenCalled()

    audio.emit('loadstart')
    audio.duration = 222
    audio.emit('loadedmetadata')
    expect(onLoadedMetadata).toHaveBeenCalledWith(222, second)
  })

  it('pending loadWithFade 不得覆盖更新的直接 load', async () => {
    const engine = new AudioEngine()
    await engine.play()
    const pending = engine.loadWithFade('qinplayer://audio/1?v=1', 100)

    engine.load('qinplayer://audio/2?v=1')
    await vi.advanceTimersByTimeAsync(100)
    await pending

    expect(audio.src).toBe('qinplayer://audio/2?v=1')
    expect(audio.load).toHaveBeenCalledTimes(1)
  })

  it('重叠 loadWithFade 只允许最新 operation commit', async () => {
    const engine = new AudioEngine()
    await engine.play()
    const first = engine.loadWithFade('qinplayer://audio/1?v=1', 100)
    const second = engine.loadWithFade('qinplayer://audio/2?v=1', 100)

    await vi.advanceTimersByTimeAsync(100)
    await Promise.all([first, second])

    expect(audio.src).toBe('qinplayer://audio/2?v=1')
    expect(audio.load).toHaveBeenCalledTimes(1)
  })

  it.each(['destroy', 'invalidate'] as const)('%s 应该使 pending fade 失去提交权', async (action) => {
    const engine = new AudioEngine()
    await engine.play()
    const pending = engine.loadWithFade('qinplayer://audio/1?v=1', 100)

    if (action === 'destroy') engine.destroy()
    else engine.invalidatePendingLoads()
    await vi.advanceTimersByTimeAsync(100)
    await pending

    expect(audio.load).not.toHaveBeenCalled()
    expect(audio.src).toBe('')
  })
})
