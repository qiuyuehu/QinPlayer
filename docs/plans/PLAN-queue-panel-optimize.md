# QinPlayer 播放队列面板优化 + queuePanel开关 执行方案

> 创建：2026-07-03
> 修订：2026-07-03（Codex 二审后修正）
> 状态：待确认

---

## 目标

1. 播放队列面板 UI 优化（6 个修改点）
2. 新增 `queuePanel` feature flag

## 非目标

- GPU 启动参数（拆成单独方案）
- 播放历史持久化
- 播放队列拖拽排序

---

## 功能清单

| 序号 | 功能 | 说明 |
|------|------|------|
| 1 | 砍掉历史记录标签页 | 只保留当前队列 |
| 2 | 清空队列逻辑修正 | 保留当前歌曲+之前的，只清空之后的 |
| 3 | 返回动画串行 | 歌词退出完再淡入主页面 |
| 4 | 固定宽度 320px | `width: min(320px, 100vw)` |
| 5 | 封面缩略图 36x36px | 无封面用 CSS 占位 |
| 6 | 歌曲名/歌手名省略号 | 超长文字省略号显示 |
| 7 | queuePanel flag | 新增独立开关 |

---

## 技术方案

### 1. 砍掉历史记录标签页

**改动文件**：`src/components/PlaylistPanel.tsx`

**改动内容**：
- 删除 `activeTab` 状态和标签页切换逻辑
- 删除"历史记录"标签页按钮
- 只保留当前队列渲染

```typescript
// 删除
const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue')

// 删除标签页切换按钮
// <button onClick={() => setActiveTab('history')}>历史记录</button>

// 简化 header
<header className="queue-panel__header">
  <div>
    <h2 className="queue-panel__title">播放队列</h2>
    <span className="queue-panel__count">{playlist.length} 首</span>
  </div>
  <button className="queue-panel__close" onClick={onClose} title="关闭播放队列">×</button>
</header>
```

---

### 2. 清空队列逻辑修正

**改动文件**：`src/components/PlaylistPanel.tsx`

**现状**：清空后只保留 currentTrack
**目标**：保留 currentTrack + 之前的歌曲，只清空之后的

```typescript
const handleClearQueue = () => {
  const { playlist, currentTrack } = usePlayerStore.getState()
  if (!currentTrack) {
    usePlayerStore.getState().setPlaylist([])
    return
  }
  const currentIndex = playlist.findIndex(t => t.id === currentTrack.id)
  if (currentIndex === -1) {
    usePlayerStore.getState().setPlaylist([])
  } else {
    // 保留当前歌曲+之前的，清空之后的
    usePlayerStore.getState().setPlaylist(playlist.slice(0, currentIndex + 1))
  }
}
```

**按钮文案**：`清空后续队列`

---

### 3. 返回动画串行

**改动文件**：`src/components/Content.tsx`

**import 补充**：需加入 `useRef`
```typescript
import { useState, useEffect, useRef } from 'react'
```

**现状**：歌词退出动画和主页面淡入动画同时触发
**目标**：歌词退出完再触发主页面淡入

```typescript
const [lyricsVisible, setLyricsVisible] = useState(activeNav === 'lyrics')
const [lyricsPhase, setLyricsPhase] = useState<'enter' | 'active' | 'exit' | 'done'>(
  activeNav === 'lyrics' ? 'active' : 'done'
)
const [showMainContent, setShowMainContent] = useState(activeNav !== 'lyrics')
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const rafRef = useRef<number | null>(null)

useEffect(() => {
  // 清理旧 timer，防止快速切换留下残留
  if (timerRef.current) {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }
  if (rafRef.current) {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }

  if (activeNav === 'lyrics' && featureFlags.lyrics) {
    setLyricsVisible(true)
    setLyricsPhase('enter')
    setShowMainContent(false)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setLyricsPhase('active'))
    })
  } else if (lyricsVisible) {
    setLyricsPhase('exit')
    timerRef.current = setTimeout(() => {
      setLyricsVisible(false)
      setLyricsPhase('done')
      setShowMainContent(true)
    }, 300)
  }
}, [activeNav, featureFlags.lyrics, lyricsVisible])

// 组件卸载时清理
useEffect(() => {
  return () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }
}, [])
```

**关键点**：
- `showMainContent` 在歌词退出动画结束后才设为 true
- `timerRef` 清理旧 timer，防止快速切换导航留下残留

---

### 4. 固定宽度 320px

**改动文件**：`src/styles/playlist-panel.css`

