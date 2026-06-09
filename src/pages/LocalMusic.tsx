// =============================================================================
// QinPlayer — 本地音乐页面
// =============================================================================
// 职责：选择音乐文件夹、启动 Worker 扫描、实时显示歌曲列表
// 扫描通过 Worker Threads 异步进行，歌曲逐首推送渲染
// =============================================================================

import { useState, useCallback, useEffect } from 'react'
import SongList from '../components/SongList'
import type { Track } from '../types'

function LocalMusic() {
  // --- 状态 ---
  const [scanning, setScanning] = useState(false)
  const [tracks, setTracks] = useState<Track[]>([])
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [scanTotal, setScanTotal] = useState(0)

  // --- 启动时从数据库加载已有歌曲 ---
  useEffect(() => {
    async function loadExistingSongs() {
      try {
        const songs = await window.electronAPI.invoke('songs:getAll') as Track[]
        if (songs && songs.length > 0) {
          setTracks(songs)
        }
      } catch {
        // 数据库可能还没数据，忽略
      }
    }
    loadExistingSongs()
  }, [])

  // --- 监听 Worker 扫描事件 ---
  useEffect(() => {
    // 监听：发现新歌曲
    const unsubSong = window.electronAPI.on('scan:song-found', (song: Track) => {
      setTracks(prev => [...prev, song])
    })

    // 监听：扫描进度
    const unsubProgress = window.electronAPI.on('scan:progress', (data: { percent: number }) => {
      setProgress(data.percent)
    })

    // 监听：扫描完成
    const unsubDone = window.electronAPI.on('scan:done', () => {
      setScanning(false)
      setProgress(100)
    })

    // 监听：扫描错误
    const unsubError = window.electronAPI.on('scan:error', (data: { message: string }) => {
      setError(data.message)
      setScanning(false)
    })

    return () => {
      unsubSong()
      unsubProgress()
      unsubDone()
      unsubError()
    }
  }, [])

  // --- 选择文件夹并启动扫描 ---
  const handleSelectFolder = useCallback(async () => {
    // 1. 打开文件夹选择对话框
    const path = await window.electronAPI.invoke('select-folder') as string | null
    if (!path) return  // 用户取消了

    setFolderPath(path)
    setScanning(true)
    setError(null)
    setProgress(0)
    setScanTotal(0)

    // 2. 启动 Worker 扫描（异步，歌曲通过事件推送）
    try {
      const result = await window.electronAPI.invoke('scan-folder', path) as { success: boolean; error?: string }
      if (!result.success) {
        setError(result.error || '扫描启动失败')
        setScanning(false)
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
        <button
          className="local-music__add-btn"
          onClick={handleSelectFolder}
          disabled={scanning}
        >
          {scanning ? '扫描中...' : '选择文件夹'}
        </button>
      </div>

      {/* 文件夹路径 */}
      {folderPath && (
        <div className="local-music__path">
          📁 {folderPath}
          {tracks.length > 0 && <span className="local-music__count">（{tracks.length} 首）</span>}
        </div>
      )}

      {/* 扫描进度条 */}
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
      {error && (
        <div className="local-music__error">⚠️ {error}</div>
      )}

      {/* 歌曲列表 */}
      {tracks.length > 0 && (
        <SongList tracks={tracks} showIndex showAlbum={false} />
      )}

      {/* 空状态 */}
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
