/**
 * Vitest 测试环境初始化
 */
import '@testing-library/jest-dom'

const originalConsoleError = console.error.bind(console)
console.error = (...args: unknown[]): void => {
  const isActWarning = args.some((arg) => (
    typeof arg === 'string'
    && (arg.includes('not wrapped in act') || arg.includes('wrap-tests-with-act'))
  ))
  if (isActWarning) {
    throw new Error('[TestSetup] 检测到 React act warning，请等待异步更新或使用 act。')
  }
  originalConsoleError(...args)
}

// JSDOM 未实现 AnimationEvent；补齐后 React 会监听浏览器标准 animationend。
if (!('AnimationEvent' in window)) {
  class TestAnimationEvent extends Event {}
  Object.defineProperty(window, 'AnimationEvent', {
    configurable: true,
    value: TestAnimationEvent,
  })
}

// 模拟 window.electronAPI（渲染进程的 Electron 桥接）
window.electronAPI = {
  getAudioUrl: (songId: number, mtime: number) => `qinplayer://audio?id=${songId}&v=${encodeURIComponent(String(mtime))}`,
  getCoverUrl: (songId: number, mtime: number) => `qinplayer://cover?id=${songId}&v=${encodeURIComponent(String(mtime))}`,
  getAvatarUrl: (avatarPath: string) => {
    const fileName = avatarPath.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
    return `qinplayer://avatar?id=current&v=${encodeURIComponent(fileName)}`
  },
  minimize: () => {},
  maximize: () => {},
  close: () => {},
  setAlwaysOnTop: () => {},
  getFeatureFlags: async () => ({
    playback: true,
    equalizer: true,
    lyrics: true,
    albums: true,
    recent: true,
    liked: true,
    profile: true,
    search: true,
    miniMode: true,
    tray: true,
    playlists: true,
    settings: true,
    fadeEffect: true,
    mediaSession: true,
    queuePanel: true,
    lyricsMoreLines: true,
    windowSizePersist: true,
  }),
  invoke: async () => null,
  send: () => {},
  on: () => () => {},
}

// 歌词页依赖 RAF 驱动进度；单元测试只需稳定的调度 ID，不执行循环回调。
if (!globalThis.requestAnimationFrame) {
  let rafId = 0
  globalThis.requestAnimationFrame = (_cb: FrameRequestCallback) => ++rafId
  globalThis.cancelAnimationFrame = (_id: number) => {}
}
