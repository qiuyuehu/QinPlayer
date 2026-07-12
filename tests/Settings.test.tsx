import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Settings from '../src/pages/Settings'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'

vi.mock('../src/components/Equalizer', () => ({ default: () => null }))
vi.mock('../src/utils/AudioEngine', () => ({
  getAudioEngine: () => ({
    enumerateOutputDevices: vi.fn().mockResolvedValue([]),
    getOutputDeviceId: vi.fn().mockReturnValue('default'),
    setOutputDevice: vi.fn().mockResolvedValue(undefined),
  }),
}))

describe('Settings reduced motion', () => {
  const invoke = vi.fn(async (channel: string) => {
    if (channel === 'get-auto-launch') return false
    if (channel === 'settings:getFolders') return []
    return null
  })

  beforeEach(() => {
    invoke.mockClear()
    window.electronAPI.invoke = invoke
    useUIStore.setState({ reducedMotion: false, featureFlags: { ...DEFAULT_FEATURE_FLAGS } })
  })

  afterEach(() => {
    useUIStore.setState({ reducedMotion: false })
  })

  it('shows the accessible switch in General and persists each change once', async () => {
    render(<Settings />)

    const label = screen.getByText('减少动画')
    const generalSection = label.closest('.settings-section')
    expect(generalSection).toHaveTextContent('通用')
    expect(generalSection).toHaveTextContent(
      '减少界面位移和过渡；系统已开启减少动画时始终生效',
    )

    const checkbox = screen.getByRole('checkbox', { name: '减少动画' })
    expect(checkbox).not.toBeChecked()

    fireEvent.click(checkbox)
    expect(useUIStore.getState().reducedMotion).toBe(true)
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('settings:set', {
        key: 'reducedMotion',
        value: 'true',
      })
    })
    expect(invoke.mock.calls.filter(([channel, value]) => (
      channel === 'settings:set' && value?.key === 'reducedMotion'
    ))).toHaveLength(1)

    fireEvent.click(checkbox)
    expect(useUIStore.getState().reducedMotion).toBe(false)
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('settings:set', {
        key: 'reducedMotion',
        value: 'false',
      })
    })
    expect(invoke.mock.calls.filter(([channel, value]) => (
      channel === 'settings:set' && value?.key === 'reducedMotion'
    ))).toHaveLength(2)
  })

  it('读取三态并在保存成功后才更新关闭行为', async () => {
    let resolveSave: (() => void) | undefined
    invoke.mockImplementation(async (channel: string, args?: { key?: string }) => {
      if (channel === 'settings:get' && args?.key === 'closeBehavior') return 'ask'
      if (channel === 'settings:set' && args?.key === 'closeBehavior') {
        return new Promise<void>((resolve) => { resolveSave = resolve })
      }
      if (channel === 'get-auto-launch') return false
      if (channel === 'settings:getFolders') return []
      return null
    })
    render(<Settings />)
    const ask = await screen.findByRole('radio', { name: '每次询问' })
    const exit = screen.getByRole('radio', { name: '直接退出' })
    await waitFor(() => expect(ask).toHaveAttribute('aria-checked', 'true'))

    fireEvent.click(exit)
    expect(ask).toHaveAttribute('aria-checked', 'true')
    expect(exit).toBeDisabled()
    await act(async () => resolveSave?.())
    expect(exit).toHaveAttribute('aria-checked', 'true')
  })

  it('保存失败时保留旧值并显示错误', async () => {
    invoke.mockImplementation(async (channel: string, args?: { key?: string }) => {
      if (channel === 'settings:get' && args?.key === 'closeBehavior') return 'ask'
      if (channel === 'settings:set' && args?.key === 'closeBehavior') throw new Error('db')
      if (channel === 'get-auto-launch') return false
      if (channel === 'settings:getFolders') return []
      return null
    })
    render(<Settings />)
    const ask = await screen.findByRole('radio', { name: '每次询问' })
    await waitFor(() => expect(ask).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(screen.getByRole('radio', { name: '最小化到托盘' }))

    expect(await screen.findByText('保存失败，请重试')).toBeInTheDocument()
    expect(ask).toHaveAttribute('aria-checked', 'true')
  })

  it('tray=false 时显示直接退出并禁用不可恢复选项', async () => {
    useUIStore.setState({ featureFlags: { ...DEFAULT_FEATURE_FLAGS, tray: false } })
    invoke.mockImplementation(async (channel: string, args?: { key?: string }) => {
      if (channel === 'settings:get' && args?.key === 'closeBehavior') return 'ask'
      if (channel === 'get-auto-launch') return false
      if (channel === 'settings:getFolders') return []
      return null
    })
    render(<Settings />)

    const minimize = await screen.findByRole('radio', { name: '最小化到托盘' })
    expect(minimize).toBeDisabled()
    expect(screen.getByRole('radio', { name: '每次询问' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '直接退出' })).toHaveAttribute('aria-checked', 'true')
  })
})
