import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  CONTEXT_MENU_INVOKE_CHANNELS,
  MAIN_WINDOW_EVENT_CHANNELS,
  MAIN_WINDOW_INVOKE_CHANNELS,
  MAIN_WINDOW_SEND_CHANNELS,
  type ContextMenuInvokeArgs,
  type ContextMenuInvokeResult,
  type IpcEventArgs,
  type IpcSendArgs,
  type MainWindowInvokeArgs,
  type MainWindowInvokeResult,
} from '../src/types/ipc'
import type { ContextMenuWindowAPI, ElectronAPI } from '../src/types/electron'
import type { Playlist, Track } from '../src/types'

describe('IPC 三方向契约', () => {
  it('运行时清单应保持四个 surface 分离且数量完整', () => {
    expect(Object.keys(MAIN_WINDOW_INVOKE_CHANNELS)).toHaveLength(40)
    expect(Object.keys(CONTEXT_MENU_INVOKE_CHANNELS)).toHaveLength(3)
    expect(Object.keys(MAIN_WINDOW_SEND_CHANNELS)).toHaveLength(10)
    expect(Object.keys(MAIN_WINDOW_EVENT_CHANNELS)).toHaveLength(10)

    expect(MAIN_WINDOW_INVOKE_CHANNELS).not.toHaveProperty('context-menu:window-get-init')
    expect(CONTEXT_MENU_INVOKE_CHANNELS).not.toHaveProperty('songs:getAll')
    expect(MAIN_WINDOW_SEND_CHANNELS).toHaveProperty('theme-changed', true)
    expect(MAIN_WINDOW_EVENT_CHANNELS).toHaveProperty('theme:system-changed', true)
  })

  it('高风险 tuple 与结果应追随真实运行时载荷', () => {
    expectTypeOf<MainWindowInvokeArgs<'scan-folder'>>().toEqualTypeOf<[folderPath: string]>()
    expectTypeOf<MainWindowInvokeResult<'scan-folder'>>().toEqualTypeOf<
      { success: true } | { success: false; error: string }
    >()
    expectTypeOf<MainWindowInvokeArgs<'settings:addFolder'>>().toEqualTypeOf<[]>()
    expectTypeOf<MainWindowInvokeResult<'settings:addFolder'>>().toEqualTypeOf<string | null>()
    expectTypeOf<MainWindowInvokeResult<'settings:removeFolder'>>().toEqualTypeOf<{ deletedSongs: number }>()
    expectTypeOf<MainWindowInvokeArgs<'playlists:getSongs'>>().toEqualTypeOf<[
      options: { id: number; sortBy: 'added' | 'playCount'; order: 'asc' | 'desc' },
    ]>()
    expectTypeOf<MainWindowInvokeResult<'playlists:getSongs'>>().toEqualTypeOf<Track[]>()
    expectTypeOf<MainWindowInvokeResult<'playlists:getAll'>>().toEqualTypeOf<Playlist[]>()
    expectTypeOf<MainWindowInvokeResult<'db:import-apply'>>().toMatchTypeOf<{
      success: boolean
      error?: string
      fatal?: boolean
    }>()
  })

  it('send、event 与 Mini surface 应使用各自 tuple', () => {
    expectTypeOf<IpcSendArgs<'set-auto-launch'>>().toEqualTypeOf<[enabled: boolean]>()
    expectTypeOf<IpcSendArgs<'theme-changed'>>().toEqualTypeOf<[theme: 'dark' | 'light']>()
    expectTypeOf<IpcEventArgs<'window:maximized'>>().toEqualTypeOf<[maximized: boolean]>()
    expectTypeOf<IpcEventArgs<'theme:system-changed'>>().toEqualTypeOf<[theme: 'dark' | 'light']>()
    expectTypeOf<ContextMenuInvokeArgs<'context-menu:window-resolve'>>().toEqualTypeOf<[
      payload: { action: import('../src/types/ipc').NativeTrackMenuAction | null },
    ]>()
    expectTypeOf<ContextMenuInvokeResult<'context-menu:window-get-init'>>()
      .toEqualTypeOf<import('../src/types/ipc').NativeTrackMenuWindowInit | null>()
  })
})

declare const mainApi: ElectronAPI
declare const menuApi: ContextMenuWindowAPI

if (false) {
  const songs = await mainApi.invoke('songs:getAll')
  expectTypeOf(songs).toEqualTypeOf<Track[]>()
  const addedFolder = await mainApi.invoke('settings:addFolder')
  expectTypeOf(addedFolder).toEqualTypeOf<string | null>()
  const init = await menuApi.getInit()
  expectTypeOf(init).toEqualTypeOf<import('../src/types/ipc').NativeTrackMenuWindowInit | null>()

  // @ts-expect-error 未知 invoke channel 必须被拒绝
  await mainApi.invoke('unknown:channel')
  // @ts-expect-error scan-folder 仍接收字符串，不能对象化
  await mainApi.invoke('scan-folder', { folderPath: 'C:\\Music' })
  // @ts-expect-error 无参数 channel 不得静默接受参数
  await mainApi.invoke('settings:addFolder', 'C:\\Music')
  // @ts-expect-error invoke channel 不得通过 send surface 使用
  mainApi.send('songs:getAll')
  // @ts-expect-error send channel 不得通过 event surface 使用
  mainApi.on('set-auto-launch', () => {})
  // @ts-expect-error event callback payload 必须是 boolean
  mainApi.on('window:maximized', (value: string) => value)
  // @ts-expect-error Mini preload 不能获得主窗口通用 invoke
  menuApi.invoke('songs:getAll')
}
