import { usePlayerStore } from '../stores/playerStore'
import MiniQueueView from './MiniQueueView'

function MiniQueueViewContainer() {
  const tracks = usePlayerStore((state) => state.playlist)
  const priorityQueue = usePlayerStore((state) => state.priorityQueue)
  const currentTrackId = usePlayerStore((state) => state.currentTrack?.id ?? null)
  const playTrack = usePlayerStore((state) => state.playTrack)
  const removeFromPriorityQueue = usePlayerStore((state) => state.removeFromPriorityQueue)
  const addToPriorityQueue = usePlayerStore((state) => state.addToPriorityQueue)

  return (
    <MiniQueueView
      tracks={tracks}
      priorityQueue={priorityQueue}
      currentTrackId={currentTrackId}
      onPlay={playTrack}
      onRemovePriority={removeFromPriorityQueue}
      onAddToPriorityQueue={addToPriorityQueue}
      canAddToPriorityQueue={(track) => currentTrackId !== track.id && !priorityQueue.some((item) => item.id === track.id)}
    />
  )
}

export default MiniQueueViewContainer
