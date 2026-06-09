// =============================================================================
// QinPlayer — 最近播放页面
// =============================================================================
// 职责：显示最近播放的 50 首歌曲
// 数据来源：songs:getRecent IPC（按 played_at 倒序）
// =============================================================================

import { useState, useEffect } from 'react'
import SongList from '../components/SongList'
import type { Track } from '../types'

function RecentlyPlayed() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const songs = await window.electronAPI.invoke('songs:getRecent') as Track[]
        setTracks(songs)
      } catch (e) {
        console.error('加载最近播放失败:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="recent-page">
        <h2 className="recent-page__title">最近播放</h2>
        <div className="recent-page__loading">加载中...</div>
      </div>
    )
  }

  return (
    <div className="recent-page">
      <h2 className="recent-page__title">最近播放</h2>

      {tracks.length > 0 ? (
        <SongList tracks={tracks} showIndex showAlbum={false} />
      ) : (
        <div className="recent-page__empty">
          <p>还没有播放记录</p>
          <p>播放歌曲后会自动记录</p>
        </div>
      )}
    </div>
  )
}

export default RecentlyPlayed
