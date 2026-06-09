// =============================================================================
// QinPlayer — 本地音乐页面
// =============================================================================
// 职责：选择音乐文件夹、扫描音频文件、显示歌曲列表
// Task 1.10：文件夹选择 + 扫描
// Task 1.11：使用 SongList 组件渲染歌曲列表
// =============================================================================

import { useState, useCallback } from 'react'
import SongList from '../components/SongList'
import type { Track } from '../types'

// 扫描结果类型
interface ScanResult {
  success: boolean
  files: string[]
  error?: string
}

// 自增 ID（Phase 2 由 SQLite 管理）
let nextId = 1

/**
 * 将文件路径转换为 Track 对象（临时方案，Phase 2 用 ID3 标签）
 */
function filePathToTrack(filePath: string): Track {
  // 从路径提取文件名
  const parts = filePath.replace(/\\/g, '/').split('/')
  const fileName = parts[parts.length - 1] || filePath
  // 去掉扩展名作为标题
  const title = fileName.replace(/\.[^.]+$/, '')

  return {
    id: nextId++,
    filePath,
    fileName,
    title,
    artist: '未知歌手',
    album: '未知专辑',
    duration: 0,  // Phase 2 解析 ID3 后填充
    coverPath: null,
    mtime: 0,
    playCount: 0,
    createdAt: new Date().toISOString(),
  }
}

function LocalMusic() {
  // --- 状态 ---
  const [scanning, setScanning] = useState(false)
  const [tracks, setTracks] = useState<Track[]>([])
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // --- 选择文件夹并扫描 ---
  const handleSelectFolder = useCallback(async () => {
    // 1. 打开文件夹选择对话框
    const path = await window.electronAPI.invoke('select-folder') as string | null
    if (!path) return  // 用户取消了

    setFolderPath(path)
    setScanning(true)
    setError(null)
    setTracks([])

    // 2. 扫描文件夹
    try {
      const result = await window.electronAPI.invoke('scan-folder', path) as ScanResult
      if (result.success) {
        // 将文件路径转换为 Track 对象
        const newTracks = result.files.map(filePathToTrack)
        setTracks(newTracks)
      } else {
        setError(result.error || '扫描失败')
      }
    } catch (e) {
      setError(String(e))
    } finally {
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
