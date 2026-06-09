// =============================================================================
// QinPlayer — 我喜欢的页面
// =============================================================================
// 职责：显示收藏的歌曲列表
// 数据来源：songs:getLiked IPC
// =============================================================================

import { useState, useEffect } from 'react'
import SongList from '../components/SongList'
import type { Track } from '../types'

function Liked() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  // 加载收藏列表
  const loadLiked = async () => {
    try {
      const songs = await window.electronAPI.invoke('songs:getLiked') as Track[]
      setTracks(songs)
    } catch (e) {
      console.error('加载收藏失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLiked()
  }, [])

  if (loading) {
    return (
      <div className="liked-page">
        <h2 className="liked-page__title">我喜欢的</h2>
        <div className="liked-page__loading">加载中...</div>
      </div>
    )
  }

  return (
    <div className="liked-page">
      <h2 className="liked-page__title">我喜欢的</h2>

      {tracks.length > 0 ? (
        <SongList tracks={tracks} showIndex showAlbum={false} />
      ) : (
        <div className="liked-page__empty">
          <p>还没有收藏歌曲</p>
          <p>点击歌曲旁的 ❤️ 收藏</p>
        </div>
      )}
    </div>
  )
}

export default Liked