```css
.queue-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: min(320px, 100vw);  /* 固定宽度，极端窗口下不溢出 */
  height: 100vh;
  z-index: 1000;
  background-color: var(--bg-primary);
  border-left: 1px solid var(--border);
  box-shadow: -4px 0 18px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  animation: queuePanelSlideIn 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

### 5. 封面缩略图 36x36px

**改动文件**：`src/components/PlaylistPanel.tsx`、`src/styles/playlist-panel.css`

**实现**：自定义歌曲列表渲染，不复用 SongList

**封面路径**：使用现有 `window.electronAPI.getCoverUrl(track.coverPath)`，无封面时用 CSS 占位

```typescript
// PlaylistPanel.tsx — 自定义歌曲项渲染
// brokenCoverIds 记录封面加载失败的歌曲 ID，失败后走占位渲染
const [brokenCoverIds, setBrokenCoverIds] = useState<Set<number>>(new Set())

const handleCoverError = (trackId: number) => {
  setBrokenCoverIds(prev => new Set(prev).add(trackId))
}

<div className="queue-panel__list">
  {playlist.map((track, index) => (
    <div
      key={track.id}
      className={`queue-panel__item ${currentTrack?.id === track.id ? 'queue-panel__item--active' : ''}`}
      onClick={() => handlePlayTrack(track)}
      ref={(el) => { if (el) itemRefs.current.set(track.id, el); else itemRefs.current.delete(track.id) }}
    >
      {track.coverPath && !brokenCoverIds.has(track.id) ? (
        <img
          className="queue-panel__cover"
          src={window.electronAPI.getCoverUrl(track.coverPath)}
          alt=""
          onError={() => handleCoverError(track.id)}
        />
      ) : (
        <div className="queue-panel__cover queue-panel__cover--placeholder">
          <IconMusic />  {/* 音符图标 */}
        </div>
      )}
      <div className="queue-panel__info">
        <div className="queue-panel__title">{track.title}</div>
        <div className="queue-panel__artist">{track.artist}</div>
      </div>
      <span className="queue-panel__duration">{formatTime(track.duration)}</span>
    </div>
  ))}
</div>
```

**播放逻辑**：
```typescript
// 参考 SongList.tsx 的 handlePlay，补全播放副作用
const handlePlayTrack = (track: Track) => {
  if (!featureFlags.playback) return
  const { setCurrentTrack, setPlaying } = usePlayerStore.getState()
  // 保持当前完整队列，只切换当前歌曲
  setCurrentTrack(track)
  setPlaying(true)
  // 记录播放 —— 最近播放 + 播放次数
  if (featureFlags.recent) {
    window.electronAPI.invoke('songs:recordPlay', { songId: track.id })
  }
  window.electronAPI.invoke('songs:updatePlayCount', { songId: track.id })
}
```

**自动滚动**：自定义列表没有 songListRef，改用 itemRefs + scrollIntoView
```typescript
const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())

useEffect(() => {
  if (!currentTrack) return
  const el = itemRefs.current.get(currentTrack.id)
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}, [currentTrack, playlist])
```

**虚拟列表**：播放队列规模通常 < 100 首，不需要虚拟列表，直接渲染

**右键菜单**：播放队列面板不提供右键菜单（简化交互）

```css
/* playlist-panel.css */
.queue-panel__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  cursor: pointer;
}

.queue-panel__item--active {
  background-color: var(--bg-hover);
}

.queue-panel__cover {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}

.queue-panel__cover--placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
}

.queue-panel__info {
  flex: 1;
  min-width: 0;
}

