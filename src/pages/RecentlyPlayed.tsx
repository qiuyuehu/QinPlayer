// =============================================================================
// QinPlayer — 最近播放页面
// =============================================================================
// 职责：显示最近播放的 50 首歌曲
// 数据来源：songs:getRecent IPC（按 played_at 倒序）
// =============================================================================

import { useState, useEffect } from 'react'
import SongList from '../components/SongList'
import type { Track } from '../types'

/**
 * 最近播放页面组件
 * 组件挂载时调用 IPC 获取最近播放的歌曲记录
 * 由后端按 played_at 字段倒序返回，前端只做展示
 */
function RecentlyPlayed() {
  // 最近播放的歌曲列表
  const [tracks, setTracks] = useState<Track[]>([])
  // 加载状态：初始为 true，加载完成后设为 false
  const [loading, setLoading] = useState(true)

  // 组件挂载时加载最近播放数据，依赖数组为空仅执行一次
  useEffect(() => {
    async function load() {
      try {
        // 调用后端 IPC 接口获取最近播放的歌曲列表
        const songs = await window.electronAPI.invoke('songs:getRecent') as Track[]
        setTracks(songs)
      } catch (e) {
        console.error('加载最近播放失败:', e)
      } finally {
        // 无论成功或失败，都关闭加载状态以显示页面内容
        setLoading(false)
      }
    }
    load()
  }, [])

  // 加载中时显示 loading 状态，避免页面闪烁
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

      {/* 有播放记录时渲染歌曲列表，showAlbum=false 因为最近播放页面空间有限 */}
      {tracks.length > 0 ? (
        <SongList tracks={tracks} showIndex showAlbum={false} />
      ) : (
        // 无播放记录时的空状态引导
        <div className="recent-page__empty">
          <p>还没有播放记录</p>
          <p>播放歌曲后会自动记录</p>
        </div>
      )}
    </div>
  )
}

export default RecentlyPlayed
