import { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeTrackMenuAction, NativeTrackMenuEntry } from '../types/ipc'
import type { Track } from '../types'

export type NativeTrackMenuKind = 'source' | 'priority'

interface Options {
  onPlay: (track: Track) => void
  onInsertNext: (track: Track) => void
  onRemovePriority: (trackId: number) => void
  onRemovePlaylist: (trackId: number) => void
  canInsertNext: (track: Track) => boolean
}

function getEntries(track: Track, kind: NativeTrackMenuKind, canInsertNext: (track: Track) => boolean): NativeTrackMenuEntry[] {
  if (kind === 'priority') {
    return [
      { action: 'play', enabled: true },
      { action: 'remove-priority', enabled: true },
      { action: 'open-location', enabled: true },
      { action: 'show-info', enabled: true },
    ]
  }

  return [
    { action: 'play', enabled: true },
    { action: 'insert-next', enabled: canInsertNext(track) },
    { action: 'remove-playlist', enabled: true },
    { action: 'open-location', enabled: true },
    { action: 'show-info', enabled: true },
  ]
}

export function useNativeTrackContextMenu(options: Options) {
  const [songInfoTrack, setSongInfoTrack] = useState<Track | null>(null)
  const mountedRef = useRef(false)
  const pendingRef = useRef(false)
  const requestTokenRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      pendingRef.current = false
      requestTokenRef.current += 1
    }
  }, [])

  const open = useCallback(async (event: React.MouseEvent, track: Track, kind: NativeTrackMenuKind): Promise<void> => {
    event.preventDefault()
    if (pendingRef.current) return

    pendingRef.current = true
    const requestToken = ++requestTokenRef.current
    try {
      const action = await window.electronAPI.invoke('context-menu:show-track', {
        entries: getEntries(track, kind, options.canInsertNext),
      }) as NativeTrackMenuAction | null
      if (!mountedRef.current || requestToken !== requestTokenRef.current || action === null) return

      switch (action) {
        case 'play':
          options.onPlay(track)
          break
        case 'insert-next':
          options.onInsertNext(track)
          break
        case 'remove-priority':
          options.onRemovePriority(track.id)
          break
        case 'remove-playlist':
          options.onRemovePlaylist(track.id)
          break
        case 'open-location':
          void window.electronAPI.invoke('open-file-location', track.filePath).catch((error) => {
            console.error('[MiniQueue] 打开文件所在目录失败:', error)
          })
          break
        case 'show-info':
          setSongInfoTrack(track)
          break
      }
    } catch (error) {
      if (mountedRef.current && requestToken === requestTokenRef.current) {
        console.error('[MiniQueue] 打开原生歌曲菜单失败:', error)
      }
    } finally {
      if (requestToken === requestTokenRef.current) pendingRef.current = false
    }
  }, [options])

  const closeSongInfo = useCallback(() => setSongInfoTrack(null), [])
  return { songInfoTrack, open, closeSongInfo }
}
