/**
 * Vitest 测试环境初始化
 */
import '@testing-library/jest-dom'

// 模拟 window.electronAPI（渲染进程的 Electron 桥接）
window.electronAPI = {
  getAudioUrl: (filePath: string) => `qinplayer://audio?path=${encodeURIComponent(filePath)}`,
  minimize: () => {},
  maximize: () => {},
  close: () => {},
  invoke: async () => null,
  on: () => () => {},
}
