import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PlaybackErrorBanner from '../src/components/PlaybackErrorBanner'
import { getPlaybackTrackKey, usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import type { Track } from '../src/types'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'

const firstTrack: Track = {
  id: 1,
  filePath: 'C:\\private\\first.mp3',
  fileName: 'first.mp3',
  title: 'First',
  artist: 'Artist',
  album: 'Album',
  duration: 180,
  coverPath: null,
  mtime: 1,
  playCount: 0,
  createdAt: '2026-07-17',
}

const secondTrack: Track = { ...firstTrack, id: 2, filePath: 'C:\\private\\second.mp3' }
const retry = vi.fn()
const next = vi.fn()

describe('PlaybackErrorBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    retry.mockReset()
    next.mockReset()
    useUIStore.setState({
      isMiniMode: false,
      activeNav: 'local',
      featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    })
    usePlayerStore.setState({
      currentTrack: firstTrack,
      playbackFailure: null,
      retryCurrentTrack: retry,
      nextTrack: next,
    })
  })

  it('无错误时不渲染', () => {
    render(<PlaybackErrorBanner />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['load', 'media-error', '无法加载这首歌曲'],
    ['play', 'play-rejected', '播放失败'],
  ] as const)('%s 错误显示固定中文且不包含路径', (kind, code, message) => {
    usePlayerStore.setState({
      playbackFailure: { kind, code, trackKey: getPlaybackTrackKey(firstTrack) },
    })

    render(<PlaybackErrorBanner />)

    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('alert')).not.toHaveTextContent('C:\\private')
  })

  it('Retry 与下一首各只调用一次', () => {
    usePlayerStore.setState({
      playbackFailure: {
        kind: 'load',
        code: 'media-error',
        trackKey: getPlaybackTrackKey(firstTrack),
      },
    })
    render(<PlaybackErrorBanner />)

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    fireEvent.click(screen.getByRole('button', { name: '下一首' }))

    expect(retry).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('Retry 失败再次显示后应该恢复可点击', async () => {
    const failure = {
      kind: 'load' as const,
      code: 'media-error' as const,
      trackKey: getPlaybackTrackKey(firstTrack),
    }
    retry.mockImplementation(() => {
      usePlayerStore.setState({ playbackFailure: null })
    })
    usePlayerStore.setState({ playbackFailure: failure })
    render(<PlaybackErrorBanner />)

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    act(() => usePlayerStore.setState({ playbackFailure: failure }))
    const retryButton = await screen.findByRole('button', { name: '重试' })
    expect(retryButton).toBeEnabled()
    fireEvent.click(retryButton)

    expect(retry).toHaveBeenCalledTimes(2)
  })

  it('playback flag 关闭时不展示也不执行', () => {
    usePlayerStore.setState({
      playbackFailure: {
        kind: 'load',
        code: 'media-error',
        trackKey: getPlaybackTrackKey(firstTrack),
      },
    })
    useUIStore.setState({ featureFlags: { ...DEFAULT_FEATURE_FLAGS, playback: false } })

    render(<PlaybackErrorBanner />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(retry).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('当前歌曲切换后旧 banner 消失', () => {
    usePlayerStore.setState({
      playbackFailure: {
        kind: 'play',
        code: 'play-rejected',
        trackKey: getPlaybackTrackKey(firstTrack),
      },
    })
    render(<PlaybackErrorBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    act(() => usePlayerStore.setState({ currentTrack: secondTrack }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
