// =============================================================================
// QinPlayer — 我喜欢的页面
// =============================================================================
// 职责：显示收藏的歌曲列表
// 数据来源：songs:getLiked IPC
// =============================================================================

import { useState, useEffect } from 'react'
import SongList from '../components/SongList'
import type { Track } from '../types'

/**
 * 我喜欢的页面组件
 * 展示用户收藏（标记为喜欢）的歌曲列表
 * 组件挂载时通过 IPC 获取已收藏的歌曲
 */
function Liked() {
  // 收藏歌曲列表
  const [tracks, setTracks] = useState<Track[]>([])
  // 加载状态，初始为 true 以在数据到达前显示 loading
  const [loading, setLoading] = useState(true)

  // 加载收藏列表：调用后端 IPC 获取所有已收藏歌曲
  const loadLiked = async () => {
    try {
      // 通过 IPC 获取收藏歌曲列表，返回按收藏时间排序的数据
      const songs = await window.electronAPI.invoke('songs:getLiked') as Track[]
      setTracks(songs)
    } catch (e) {
      console.error('加载收藏失败:', e)
    } finally {
      // 关闭加载状态，确保页面正常渲染
      setLoading(false)
    }
  }

  // 组件挂载时执行一次加载
  useEffect(() => {
    loadLiked()
  }, [])

  // 加载中时仅显示标题和 loading 提示，避免空列表闪烁
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

      {/* 有收藏歌曲时显示列表，showAlbum=false 因为空间有限且收藏列表不需要专辑列 */}
      {tracks.length > 0 ? (
        <SongList tracks={tracks} showIndex showAlbum={false} />
      ) : (
        // 无收藏时的空状态引导，提示用户操作方式
        <div className="liked-page__empty">
          <p>还没有收藏歌曲</p>
          <p>点击歌曲旁的 ❤️ 收藏</p>
        </div>
      )}
    </div>
  )
}

export default Liked
