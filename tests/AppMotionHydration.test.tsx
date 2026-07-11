import { render, screen, waitFor } from '@testing-library/react'
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
})
