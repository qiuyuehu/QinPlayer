import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import { useUIStore } from '../src/stores/uiStore'

vi.mock('../src/components/TitleBar', () => ({ default: () => <div>title</div> }))
vi.mock('../src/components/Sidebar', () => ({ default: () => <div>sidebar</div> }))
vi.mock('../src/components/Content', () => ({ default: () => <div>normal content</div> }))
vi.mock('../src/components/PlayerBar', () => ({ default: () => <div>player</div> }))
vi.mock('../src/components/MiniPlayer', () => ({ default: () => <div>mini</div> }))
vi.mock('../src/hooks/useTheme', () => ({ useTheme: vi.fn() }))
vi.mock('../src/hooks/useAudioSync', () => ({ useAudioSync: vi.fn() }))
vi.mock('../src/utils/AudioEngine', () => ({
  setAudioEngineEqualizerEnabled: vi.fn(),
}))
vi.mock('../src/stores/eqStore', () => ({
  useEqStore: { getState: () => ({ loadFromDb: vi.fn() }) },
}))
vi.mock('../src/stores/playerStore', () => ({
  restorePlayerState: vi.fn().mockResolvedValue(undefined),
  usePlayerStore: { getState: () => ({
    setLyricOffset: vi.fn(),
    setFadeEnabled: vi.fn(),
  }) },
}))

import App from '../src/App'

const originalOn = window.electronAPI.on
const originalSend = window.electronAPI.send

describe('App reduced-motion hydration', () => {
  const getFeatureFlags = vi.fn().mockResolvedValue({ ...DEFAULT_FEATURE_FLAGS })
  const invoke = vi.fn()

  beforeEach(() => {
    document.documentElement.setAttribute('data-reduced-motion', 'true')
    useUIStore.setState({
      activeNav: 'local',
      isMiniMode: false,
      reducedMotion: false,
      featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    })
    getFeatureFlags.mockClear()
    invoke.mockReset()
    window.electronAPI.getFeatureFlags = getFeatureFlags
    window.electronAPI.invoke = invoke
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-reduced-motion')
    useUIStore.setState({ reducedMotion: false })
    window.electronAPI.on = originalOn
    window.electronAPI.send = originalSend
  })

  it.each([
    ['true', true],
    ['false', false],
    [null, false],
  ] as const)('hydrates %s before normal content renders', async (savedValue, expected) => {
    invoke.mockImplementation(async (channel: string, args?: { key?: string }) => {
      if (channel === 'settings:get' && args?.key === 'reducedMotion') return savedValue
      return null
    })

    render(<App />)

    await screen.findByText('normal content')
    expect(useUIStore.getState().reducedMotion).toBe(expected)
    if (expected) {
      expect(document.documentElement).toHaveAttribute('data-reduced-motion', 'true')
    } else {
      expect(document.documentElement).not.toHaveAttribute('data-reduced-motion')
    }

    const reducedMotionReads = invoke.mock.calls.filter(([channel, args]) => (
      channel === 'settings:get' && args?.key === 'reducedMotion'
    ))
    expect(reducedMotionReads).toHaveLength(1)
    await waitFor(() => expect(getFeatureFlags).toHaveBeenCalledTimes(1))
    expect(getFeatureFlags.mock.invocationCallOrder[0]).toBeLessThan(
      invoke.mock.invocationCallOrder[0],
    )
  })

  it('StrictMode 下只保留一个关闭请求订阅并发送一次响应', async () => {
    const activeHandlers = new Set<(...args: unknown[]) => void>()
    const cleanups: ReturnType<typeof vi.fn>[] = []
    const on = vi.fn((_channel: string, callback: (...args: unknown[]) => void) => {
      activeHandlers.add(callback)
      const cleanup = vi.fn(() => activeHandlers.delete(callback))
      cleanups.push(cleanup)
      return cleanup
    })
    const send = vi.fn()
    window.electronAPI.on = on
    window.electronAPI.send = send
    invoke.mockResolvedValue(null)

    const view = render(<StrictMode><App /></StrictMode>)
    await screen.findByText('normal content')
    expect(activeHandlers.size).toBe(1)
    expect(send.mock.calls.filter(([channel]) => channel === 'close:ready')).toHaveLength(2)

    act(() => [...activeHandlers][0]({ requestId: 'request-1' }))
    fireEvent.click(await screen.findByRole('button', { name: '最小化到托盘' }))
    expect(send.mock.calls.filter(([channel]) => channel === 'close:respond')).toEqual([
      ['close:respond', { requestId: 'request-1', decision: 'minimize', remember: false }],
    ])

    view.unmount()
    expect(activeHandlers.size).toBe(0)
    expect(cleanups.every((cleanup) => cleanup.mock.calls.length === 1)).toBe(true)
  })
})
