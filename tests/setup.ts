/**
 * Vitest 测试环境初始化
 */
import '@testing-library/jest-dom'

// 模拟 window.electronAPI（渲染进程的 Electron 桥接）
window.electronAPI = {
  getAudioUrl: (filePath: string) => `qinplayer://audio?path=${encodeURIComponent(filePath)}`,
  getCoverUrl: (filePath: string) => `qinplayer://cover?path=${encodeURIComponent(filePath)}`,
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
