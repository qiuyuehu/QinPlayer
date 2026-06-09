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

/**
 * 搜索页面组件
 * 从全局 uiStore 读取搜索词，实时调用后端搜索接口，
 * 将匹配结果通过 SongList 展示给用户
 */
function Search() {
  // 从全局 UI store 获取当前搜索关键词（由侧边栏输入框防抖设置）
  const searchQuery = useUIStore((state) => state.searchQuery)
  // 搜索结果列表，每次搜索词变化后重置
  const [results, setResults] = useState<Track[]>([])
  // 是否正在加载搜索结果
  const [loading, setLoading] = useState(false)

  // 搜索关键词变化时调用 IPC，使用 effect 自动响应关键词变化
  useEffect(() => {
    // 空关键词直接清空结果，避免发送无意义请求
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    // 标志位：组件卸载或关键词再次变化时取消旧请求的回调，防止竞态覆盖
    let cancelled = false  // 防止旧请求覆盖新结果

    // 异步执行实际搜索逻辑
    async function doSearch() {
      setLoading(true)
      try {
        // 通过 IPC 调用主进程的歌曲搜索接口，传入关键词
        const songs = await window.electronAPI.invoke('songs:search', { keyword: searchQuery }) as Track[]
        // 仅在请求未被取消时更新结果，避免竞态条件导致旧结果覆盖新结果
        if (!cancelled) {
          setResults(songs)
        }
      } catch {
        // 搜索失败时清空结果，避免显示过期数据
        if (!cancelled) {
          setResults([])
        }
      } finally {
        // 无论成功或失败，都关闭加载状态
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    doSearch()

    // 清理函数：关键词变化或组件卸载时标记取消，阻止旧回调更新状态
    return () => { cancelled = true }
  }, [searchQuery])

  return (
    <div className="search-page">
      {/* 页面标题：始终显示"搜索"，有搜索词时额外显示关键词和结果数量 */}
      <div className="search-page__header">
        <h2 className="search-page__title">搜索</h2>
        {searchQuery && (
          <span className="search-page__query">
            "{searchQuery}" 的搜索结果
            {/* 加载完成时显示结果总数 */}
            {!loading && <span className="search-page__count">（{results.length} 首）</span>}
          </span>
        )}
      </div>

      {/* 搜索中状态提示 */}
      {loading && (
        <div className="search-page__loading">搜索中...</div>
      )}

      {/* 无匹配结果提示，仅在搜索词非空且结果为空时显示 */}
      {!loading && searchQuery && results.length === 0 && (
        <div className="search-page__empty">
          <p>没有找到匹配的歌曲</p>
          <p>试试其他关键词？</p>
        </div>
      )}

      {/* 有搜索结果时渲染歌曲列表，showIndex 显示序号，showAlbum 显示专辑列 */}
      {!loading && results.length > 0 && (
        <SongList tracks={results} showIndex showAlbum />
      )}

      {/* 未输入关键词时的引导提示 */}
      {!searchQuery && (
        <div className="search-page__hint">
          <p>🔍 在左侧搜索框输入歌名或歌手</p>
        </div>
      )}
    </div>
  )
}

export default Search
