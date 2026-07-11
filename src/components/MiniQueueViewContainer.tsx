import { usePlayerStore } from '../stores/playerStore'
import MiniQueueView from './MiniQueueView'

function MiniQueueViewContainer() {
  const tracks = usePlayerStore((state) => state.playlist)
  const currentTrackId = usePlayerStore((state) => state.currentTrack?.id ?? null)
  const playTrack = usePlayerStore((state) => state.playTrack)

  return (
    <MiniQueueView
      tracks={tracks}
      currentTrackId={currentTrackId}
      onPlay={playTrack}
    />
  )
}

export default MiniQueueViewContainer
