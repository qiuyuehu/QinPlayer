// =============================================================================
// QinPlayer — 本地音乐页面
// =============================================================================
// 职责：选择音乐文件夹、启动 Worker 扫描、实时显示歌曲列表
// 扫描通过 Worker Threads 异步进行，歌曲逐首推送渲染
// 设计要点：
//   - 事件驱动：通过 electronAPI.on 监听 scan:song-found 等事件，实现流式展示
//   - 状态重置：每次新扫描前清空上次状态，避免数据残留
//   - 错误兜底：Worker 启动失败、文件夹不可访问等场景都有处理
// =============================================================================

import { useState, useCallback, useEffect, useMemo } from 'react'
import SongList from '../components/SongList'           // 复用歌曲列表组件（虚拟列表+右键菜单）
import SortMenu from '../components/SortMenu'
import { sortTracks } from '../utils/trackSort'
import type { TrackSortBy } from '../utils/trackSort'
import type { SortOrder, Track } from '../types'

const TRACK_SORT_FIELDS = [
  { value: 'title', label: '歌名' },
  { value: 'artist', label: '歌手' },
  { value: 'playCount', label: '播放次数' },
] as const

// LocalMusic — 本地音乐页面，扫描文件夹 + 显示歌曲列表
function LocalMusic() {
  // --- 页面状态 ---
  const [scanning, setScanning] = useState(false)       // 是否正在扫描
  const [tracks, setTracks] = useState<Track[]>([])     // 已加载/扫描到的歌曲列表
  const [folderPath, setFolderPath] = useState<string | null>(null)  // 当前扫描的文件夹路径
  const [error, setError] = useState<string | null>(null)            // 错误信息
  const [progress, setProgress] = useState(0)           // 扫描进度百分比（0-100）
  const [scanTotal, setScanTotal] = useState(0)         // 扫描到的文件总数
  const [sortBy, setSortBy] = useState<TrackSortBy>('title')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const sortedTracks = useMemo(
    () => sortTracks(tracks, sortBy, sortOrder),
    [sortBy, sortOrder, tracks],
  )

  // ---------------------------------------------------------------------------
  // 启动时从数据库加载已有歌曲
  // ---------------------------------------------------------------------------
  // 页面初始化时先展示上次扫描的结果，让用户无需重新扫描
  useEffect(() => {
    async function loadExistingSongs() {
      try {
        const songs = await window.electronAPI.invoke('songs:getAll') as Track[]
        if (songs && songs.length > 0) {
          setTracks(songs)   // 有数据才更新，避免覆盖为空数组
        }
      } catch {
        // 数据库可能还没数据（首次启动），静默忽略
      }
    }
    loadExistingSongs()
  }, [])

  // ---------------------------------------------------------------------------
  // 监听 Worker 扫描事件
  // ---------------------------------------------------------------------------
  // 采用事件驱动模式：Worker 逐首推送歌曲，前端实时追加到列表
  useEffect(() => {
    // 监听：发现新歌曲
    // 每发现一首歌就追加到列表（已存在则更新，避免重复）
    const unsubSong = window.electronAPI.on('scan:song-found', (song: Track) => {
      setTracks(prev => {
        const idx = prev.findIndex(t => t.id === (song as Track).id)
        if (idx >= 0) {
          // 已存在，更新元数据（封面、标题等可能变化）
          const next = [...prev]
          next[idx] = song as Track
          return next
        }
        // 新歌曲，追加到末尾
        return [...prev, song as Track]
      })
    })

    // 监听：扫描进度
    // Worker 每处理一批文件后推送百分比，驱动进度条动画
    const unsubProgress = window.electronAPI.on('scan:progress', (data: { percent: number }) => {
      setProgress(data.percent)  // 更新进度条宽度
    })

    // 监听：扫描完成
    // 扫描结束：停止 loading 状态，进度条固定在 100%
    // 同时从数据库重新加载歌曲列表（增量扫描可能新增/删除了歌曲）
    const unsubDone = window.electronAPI.on('scan:done', async () => {
      setScanning(false)
      setProgress(100)
      // 从数据库重新加载最新歌曲列表（清理已删除的 + 新增的）
      try {
        const songs = await window.electronAPI.invoke('songs:getAll') as Track[]
        if (songs) {
          setTracks(songs)
        }
      } catch {
        // 忽略
      }
    })

    // 监听：扫描错误
    // 扫描出错时显示错误信息，停止 loading 状态
    const unsubError = window.electronAPI.on('scan:error', (data: { message: string }) => {
      setError(data.message)
      setScanning(false)
    })

    // cleanup：组件卸载时取消所有事件监听，防止内存泄漏
    return () => {
      unsubSong()
      unsubProgress()
      unsubDone()
      unsubError()
    }
  }, [])

  // ---------------------------------------------------------------------------
  // 选择文件夹并启动扫描
  // ---------------------------------------------------------------------------
  // 整个流程：打开对话框 → 重置状态 → 发送 IPC 启动 Worker → 通过事件接收结果
  const handleSelectFolder = useCallback(async () => {
    // 1. 打开系统文件夹选择对话框（通过 IPC 调用 Electron 原生 dialog）
    const path = await window.electronAPI.invoke('select-folder') as string | null
    if (!path) return  // 用户关闭对话框时返回 null，直接退出

    setFolderPath(path)
    setScanning(true)
    setError(null)     // 清除上次错误
    setProgress(0)     // 重置进度
    setScanTotal(0)    // 重置计数

    // 2. 启动 Worker 扫描 —— 此调用只触发扫描，歌曲通过 scan:song-found 事件逐首推送
    try {
      const result = await window.electronAPI.invoke('scan-folder', path) as { success: boolean; error?: string }  // 返回扫描启动结果
      if (!result.success) {
        setError(result.error || '扫描启动失败')  // Worker 启动失败时立即提示
        setScanning(false)                         // 恢复按钮可用状态
      }
    } catch (e) {
      setError(String(e))
      setScanning(false)
    }
  }, [])

  return (
    <div className="local-music">
      {/* 顶部操作栏 */}
      <div className="local-music__header">
        <h2 className="local-music__title">本地音乐</h2>
        <div className="local-music__header-actions">
          {tracks.length > 0 && (
            <SortMenu
              fields={TRACK_SORT_FIELDS}
              sortBy={sortBy}
              sortOrder={sortOrder}
              ariaLabel="本地音乐排序"
              onSortByChange={setSortBy}
              onSortOrderChange={setSortOrder}
            />
          )}
          <button
            className="local-music__add-btn"
            onClick={handleSelectFolder}
            disabled={scanning}   // 扫描中禁用按钮，防止重复触发
          >
            {scanning ? '扫描中...' : '选择文件夹'}  {/* 动态按钮文案 */}
          </button>
        </div>
      </div>

      {/* 文件夹路径 */}
      {/* 显示当前扫描的文件夹和歌曲数量，扫描前不显示 */}
      {folderPath && (
        <div className="local-music__path">
          📁 {folderPath}
          {tracks.length > 0 && <span className="local-music__count">（{tracks.length} 首）</span>}
        </div>
      )}

      {/* 扫描进度条 */}
      {/* 进度条：仅在扫描中显示，宽度由 progress 百分比控制 */}
      {scanning && (
        <div className="local-music__progress">
          <div className="local-music__progress-bar">
            <div
              className="local-music__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="local-music__progress-text">{progress}%</span>
        </div>
      )}

      {/* 错误提示 */}
      {/* 错误信息：扫描失败或文件夹不可访问时显示 */}
      {error && (
        <div className="local-music__error">⚠️ {error}</div>
      )}

      {/* 歌曲列表 */}
      {tracks.length > 0 && (   // 有歌曲时才渲染列表，避免空列表占位
        <SongList tracks={sortedTracks} showIndex showAlbum={false} />
      )}

      {/* 空状态 */}
      {/* 三重条件：非扫描中 + 无歌曲 + 无错误 → 显示引导文案 */}
      {!scanning && tracks.length === 0 && !error && (
        <div className="local-music__empty">
          <p>还没有扫描任何音乐文件</p>
          <p>点击上方"选择文件夹"开始</p>
        </div>
      )}
    </div>
  )
}

export default LocalMusic
