// =============================================================================
// QinPlayer — Web Audio API 播放引擎
// =============================================================================
// 职责：封装音频播放核心逻辑，管理 AudioContext 生命周期
// 设计：
//   - 基础播放直接用 HTMLAudioElement（简单可靠）
//   - Web Audio API（GainNode）仅在需要淡入淡出时接入
//   - AudioContext 在用户首次交互后才创建（避免白屏）
// =============================================================================

// 均衡器频段频率（10段：32/64/125/250/500/1k/2k/4k/8k/16kHz）
const EQ_FREQUENCIES: readonly number[] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export class AudioEngine {
  // --- 核心节点 ---
  private audioContext: AudioContext | null = null  // 延迟创建
  private gainNode: GainNode | null = null
  private audioElement: HTMLAudioElement
  private sourceNode: MediaElementAudioSourceNode | null = null
  private webAudioConnected = false  // 是否已接入 Web Audio 图

  // --- 均衡器节点链 ---
  private eqFilters: BiquadFilterNode[] = []  // 10段 peaking 滤波器
  private _pendingEqGains: number[] = []  // 等待应用的均衡器增益（Web Audio 接入前缓存）

  // --- 状态回调（外部注册）---
  private _onTimeUpdate: ((currentTime: number, duration: number) => void) | null = null
  private _onEnded: (() => void) | null = null
  private _onLoadedMetadata: ((duration: number) => void) | null = null

  // --- timeupdate 节流 ---
  private _lastUpdateTime = 0
  private readonly _updateInterval = 250  // 每 250ms 更新一次（约 4fps，避免高频 setState）

  // --- loadWithFade 竞态防护 ---
  // 每次 loadWithFade 调用递增 generation ID，过期的 setTimeout 直接 return
  private _fadeGeneration = 0

  constructor() {
    // 创建 HTMLAudioElement（基础播放用，不依赖 Web Audio API）
    // 注意：不能用 new HTMLAudioElement()，会报 Illegal constructor
    this.audioElement = new Audio()

    // 监听 timeupdate 事件（播放进度更新）
    // 节流：每 250ms 最多触发一次，避免高频 setState 导致性能问题
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

    // 创建均衡器 BiquadFilterNode 链（10段 peaking 滤波器）
    // 每个滤波器对应一个频段，初始增益为 0dB（平直）
    this.eqFilters = EQ_FREQUENCIES.map((freq) => {
      const filter = this.audioContext!.createBiquadFilter()
      filter.type = 'peaking'
      filter.frequency.value = freq
      filter.Q.value = 1.4  // 中等 Q 值，相邻频段自然过渡
      filter.gain.value = 0  // 默认 0dB（不增不减）
      return filter
    })

    // 创建 GainNode（音量控制 + 淡入淡出）
    this.gainNode = this.audioContext.createGain()
    this.gainNode.connect(this.audioContext.destination)

    // 创建 MediaElementAudioSourceNode（只能创建一次）
    if (!this.sourceNode) {
      this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement)
    }

    // 连接信号链：source → eq[0] → eq[1] → ... → eq[9] → gainNode → destination
    // 先断开旧连接（如果有的话）
    this.sourceNode.disconnect()
    let lastNode: AudioNode = this.sourceNode
    for (const filter of this.eqFilters) {
      lastNode.connect(filter)
      lastNode = filter
    }
    lastNode.connect(this.gainNode)

    // 应用等待中的均衡器增益（eqStore 在 audioEngine 初始化前可能已加载数据库设置）
    if (this._pendingEqGains.length > 0) {
      for (let i = 0; i < this.eqFilters.length && i < this._pendingEqGains.length; i++) {
        this.eqFilters[i].gain.value = this._pendingEqGains[i]
      }
      this._pendingEqGains = []
    }

    // ⚠️ 同步当前音量到 GainNode（防止接入 Web Audio 后音量断层）
    // 接入前用 audioElement.volume 控制音量，接入后用 gainNode.gain
    // 必须在 webAudioConnected = true 之前同步，否则 setVolume 会走错分支
    const currentVol = this.audioElement.volume
    this.gainNode.gain.setValueAtTime(currentVol, this.audioContext.currentTime)

    this.webAudioConnected = true
  }

  // ---------------------------------------------------------------------------
  // 公开方法（外部通过这些方法控制播放，不直接操作内部节点）
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
      // "default" 设备 ID 不被 Electron AudioContext 识别，跳过 setSinkId
      // 此时使用系统默认设备，不需要显式设置
      if (deviceId === 'default') {
        console.log('[AudioEngine] 使用系统默认输出设备')
        localStorage.setItem('qinplayer-output-device', deviceId)
        return
      }

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
  // 均衡器（需要 Web Audio API）
  // ---------------------------------------------------------------------------

  /**
   * 获取均衡器频段频率数组（供 UI 组件渲染频段标签）
   * @returns 10 个频段频率（Hz）
   */
  getEqFrequencies(): readonly number[] {
    return EQ_FREQUENCIES
  }

  /**
   * 设置均衡器单个频段增益
   * @param index 频段索引（0-9）
   * @param value 增益值（-12 ~ +12 dB）
   */
  setEqGain(index: number, value: number): void {
    if (this.eqFilters[index]) {
      // 滤波器已创建，直接设置增益
      this.eqFilters[index].gain.value = value
    } else {
      // 滤波器未创建（Web Audio 未接入），缓存到 pending 数组
      this._pendingEqGains[index] = value
    }
  }

  /**
   * 批量设置均衡器所有频段增益
   * @param gains 10 个增益值的数组（-12 ~ +12 dB）
   */
  setAllEqGains(gains: readonly number[]): void {
    if (this.eqFilters.length > 0) {
      // 滤波器已创建，直接设置
      for (let i = 0; i < this.eqFilters.length && i < gains.length; i++) {
        this.eqFilters[i].gain.value = gains[i]
      }
    } else {
      // 滤波器未创建，缓存到 pending 数组
      this._pendingEqGains = [...gains]
    }
  }

  // ---------------------------------------------------------------------------
  // 高级功能（需要 Web Audio API）
  // ---------------------------------------------------------------------------

  /**
   * 淡入（从静音渐增到目标音量）
   * ⚠️ 暗礁 6：先 cancelScheduledValues 清理之前的调度，防止快速切歌音量归零
   * @param duration 淡入时长（毫秒）
   * @param targetVolume 目标音量 (0-1)
   */
  fadeIn(duration: number, targetVolume: number = 1): void {
    this.ensureWebAudio()
    const gain = this.gainNode!.gain
    const currentTime = this.audioContext!.currentTime

    // ⚠️ 关键：先清理之前的调度，防止多个 linearRamp 打架
    gain.cancelScheduledValues(currentTime)
    gain.setValueAtTime(0, currentTime)
    gain.linearRampToValueAtTime(targetVolume, currentTime + duration / 1000)
  }

  /**
   * 淡出（从当前音量渐减到静音）
   * ⚠️ 暗礁 6：先 cancelScheduledValues 清理之前的调度
   * @param duration 淡出时长（毫秒）
   */
  fadeOut(duration: number): void {
    this.ensureWebAudio()
    const gain = this.gainNode!.gain
    const currentTime = this.audioContext!.currentTime
    const currentVolume = gain.value

    // ⚠️ 关键：先清理之前的调度
    gain.cancelScheduledValues(currentTime)
    gain.setValueAtTime(currentVolume, currentTime)
    gain.linearRampToValueAtTime(0, currentTime + duration / 1000)
  }

  /**
   * 切歌时的淡入淡出流程
   * 1. fadeOut 当前歌曲（异步，不等待）
   * 2. load 新歌曲
   * 3. play 后 fadeIn
   *
   * @param protocolUrl 新歌曲的 qinplayer:// 协议 URL
   * @param fadeDuration 淡入淡出时长（毫秒），默认 500ms
   */
  async loadWithFade(protocolUrl: string, fadeDuration: number = 500): Promise<void> {
    // 递增 generation ID，标识本次切歌
    const myGeneration = ++this._fadeGeneration

    // 1. 淡出当前歌曲
    if (this.playing && this.webAudioConnected) {
      this.fadeOut(fadeDuration)
      // 等淡出动画完成（如果期间有新的 loadWithFade 调用，直接 return）
      await new Promise(resolve => setTimeout(resolve, fadeDuration))
      // ⚠️ 竞态检查：如果期间有新的切歌，本次作废
      if (this._fadeGeneration !== myGeneration) {
        console.log('[AudioEngine] loadWithFade 被新切歌覆盖，跳过')
        return
      }
    }

    // 2. 加载新歌曲
    this.load(protocolUrl)

    // 3. 播放
    await this.play()

    // 4. 淡入新歌曲（再次检查 generation，防止极端情况）
    if (this._fadeGeneration !== myGeneration) return
    if (this.webAudioConnected) {
      this.fadeIn(fadeDuration)
    }
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
