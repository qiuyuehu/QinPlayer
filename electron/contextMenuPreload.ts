// =============================================================================
// QinPlayer — Mini 菜单专用预加载脚本
// =============================================================================
// 职责：只向短生命周期菜单窗口暴露初始化和结果回传能力
// =============================================================================

import { contextBridge, ipcRenderer } from 'electron'
import type {
  ContextMenuInvokeArgs,
  ContextMenuInvokeChannel,
  ContextMenuInvokeResult,
  NativeTrackMenuAction,
} from '../src/types/ipc'
import type { ContextMenuWindowAPI } from '../src/types/electron'

function invokeContextMenu<C extends ContextMenuInvokeChannel>(
  channel: C,
  ...args: ContextMenuInvokeArgs<C>
): Promise<ContextMenuInvokeResult<C>> {
  return ipcRenderer.invoke(channel, ...args)
}

export const contextMenuAPI = {
  getInit: () => invokeContextMenu('context-menu:window-get-init'),
  ready: () => invokeContextMenu('context-menu:window-ready'),
  resolve: (action: NativeTrackMenuAction | null) => (
    invokeContextMenu('context-menu:window-resolve', { action })
  ),
} satisfies ContextMenuWindowAPI

contextBridge.exposeInMainWorld('contextMenuAPI', contextMenuAPI)
