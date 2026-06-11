// =============================================================================
// QinPlayer — 歌曲信息弹窗
// =============================================================================
// 职责：显示歌曲的详细元数据信息
// =============================================================================

import type { Track } from '../types'

interface SongInfoDialogProps {
  track: Track
  onClose: () => void
}

// SongInfoDialog — 歌曲信息弹窗，显示元数据（标题/歌手/专辑/时长/路径）
function SongInfoDialog({ track, onClose }: SongInfoDialogProps) {
  // 格式化时长
  const formatDuration = (seconds: number): string => {
    if (!isFinite(seconds) || seconds <= 0) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // 格式化文件大小（从 mtime 推断不出来，显示路径）
  const formatPath = (path: string): string => {
    return path.replace(/\//g, '\\')
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h3 className="dialog__title">歌曲信息</h3>

        <div className="song-info">
          <div className="song-info__row">
            <span className="song-info__label">歌名</span>
            <span className="song-info__value">{track.title}</span>
          </div>
          <div className="song-info__row">
            <span className="song-info__label">歌手</span>
            <span className="song-info__value">{track.artist}</span>
          </div>
          <div className="song-info__row">
            <span className="song-info__label">专辑</span>
            <span className="song-info__value">{track.album}</span>
          </div>
          <div className="song-info__row">
            <span className="song-info__label">时长</span>
            <span className="song-info__value">{formatDuration(track.duration)}</span>
          </div>
          <div className="song-info__row">
            <span className="song-info__label">播放次数</span>
            <span className="song-info__value">{track.playCount}</span>
          </div>
          <div className="song-info__row">
            <span className="song-info__label">文件名</span>
            <span className="song-info__value song-info__value--path">{track.fileName}</span>
          </div>
          <div className="song-info__row">
            <span className="song-info__label">路径</span>
            <span
              className="song-info__value song-info__value--path song-info__value--clickable"
              onClick={() => window.electronAPI.invoke('open-file-location', track.filePath)}
              title="点击打开文件所在目录"
            >
              {formatPath(track.filePath)}
            </span>
          </div>
        </div>

        <div className="dialog__actions">
          <button className="dialog__btn dialog__btn--confirm" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default SongInfoDialog
