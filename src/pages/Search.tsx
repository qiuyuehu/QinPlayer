// =============================================================================
// QinPlayer — 搜索页面
// =============================================================================
// 职责：根据搜索关键词调用 IPC 搜索，显示结果列表
// 搜索关键词来自 uiStore.searchQuery（由 Sidebar 搜索框防抖更新）
// =============================================================================

import { useState, useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import SongList from '../components/SongList'
import type { Track } from '../types'

function Search() {
  const searchQuery = useUIStore((state) => state.searchQuery)
  const [results, setResults] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)

  // 搜索关键词变化时调用 IPC
  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    let cancelled = false  // 防止旧请求覆盖新结果

    async function doSearch() {
      setLoading(true)
      try {
        const songs = await window.electronAPI.invoke('songs:search', { keyword: searchQuery }) as Track[]
        if (!cancelled) {
          setResults(songs)
        }
      } catch {
        if (!cancelled) {
          setResults([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    doSearch()

    return () => { cancelled = true }
  }, [searchQuery])

  return (
    <div className="search-page">
      {/* 页面标题 */}
      <div className="search-page__header">
        <h2 className="search-page__title">搜索</h2>
        {searchQuery && (
          <span className="search-page__query">
            "{searchQuery}" 的搜索结果
            {!loading && <span className="search-page__count">（{results.length} 首）</span>}
          </span>
        )}
      </div>

      {/* 搜索结果 */}
      {loading && (
        <div className="search-page__loading">搜索中...</div>
      )}

      {!loading && searchQuery && results.length === 0 && (
        <div className="search-page__empty">
          <p>没有找到匹配的歌曲</p>
          <p>试试其他关键词？</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <SongList tracks={results} showIndex showAlbum />
      )}

      {/* 未输入关键词时的提示 */}
      {!searchQuery && (
        <div className="search-page__hint">
          <p>🔍 在左侧搜索框输入歌名或歌手</p>
        </div>
      )}
    </div>
  )
}

export default Search
