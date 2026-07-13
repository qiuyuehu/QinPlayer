// =============================================================================
// QinPlayer — Mini 菜单专用预加载脚本
// =============================================================================
// 职责：只向短生命周期菜单窗口暴露初始化和结果回传能力
// =============================================================================

import { contextBridge, ipcRenderer } from 'electron'
import type { NativeTrackMenuAction, NativeTrackMenuWindowInit } from '../src/types/ipc'

contextBridge.exposeInMainWorld('contextMenuAPI', {
  getInit: (): Promise<NativeTrackMenuWindowInit | null> => ipcRenderer.invoke('context-menu:window-get-init'),
  ready: (): Promise<void> => ipcRenderer.invoke('context-menu:window-ready'),
  resolve: (action: NativeTrackMenuAction | null): Promise<void> => ipcRenderer.invoke('context-menu:window-resolve', { action }),
})
