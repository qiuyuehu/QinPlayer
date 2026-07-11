import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Settings from '../src/pages/Settings'
import { useUIStore } from '../src/stores/uiStore'

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
    useUIStore.setState({ reducedMotion: false })
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
})
