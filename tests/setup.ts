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
  }),
  invoke: async () => null,
  send: () => {},
  on: () => () => {},
}
