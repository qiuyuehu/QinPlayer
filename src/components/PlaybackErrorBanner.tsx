import { useEffect, useState } from 'react'

import { getPlaybackTrackKey, usePlayerStore } from '../stores/playerStore'
import { useUIStore } from '../stores/uiStore'

function PlaybackErrorBanner() {
  const [retrying, setRetrying] = useState(false)
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const failure = usePlayerStore((state) => state.playbackFailure)
  const retryCurrentTrack = usePlayerStore((state) => state.retryCurrentTrack)
  const nextTrack = usePlayerStore((state) => state.nextTrack)
  const playbackEnabled = useUIStore((state) => state.featureFlags.playback)
  const isMiniMode = useUIStore((state) => state.isMiniMode)
  const isLyricsMode = useUIStore((state) => state.activeNav === 'lyrics')
  const failureKey = failure
    ? `${failure.trackKey}:${failure.kind}:${failure.code}`
    : null

  useEffect(() => {
    setRetrying(false)
  }, [failureKey])

  if (
    !playbackEnabled
    || !currentTrack
    || !failure
    || failure.trackKey !== getPlaybackTrackKey(currentTrack)
  ) return null

  const className = [
    'playback-error-banner',
    isMiniMode ? 'playback-error-banner--mini' : '',
    isLyricsMode ? 'playback-error-banner--lyrics' : '',
  ].filter(Boolean).join(' ')

  const handleRetry = (): void => {
    if (retrying || !useUIStore.getState().featureFlags.playback) return
    setRetrying(true)
    retryCurrentTrack()
  }

  const handleNext = (): void => {
    if (!useUIStore.getState().featureFlags.playback) return
    nextTrack()
  }

  return (
    <div className={className} role="alert">
      <span className="playback-error-banner__message">
        {failure.kind === 'load' ? '无法加载这首歌曲' : '播放失败'}
      </span>
      <div className="playback-error-banner__actions">
        <button type="button" onClick={handleRetry} disabled={retrying}>重试</button>
        <button type="button" onClick={handleNext}>下一首</button>
      </div>
    </div>
  )
}

export default PlaybackErrorBanner
