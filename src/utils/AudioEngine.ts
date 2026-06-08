// =============================================================================
// QinPlayer — Web Audio API 播放引擎
// =============================================================================
// 职责：封装音频播放核心逻辑，管理 AudioContext 生命周期
// 设计：基于 Web Audio API，通过 GainNode 控制音量，预留淡入淡出接口
// 注意：AudioContext 在用户首次交互前处于 suspended 状态，
//       必须在 play() 中调用 resume() 解锁
// =============================================================================

export class AudioEngine {
  // --- 核心节点 ---
  private audioContext: AudioContext
  private gainNode: GainNode
  private audioElement: HTMLAudioElement
  private sourceNode: MediaElementAudioSourceNode | null = null

  // --- 状态回调（外部注册）---
  private _onTimeUpdate: ((currentTime: number, duration: number) => void) | null = null
  private _onEnded: (() => void) | null = null
  private _onLoadedMetadata: ((duration: number) => void) | null = null

  // --- timeupdate 节流 ---
  private _lastUpdateTime = 0
  private readonly _updateInterval = 250  // 每 250ms 更新一次（约 4fps）

  constructor() {
    // 创建 AudioContext（Chrome 要求用户交互后才能 resume）
    this.audioContext = new AudioContext()

    // 创建 GainNode（音量控制）
    this.gainNode = this.audioContext.createGain()
    this.gainNode.connect(this.audioContext.destination)

    // 创建 HTMLAudioElement（用于加载和播放音频）
    this.audioElement = new HTMLAudioElement()
    this.audioElement.crossOrigin = 'anonymous'  // 允许跨域音频

    // 监听 timeupdate 事件（播放进度更新）
    this.audioElement.addEventListener('timeupdate', () => {
      const now = Date.now()
      // 节流：避免过于频繁的回调导致性能问题
      if (now - this._lastUpdateTime < this._updateInterval) return
      this._lastUpdateTime = now

      if (this._onTimeUpdate) {
        this._onTimeUpdate(this.audioElement.currentTime, this.audioElement.duration || 0)
      }
    })

    // 监听播放结束事件（自动切歌用）
    this.audioElement.addEventListener('ended', () => {
      if (this._onEnded) {
        this._onEnded()
      }
    })

    // 监听元数据加载完成（获取时长）
    this.audioElement.addEventListener('loadedmetadata', () => {
      if (this._onLoadedMetadata) {
        this._onLoadedMetadata(this.audioElement.duration)
      }
    })
  }

  // ---------------------------------------------------------------------------
  // 公开方法
  // ---------------------------------------------------------------------------

  /**
   * 加载音频文件
   * @param protocolUrl qinplayer:// 协议 URL（由 preload.getAudioUrl 生成）
   */
  load(protocolUrl: string): void {
    // 如果已经有 sourceNode，先断开
    // 注意：不能重复创建 MediaElementAudioSourceNode（会报错）
    if (!this.sourceNode) {
      // 首次加载：创建 MediaElementAudioSourceNode
      this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement)
      this.sourceNode.connect(this.gainNode)
    }

    this.audioElement.src = protocolUrl
    this.audioElement.load()
  }

  /**
   * 播放音频
   * 注意：首次播放前必须解锁 AudioContext（Chrome 自动播放策略）
   */
  async play(): Promise<void> {
    // 解锁 AudioContext（如果处于 suspended 状态）
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    return this.audioElement.play()
  }

  /**
   * 暂停播放
   */
  pause(): void {
    this.audioElement.pause()
  }

  /**
   * 设置音量 (0-1)
   * 使用 GainNode 实现，比直接设置 audioElement.volume 更灵活
   * （支持淡入淡出等高级功能）
   */
  setVolume(vol: number): void {
    const v = Math.max(0, Math.min(1, vol))
    // 使用 setTargetAtTime 实现平滑过渡，避免爆音
    this.gainNode.gain.setTargetAtTime(v, this.audioContext.currentTime, 0.01)
  }

  /**
   * 获取当前播放时间（秒）
   */
  get currentTime(): number {
    return this.audioElement.currentTime
  }

  /**
   * 设置播放位置（拖动进度条）
   */
  set currentTime(t: number) {
    this.audioElement.currentTime = t
  }

  /**
   * 获取总时长（秒）
   */
  get duration(): number {
    return this.audioElement.duration || 0
  }

  /**
   * 获取是否正在播放
   */
  get playing(): boolean {
    return !this.audioElement.paused
  }

  // ---------------------------------------------------------------------------
  // 事件回调注册
  // ---------------------------------------------------------------------------

  /** 注册播放进度更新回调 */
  onTimeUpdate(callback: (currentTime: number, duration: number) => void): void {
    this._onTimeUpdate = callback
  }

  /** 注册播放结束回调（用于自动切歌） */
  onEnded(callback: () => void): void {
    this._onEnded = callback
  }

  /** 注册元数据加载完成回调 */
  onLoadedMetadata(callback: (duration: number) => void): void {
    this._onLoadedMetadata = callback
  }

  // ---------------------------------------------------------------------------
  // 高级功能（Phase 3 实现）
  // ---------------------------------------------------------------------------

  /**
   * 淡入（从静音渐增到目标音量）
   * @param duration 淡入时长（毫秒）
   * @param targetVolume 目标音量 (0-1)
   */
  fadeIn(duration: number, targetVolume: number = 1): void {
    const gain = this.gainNode.gain
    gain.setValueAtTime(0, this.audioContext.currentTime)
    gain.linearRampToValueAtTime(
      targetVolume,
      this.audioContext.currentTime + duration / 1000
    )
  }

  /**
   * 淡出（从当前音量渐减到静音）
   * @param duration 淡出时长（毫秒）
   */
  fadeOut(duration: number): void {
    const gain = this.gainNode.gain
    const currentVolume = gain.value
    gain.setValueAtTime(currentVolume, this.audioContext.currentTime)
    gain.linearRampToValueAtTime(0, this.audioContext.currentTime + duration / 1000)
  }

  /**
   * 销毁引擎，释放资源
   */
  destroy(): void {
    this.audioElement.pause()
    this.audioElement.src = ''
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close()
    }
  }
}

// ---------------------------------------------------------------------------
// 单例（全局唯一播放引擎实例）
// ---------------------------------------------------------------------------
// 渲染进程中所有组件共享同一个 AudioEngine 实例
// 通过 React Context 或直接 import 使用

let engineInstance: AudioEngine | null = null

export function getAudioEngine(): AudioEngine {
  if (!engineInstance) {
    engineInstance = new AudioEngine()
  }
  return engineInstance
}
