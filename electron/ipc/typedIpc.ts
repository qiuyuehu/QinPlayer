import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'

import type {
  IpcArgs,
  IpcChannel,
  IpcEventArgs,
  IpcEventChannel,
  IpcReturn,
  IpcSendArgs,
  IpcSendChannel,
} from '../../src/types/ipc'

type Awaitable<T> = T | Promise<T>

export interface IpcEventTarget {
  send: (channel: string, ...args: unknown[]) => void
  isDestroyed?: () => boolean
}

function narrowArgs<Args extends unknown[]>(args: unknown[]): Args {
  return args as Args
}

export function isBooleanIpcPayload(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function handleIpc<C extends IpcChannel>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: IpcArgs<C>
  ) => Awaitable<IpcReturn<C>>,
): void {
  ipcMain.handle(channel, async (event, ...rawArgs: unknown[]) => {
    try {
      return await handler(event, ...narrowArgs<IpcArgs<C>>(rawArgs))
    } catch (error) {
      console.error(`[IPC] ${channel} 调用失败:`, error)
      throw new Error('IPC 调用失败，请重试')
    }
  })
}

export function onIpc<C extends IpcSendChannel>(
  channel: C,
  handler: (event: IpcMainEvent, ...args: IpcSendArgs<C>) => Awaitable<void>,
): void {
  ipcMain.on(channel, (event, ...rawArgs: unknown[]) => {
    try {
      const result = handler(event, ...narrowArgs<IpcSendArgs<C>>(rawArgs))
      void Promise.resolve(result).catch((error) => {
        console.error(`[IPC] ${channel} 消息处理失败:`, error)
      })
    } catch (error) {
      console.error(`[IPC] ${channel} 消息处理失败:`, error)
    }
  })
}

export function sendIpc<C extends IpcEventChannel>(
  target: IpcEventTarget | null | undefined,
  channel: C,
  ...args: IpcEventArgs<C>
): void {
  if (!target || target.isDestroyed?.()) return
  try {
    target.send(channel, ...args)
  } catch (error) {
    console.error(`[IPC] ${channel} 事件发送失败:`, error)
  }
}