.queue-panel__title {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-panel__artist {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-panel__duration {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
```

---

### 6. 歌曲名/歌手名省略号

已在方案 5 的 CSS 中实现：
```css
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
```

---

### 7. 新增 queuePanel feature flag

**改动文件**：

| 文件 | 改动 |
|------|------|
| `src/types/ipc.ts` | `FeatureFlagKey` 类型新增 `'queuePanel'` + `FeatureFlags` interface 新增 `queuePanel: boolean` |
| `src/utils/featureFlags.ts` | `FEATURE_FLAG_KEYS` 和 `DEFAULT_FEATURE_FLAGS` 新增 `queuePanel: true` |
| `src/components/PlayerBar.tsx` | 播放队列按钮和 PlaylistPanel 渲染加 `featureFlags.queuePanel` 守卫 |

**实现要点**：

```typescript
// src/types/ipc.ts
export type FeatureFlagKey =
  | 'playback' | 'equalizer' | 'lyrics' | 'albums'
  | 'recent' | 'liked' | 'search' | 'miniMode'
  | 'tray' | 'playlists' | 'settings' | 'fadeEffect'
  | 'mediaSession' | 'queuePanel'    // 新增

export interface FeatureFlags {
  playback: boolean
  equalizer: boolean
  lyrics: boolean
  albums: boolean
  recent: boolean
  liked: boolean
  search: boolean
  miniMode: boolean
  tray: boolean
  playlists: boolean
  settings: boolean
  fadeEffect: boolean
  mediaSession: boolean
  queuePanel: boolean    // 新增
}
```

```typescript
// src/utils/featureFlags.ts
export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = [
  // ... 现有 13 个
  'queuePanel',    // 新增
]

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  // ... 现有 13 个
  queuePanel: true,    // 新增，默认开启
}
```

```typescript
// src/components/PlayerBar.tsx
// 播放队列按钮：queuePanel=false 时隐藏
{featureFlags.playback && featureFlags.queuePanel && (
  <button
    className="player-bar__btn player-bar__btn--queue"
    onClick={() => setShowPlaylistPanel((visible) => !visible)}
    title="播放列表"
  >
    <IconList />
  </button>
)}

// PlaylistPanel 渲染：queuePanel=false 时不渲染
{showPlaylistPanel && featureFlags.queuePanel && (
  <PlaylistPanel onClose={() => setShowPlaylistPanel(false)} />
)}
```

**关闭行为**：
- `queuePanel=false` 时：播放队列按钮隐藏、PlaylistPanel 不渲染
- 不影响 `playback` flag（播放功能正常）

---

## 文件改动清单

| 文件 | 改动 | 类型 |
|------|------|------|
| `src/components/PlaylistPanel.tsx` | 砍掉标签页、清空逻辑、封面缩略图、省略号 | 重构 |
| `src/styles/playlist-panel.css` | 固定宽度、封面样式、省略号样式 | 重构 |
| `src/components/Content.tsx` | 返回动画串行 + timer 清理 | 增强 |
| `src/types/ipc.ts` | FeatureFlagKey + FeatureFlags 新增 queuePanel | 新增 |
| `src/utils/featureFlags.ts` | 新增 queuePanel flag | 新增 |
| `src/components/PlayerBar.tsx` | 按钮和面板加 queuePanel 守卫 | 增强 |

**不改动**：
- `SongList.tsx` — 不复用，播放队列自定义渲染
- `playerStore.ts` — 使用现有 playlist 状态
- `playlists.ts` — 复用现有 IPC
- `electron/main.ts` — GPU 参数拆成单独方案

---

## 前置条件

1. 读取 `src/components/PlaylistPanel.tsx` — 了解现有实现
2. 读取 `src/components/Content.tsx` — 了解动画逻辑
3. 读取 `src/types/ipc.ts` — 了解 FeatureFlagKey 和 FeatureFlags 类型
4. 读取 `src/utils/featureFlags.ts` — 了解 flag 定义
5. 读取 `src/components/PlayerBar.tsx` — 了解播放队列按钮
6. 读取 `src/utils/formatTime.ts` — 时间格式化函数
7. 读取 `src/components/Icons.tsx` — 确认 IconMusic 图标是否存在

## 验证方法

1. `npx tsc --noEmit` — TypeScript 语法检查
2. `npm test` — 全量测试通过（以实际输出为准）
3. `npm run build` — 打包正常
4. `npm run dev` — 启动后验证：
   - 播放队列面板：固定宽度 320px，无标签页
   - 封面缩略图：36x36px 圆角，无封面显示 CSS 占位
   - 歌曲名/歌手名：超长省略号
   - 清空队列：保留当前歌曲+之前的，按钮文案"清空后续队列"
   - 返回动画：歌词退出完再淡入主页面，快速切换无残留
   - queuePanel flag：关闭时按钮隐藏

## 测试计划

| 测试文件 | 测试点 |
|----------|--------|
| `tests/PlaylistPanel.test.tsx`（重构） | 无标签页、封面渲染、省略号、清空逻辑 |
| `tests/featureFlags.test.ts`（扩展） | queuePanel 默认 true |
| `tests/PlayerBar.test.tsx`（扩展） | queuePanel=false 时按钮隐藏 |

**注意**：省略号在 jsdom 中无法验证视觉效果，测试只断言 class/style，视觉效果放手测或截图验证。
---

## 拆除项（单独开方案）

1. **GPU 启动参数优化** — Electron 启动/runtime 行为，风险和验证方式不同

---

*方案就绪，等主人确认后交给 Codex 执行。*
