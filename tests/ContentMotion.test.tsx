import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import { useUIStore } from '../src/stores/uiStore'

vi.mock('../src/pages/Search', () => ({ default: () => <div>search page</div> }))
vi.mock('../src/pages/RecentlyPlayed', () => ({ default: () => <div>recent page</div> }))
vi.mock('../src/pages/LocalMusic', () => ({ default: () => <div>local page</div> }))
vi.mock('../src/pages/Albums', () => ({ default: () => <div>albums page</div> }))
vi.mock('../src/pages/Playlists', () => ({ default: () => <div>playlists page</div> }))
vi.mock('../src/pages/Liked', () => ({ default: () => <div>liked page</div> }))
vi.mock('../src/pages/Lyrics', () => ({ default: () => <div>lyrics page</div> }))
vi.mock('../src/pages/Settings', () => ({ default: () => <div>settings page</div> }))

import Content from '../src/components/Content'

describe('Content motion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.documentElement.removeAttribute('data-reduced-motion')
    useUIStore.setState({
      activeNav: 'local',
      reducedMotion: false,
      featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.documentElement.removeAttribute('data-reduced-motion')
  })

  it('mounts each resolved navigation target once without intermediate pages', () => {
    render(<Content />)
    expect(screen.getAllByText('local page')).toHaveLength(1)

    act(() => useUIStore.getState().setActiveNav('albums'))
    expect(screen.queryByText('local page')).not.toBeInTheDocument()
    expect(screen.getAllByText('albums page')).toHaveLength(1)

    act(() => useUIStore.getState().setActiveNav('settings'))
    expect(screen.queryByText('albums page')).not.toBeInTheDocument()
    expect(screen.getAllByText('settings page')).toHaveLength(1)
  })

  it('uses LocalMusic as the stable key and page when a nav flag is disabled', () => {
    useUIStore.setState({
      activeNav: 'albums',
      featureFlags: { ...DEFAULT_FEATURE_FLAGS, albums: false },
    })

    render(<Content />)

    expect(screen.getAllByText('local page')).toHaveLength(1)
    expect(screen.queryByText('albums page')).not.toBeInTheDocument()
  })

  it('keeps the lyrics layer for the normal 300ms exit', () => {
    useUIStore.setState({ activeNav: 'lyrics' })
    render(<Content />)

    act(() => useUIStore.getState().setActiveNav('local'))
    expect(screen.getByText('lyrics page')).toBeInTheDocument()
    expect(screen.queryByText('local page')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(299))
    expect(screen.getByText('lyrics page')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('lyrics page')).not.toBeInTheDocument()
    expect(screen.getByText('local page')).toBeInTheDocument()
  })

  it('completes the lyrics exit immediately when reduced motion is active', () => {
    document.documentElement.setAttribute('data-reduced-motion', 'true')
    useUIStore.setState({ activeNav: 'lyrics' })
    render(<Content />)

    act(() => useUIStore.getState().setActiveNav('local'))

    expect(screen.queryByText('lyrics page')).not.toBeInTheDocument()
    expect(screen.getByText('local page')).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })
})
