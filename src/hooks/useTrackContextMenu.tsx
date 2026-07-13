import { useCallback, useState } from 'react'
import type { MenuItem } from '../components/ContextMenu'
import { IconClose, IconFolder, IconInfo, IconList, IconPlay } from '../components/Icons'
import type { Playlist, Track } from '../types'

export type TrackMenuKind = 'source' | 'priority'

interface Options {
  onPlay: (track: Track) => void
  onAddToPriorityQueue: (track: Track) => void
  onRemoveFromPriorityQueue?: (trackId: number) => void
  canAddToPriorityQueue: (track: Track) => boolean
  getExtraItems?: (track: Track) => MenuItem[]
  playbackEnabled: boolean
  playlistsEnabled: boolean
}

interface ContextTarget { x: number; y: number; track: Track; kind: TrackMenuKind }

export function useTrackContextMenu(options: Options) {
  const [target, setTarget] = useState<ContextTarget | null>(null)
  const [songInfoTrack, setSongInfoTrack] = useState<Track | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)

  const open = useCallback((event: React.MouseEvent, track: Track, kind: TrackMenuKind = 'source') => {
    event.preventDefault()
    if (options.playlistsEnabled && playlists === null) {
      void window.electronAPI.invoke('playlists:getAll').then((result) => setPlaylists(result as Playlist[])).catch(() => setPlaylists([]))
    }
    setTarget({ x: event.clientX, y: event.clientY, track, kind })
  }, [options.playlistsEnabled, playlists])

  const close = useCallback(() => setTarget(null), [])
  const getItems = useCallback((track: Track, kind: TrackMenuKind): MenuItem[] => {
    const items: MenuItem[] = []
    if (options.playbackEnabled) {
      items.push({ label: '播放', icon: <IconPlay width={14} height={14} />, action: () => options.onPlay(track) })
      if (kind === 'priority') {
        items.push({ label: '从接下来移除', icon: <IconClose width={14} height={14} />, action: () => options.onRemoveFromPriorityQueue?.(track.id) })
      } else {
        items.push({ label: '添加到接下来播放', icon: <IconList width={14} height={14} />, disabled: !options.canAddToPriorityQueue(track), action: () => options.onAddToPriorityQueue(track) })
      }
    }
    if (options.playlistsEnabled) {
      items.push({
        label: '添加到歌单', icon: <IconList width={14} height={14} />,
        children: playlists && playlists.length > 0 ? playlists.map((playlist) => ({ label: playlist.name, action: () => void window.electronAPI.invoke('playlists:addSong', { playlistId: playlist.id, songId: track.id }) })) : [{ label: '暂无歌单', disabled: true }],
      })
    }
    items.push(...(options.getExtraItems?.(track) ?? []), {
      label: '打开文件所在目录', icon: <IconFolder width={14} height={14} />,
      action: () => void window.electronAPI.invoke('open-file-location', track.filePath),
    }, { label: '歌曲信息', icon: <IconInfo width={14} height={14} />, action: () => setSongInfoTrack(track) })
    return items
  }, [options, playlists])

  return { target, songInfoTrack, open, close, getItems, closeSongInfo: () => setSongInfoTrack(null) }
}
