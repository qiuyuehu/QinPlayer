import { usePlayerStore } from '../stores/playerStore'
import MiniQueueView from './MiniQueueView'

function MiniQueueViewContainer() {
  const tracks = usePlayerStore((state) => state.playlist)
  const priorityQueue = usePlayerStore((state) => state.priorityQueue)
  const currentTrackId = usePlayerStore((state) => state.currentTrack?.id ?? null)
  const playTrack = usePlayerStore((state) => state.playTrack)
  const removeFromPriorityQueue = usePlayerStore((state) => state.removeFromPriorityQueue)
  const insertNext = usePlayerStore((state) => state.insertNext)
  const removeFromPlaylist = usePlayerStore((state) => state.removeFromPlaylist)

  return (
    <MiniQueueView
      tracks={tracks}
      priorityQueue={priorityQueue}
      currentTrackId={currentTrackId}
      onPlay={playTrack}
      onRemovePriority={removeFromPriorityQueue}
      onInsertNext={insertNext}
      onRemoveFromPlaylist={removeFromPlaylist}
      canInsertNext={(track) => currentTrackId !== track.id}
    />
  )
}

export default MiniQueueViewContainer
