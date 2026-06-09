// =============================================================================
// QinPlayer — Web Audio API 播放引擎
// =============================================================================
// 职责：封装音频播放核心逻辑，管理 AudioContext 生命周期
// 设计：
//   - 基础播放直接用 HTMLAudioElement（简单可靠）
//   - Web Audio API（GainNode）仅在需要淡入淡出时接入
//   - AudioContext 在用户首次交互后才创建（避免白屏）
// =============================================================================

export class AudioEngine {
  // --- 核心节点 ---
  private audioContext: AudioContext | null = null  // 延迟创建
  private gainNode: GainNode | null = null
  private audioElement: HTMLAudioElement
  private sourceNode: MediaElementAudioSourceNode | null = null
  private webAudioConnected = false  // 是否已接入 Web Audio 图

  // --- 状态回调（外部注册）---
  private _onTimeUpdate: ((currentTime: number, duration: number) => void) | null = null
  private _onEnded: (() => void) | null = null
  private _onLoadedMetadata: ((duration: number) => void) | null = null

  // --- timeupdate 节流 ---
  private _lastUpdateTime = 0
  private readonly _updateInterval = 250  // 每 250ms 更新一次（约 4fps）

  constructor() {
    // 创建 HTMLAudioElement（基础播放用，不依赖 Web Audio API）
    this.audioElement = new Audio()

    // 监听 timeupdate 事件（播放进度更新）
    this.audioElement.addEventListener('timeupdate', () => {
      const now = Date.now()
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

    // 监听加载错误
    this.audioElement.addEventListener('error', () => {
      const err = this.audioElement.error
      console.error('[AudioEngine] 加载错误:', err?.code, err?.message, 'src:', this.audioElement.src)
    })
  }

  // ---------------------------------------------------------------------------
  // 确保 Web Audio API 已接入（延迟初始化，需要用户交互上下文）
  // ---------------------------------------------------------------------------
  private ensureWebAudio(): void {
    if (this.webAudioConnected) return

    // 创建 AudioContext（需要用户交互上下文）
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }

    // 解锁 AudioContext
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }

    // 创建 GainNode
    this.gainNode = this.audioContext.createGain()
    this.gainNode.connect(this.audioContext.destination)

    // 创建 MediaElementAudioSourceNode（只能创建一次）
    if (!this.sourceNode) {
      this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement)
      this.sourceNode.connect(this.gainNode)
    }

    this.webAudioConnected = true
  }

  // ---------------------------------------------------------------------------
  // 公开方法
  // ---------------------------------------------------------------------------

  /**
   * 加载音频文件
   * @param protocolUrl qinplayer:// 协议 URL（由 preload.getAudioUrl 生成）
   */
  load(protocolUrl: string): void {
    console.log('[AudioEngine] 加载:', protocolUrl)
    this.audioElement.src = protocolUrl
    this.audioElement.load()
  }

  /**
   * 播放音频
   * 注意：首次播放前必须解锁 AudioContext（Chrome 自动播放策略）
   */
  async play(): Promise<void> {
    // 首次播放时接入 Web Audio API（此时已有用户交互上下文）
    this.ensureWebAudio()

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
   * 如果 Web Audio 已接入，用 GainNode（支持淡入淡出）
   * 否则用 audioElement.volume（基础音量控制）
   */
  setVolume(vol: number): void {
    const v = Math.max(0, Math.min(1, vol))
    if (this.gainNode && this.webAudioConnected) {
      this.gainNode.gain.setTargetAtTime(v, this.audioContext!.currentTime, 0.01)
    } else {
      this.audioElement.volume = v
    }
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
  // 音频输出设备切换
  // ---------------------------------------------------------------------------

  /**
   * 获取当前选中的输出设备 ID
   * 优先从 localStorage 读取持久化偏好，否则返回 'default'
   */
  getOutputDeviceId(): string {
    return localStorage.getItem('qinplayer-output-device') || 'default'
  }

  /**
   * 切换音频输出设备
   * 优先用 AudioContext.setSinkId()（Web Audio API 接入后音频由 AudioContext 控制）
   * 回退用 HTMLAudioElement.setSinkId()（Web Audio 未接入时）
   * @param deviceId 设备 ID（从 enumerateDevices 获取）或 'default' 恢复默认
   */
  async setOutputDevice(deviceId: string): Promise<void> {
    // 检查浏览器是否支持 setSinkId
    if (!('setSinkId' in this.audioElement)) {
      console.warn('[AudioEngine] 当前环境不支持 setSinkId')
      return
    }

    try {
      // Web Audio API 已接入时，用 AudioContext.setSinkId()
      // 因为此时音频输出由 AudioContext 控制，HTMLAudioElement.setSinkId() 无效
      if (this.audioContext && this.webAudioConnected) {
        await (this.audioContext as any).setSinkId(deviceId)
        console.log('[AudioEngine] AudioContext 输出设备已切换为:', deviceId)
      } else {
        // Web Audio 未接入时，用 HTMLAudioElement.setSinkId()
        await (this.audioElement as any).setSinkId(deviceId)
        console.log('[AudioEngine] AudioElement 输出设备已切换为:', deviceId)
      }

      // 持久化用户选择
      localStorage.setItem('qinplayer-output-device', deviceId)
    } catch (err) {
      console.error('[AudioEngine] 切换输出设备失败:', err)
      throw err
    }
  }

  /**
   * 枚举可用的音频输出设备
   * 返回所有 audiooutput 类型的设备列表
   */
  async enumerateOutputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.filter(d => d.kind === 'audiooutput')
    } catch (err) {
      console.error('[AudioEngine] 枚举音频设备失败:', err)
      return []
    }
  }

  // ---------------------------------------------------------------------------
  // 高级功能（需要 Web Audio API）
  // ---------------------------------------------------------------------------

  /**
   * 淡入（从静音渐增到目标音量）
   * @param duration 淡入时长（毫秒）
   * @param targetVolume 目标音量 (0-1)
   */
  fadeIn(duration: number, targetVolume: number = 1): void {
    this.ensureWebAudio()
    const gain = this.gainNode!.gain
    gain.setValueAtTime(0, this.audioContext!.currentTime)
    gain.linearRampToValueAtTime(
      targetVolume,
      this.audioContext!.currentTime + duration / 1000
    )
  }

  /**
   * 淡出（从当前音量渐减到静音）
   * @param duration 淡出时长（毫秒）
   */
  fadeOut(duration: number): void {
    this.ensureWebAudio()
    const gain = this.gainNode!.gain
    const currentVolume = gain.value
    gain.setValueAtTime(currentVolume, this.audioContext!.currentTime)
    gain.linearRampToValueAtTime(0, this.audioContext!.currentTime + duration / 1000)
  }

  /**
   * 销毁引擎，释放资源
   */
  destroy(): void {
    this.audioElement.pause()
    this.audioElement.src = ''
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
    }
  }
}

// ---------------------------------------------------------------------------
// 单例（全局唯一播放引擎实例）
// ---------------------------------------------------------------------------

let engineInstance: AudioEngine | null = null

/** 获取 AudioEngine 单例（懒初始化，首次调用时创建） */
export function getAudioEngine(): AudioEngine {
  if (!engineInstance) {
    engineInstance = new AudioEngine()
  }
  return engineInstance
}

/** 检查引擎是否已被创建（不触发创建） */
export function hasAudioEngine(): boolean {
  return engineInstance !== null
}
