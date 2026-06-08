// =============================================================================
// QinPlayer — 底部播放控制条（占位）
// =============================================================================
// 职责：显示歌曲信息、播放控制按钮、进度条、音量
// Phase 1 Task 1.3：只显示占位文字，Task 1.9 完整实现
// =============================================================================

function PlayerBar() {
  return (
    <div className="player-bar">
      {/* 左侧：歌曲信息 */}
      <div className="player-bar__info">
        <div className="player-bar__cover" />
        <div className="player-bar__meta">
          <span className="player-bar__title">未在播放</span>
          <span className="player-bar__artist">-</span>
        </div>
      </div>

      {/* 中间：控制按钮 + 进度条 */}
      <div className="player-bar__controls">
        <span className="player-bar__placeholder-text">播放控制条</span>
      </div>

      {/* 右侧：播放模式 + 音量 */}
      <div className="player-bar__extra">
        <span className="player-bar__placeholder-text">音量</span>
      </div>
    </div>
  )
}

export default PlayerBar
