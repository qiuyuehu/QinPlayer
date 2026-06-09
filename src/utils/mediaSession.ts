// =============================================================================
// QinPlayer — Media Session API 管理模块
// =============================================================================
// 职责：接管系统媒体控制（Windows 任务栏 + 键盘多媒体键）
// 设计：
//   - 更新歌曲信息（标题、歌手、专辑、封面）
//   - 注册播放控制回调（play/pause/prev/next）
//   - ⚠️ 暗礁 1：封面图必须转为 Blob URL，OS 不认识 qinplayer:// 协议
// =============================================================================

import type { Track } from '../types'

/**
 * 将封面图转换为 Blob URL
 * ⚠️ 暗礁 1：OS 原生媒体服务不认识 qinplayer:// 协议
 * 必须 fetch → blob → URL.createObjectURL，生成 blob:http://... 格式
 *
 * @param coverPath 封面文件路径（本地路径）
 * @returns Blob URL 或空字符串（无封面时）
 */
async function getArtworkUrl(coverPath: string | null): Promise<string> {
  if (!coverPath) {
    console.log('[MediaSession] 无封面路径，跳过')
    return ''
  }

  const url = `qinplayer://cover?path=${encodeURIComponent(coverPath)}`
  console.log('[MediaSession] 封面请求 URL:', url)

  try {
    const response = await fetch(url)
    console.log('[MediaSession] 封面响应状态:', response.status, response.ok)

    if (!response.ok) {
      console.warn('[MediaSession] 封面请求失败:', response.status)
      return ''
    }

    const blob = await response.blob()
    console.log('[MediaSession] 封面 Blob 大小:', blob.size, 'bytes, 类型:', blob.type)

    if (blob.size === 0) {
      console.warn('[MediaSession] 封面 Blob 为空')
      return ''
    }

    // ⚠️ blob:http://localhost:xxx/... — OS 能识别这种格式
    const blobUrl = URL.createObjectURL(blob)
    console.log('[MediaSession] 封面 Blob URL:', blobUrl)
    return blobUrl
  } catch (err) {
    console.warn('[MediaSession] 封面图转换失败:', err)
    return ''
  }
}

/**
 * 更新 Media Session 元数据
 * 切歌时调用，更新任务栏媒体控制台显示的信息
 *
 * @param track 当前播放的歌曲
 */
export async function updateMediaSession(track: Track): Promise<void> {
  if (!('mediaSession' in navigator)) {
    console.warn('[MediaSession] 当前环境不支持 Media Session API')
    return
  }

  // ⚠️ 暗礁 1：封面图转为 Blob URL
  const artworkUrl = await getArtworkUrl(track.coverPath)

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || track.fileName,
      artist: track.artist || '未知歌手',
      album: track.album || '未知专辑',
      artwork: artworkUrl
        ? [{ src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }]
        : []
    })

    console.log('[MediaSession] 已更新:', track.title, artworkUrl ? '（含封面）' : '（无封面）')
  } catch (err) {
    console.error('[MediaSession] 更新 metadata 失败:', err)
  }
}

/**
 * 清除 Media Session 元数据
 */
export function clearMediaSession(): void {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = null
  }
}

/**
 * 更新播放状态
 * @param state 'playing' | 'paused'
 */
export function setPlaybackState(state: 'playing' | 'paused'): void {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state
  }
}

/**
 * 注册 Media Session 动作回调
 * 键盘多媒体键、任务栏按钮触发时调用
 */
export function registerMediaSessionActions(actions: {
  play: () => void
  pause: () => void
  prevTrack: () => void
  nextTrack: () => void
  seekTo?: (time: number) => void
}): void {
  if (!('mediaSession' in navigator)) return

  navigator.mediaSession.setActionHandler('play', () => actions.play())
  navigator.mediaSession.setActionHandler('pause', () => actions.pause())
  navigator.mediaSession.setActionHandler('previoustrack', () => actions.prevTrack())
  navigator.mediaSession.setActionHandler('nexttrack', () => actions.nextTrack())

  if (actions.seekTo) {
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        actions.seekTo!(details.seekTime)
      }
    })
  }

  console.log('[MediaSession] 动作回调已注册')
}

/**
 * 设置播放位置（用于 Media Session 进度显示）
 */
export function setPositionState(position: number, duration: number, playbackRate: number = 1): void {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return

  try {
    navigator.mediaSession.setPositionState({
      duration: duration || 0,
      playbackRate,
      position: Math.min(position, duration || 0)
    })
  } catch (err) {
    // 忽略
  }
}
