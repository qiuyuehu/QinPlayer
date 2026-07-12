# QinPlayer 播放队列面板续作方案

> 创建：2026-07-02
> 基于：上一轮 Codex 实现已提交（SongList滚动+PlaylistPanel+歌单封面）
> 状态：待确认

---

## 已完成（上一轮）

- ✅ SongList: forwardRef + scrollToTrackId + containerHeight
- ✅ PlaylistPanel: 底部弹出面板，显示当前播放队列
- ✅ 歌单封面: 子查询取 coverPath + 占位图
- ✅ 动画: opacity fade-in + prefers-reduced-motion
- ✅ 播放列表按钮: 已添加，歌词按钮已删
- ✅ 封面点击进歌词: 保留

## 剩余缺口

| 序号 | 功能 | 现状 | 目标 |
|------|------|------|------|
| 1 | 播放队列面板位置 | 底部弹出 | 右侧滑入侧边面板 |
| 2 | 播放队列面板标签页 | 无 | 当前队列 + 历史记录 |
| 3 | 右键菜单增强 | 无"添加到播放队列" | 新增该选项 |
| 4 | 封面进播放界面动画 | 无动画 | 向上滑入过渡 |
| 5 | 歌单重命名 | 无右键菜单 | 右键菜单 + 内联编辑 |

## 技术方案

### 1. 播放队列面板：改为右侧滑入侧边面板

**现状**：`PlaylistPanel.tsx` 是底部弹出面板，使用 overlay + 固定高度
**目标**：右侧滑入侧边面板，宽度 30%（响应式），两个标签页

**改动文件**：
- `src/components/PlaylistPanel.tsx` — 重写布局，改为右侧滑入
- `src/styles/playlist-panel.css` — 重写样式，右侧定位 + 滑入动画

**实现要点**：
```typescript
// PlaylistPanel.tsx 改动
interface PlaylistPanelProps {
  onClose: () => void
}

function PlaylistPanel({ onClose }: PlaylistPanelProps) {
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue')
  const playlist = usePlayerStore((s) => s.playlist)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const songListRef = useRef<SongListHandle>(null)

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 自动滚动到当前歌曲
  useEffect(() => {
    if (!currentTrack || activeTab !== 'queue') return
    songListRef.current?.scrollToTrackId(currentTrack.id)
  }, [currentTrack, playlist, activeTab])

  return (
    <div className="queue-panel" role="dialog" aria-label="播放队列">
      {/* 标签页切换 */}
      <div className="queue-panel__tabs">
        <button
          className={`queue-panel__tab ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          当前队列
        </button>
        <button
          className={`queue-panel__tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          历史记录
        </button>
        <button className="queue-panel__close" onClick={onClose} title="关闭">×</button>
      </div>

      {/* 歌曲列表 */}
      <div className="queue-panel__content">
        {activeTab === 'queue' ? (
          playlist.length > 0 ? (
            <SongList
              ref={songListRef}
              tracks={playlist}
              showIndex
              showAlbum={false}
            />
          ) : (
            <div className="queue-panel__empty">当前播放队列为空</div>
          )
        ) : (
          <div className="queue-panel__empty">暂无播放历史</div>
        )}
      </div>

      {/* 底部操作栏 */}
      {activeTab === 'queue' && playlist.length > 0 && (
        <div className="queue-panel__footer">
          <span className="queue-panel__count">{playlist.length} 首</span>
          <button
            className="queue-panel__clear"
            onClick={() => {
              // 清空队列但保留当前播放歌曲，避免"正在播放但队列为空"的歧义
              const { currentTrack } = usePlayerStore.getState()
              usePlayerStore.getState().setPlaylist(currentTrack ? [currentTrack] : [])
            }}
          >
            清空后续队列
          </button>
        </div>
      )}
    </div>
  )
}
```

**样式改动**：
```css
/* playlist-panel.css */
.queue-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 30vw;           /* 响应式宽度 */
  min-width: 280px;
  max-width: 480px;
  height: 100vh;
  background: var(--bg-primary);
  border-left: 1px solid var(--border);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  transform: translateX(0);
  transition: transform 250ms cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.1);
}

/* 关闭状态：移出视口 */
.queue-panel--closed {
  transform: translateX(100%);
}
```

**关闭方式**：不使用遮罩层（overlay），只通过以下方式关闭：
- 关闭按钮（×）
- ESC 键
- 点击播放列表按钮再次切换

**理由**：右侧面板是辅助面板，不需要阻断用户操作。用户可以在面板打开时继续操作主内容区（如切换歌曲、查看歌词）。

**PlayerBar 入口**：
- 保持现有播放列表按钮（IconList）
- 点击切换 `showQueuePanel` 状态
- 受 `playback` flag 控制

---

### 2. 右键菜单增强：新增"添加到播放队列"

**现状**：`SongList.tsx` 已有右键菜单（ContextMenu），包含播放、添加到歌单、从歌单移除、打开文件目录、歌曲信息
**目标**：新增"添加到播放队列"选项

**改动文件**：
- `src/components/SongList.tsx` — 新增菜单项

**实现要点**：
```typescript
// SongList.tsx — 在 buildContextMenuItems 函数中新增
const handleAddToQueue = (track: Track) => {
  const { playlist, currentTrack } = usePlayerStore.getState()
  
  // 检查是否已在队列中
  const exists = playlist.some(t => t.id === track.id)
  if (exists) {
    // 已存在则跳过（可选：显示 toast 提示）
    return
  }
  
  // 插入到当前播放歌曲的后一个位置
  if (currentTrack) {
    const currentIndex = playlist.findIndex(t => t.id === currentTrack.id)
    const newPlaylist = [...playlist]
    if (currentIndex === -1) {
      // 当前歌曲不在 playlist 中（异常情况），追加到末尾
      newPlaylist.push(track)
    } else {
      newPlaylist.splice(currentIndex + 1, 0, track)
    }
    usePlayerStore.getState().setPlaylist(newPlaylist)
  } else {
    // 没有当前播放歌曲，添加到队列末尾
    usePlayerStore.getState().setPlaylist([...playlist, track])
  }
}

// 菜单项条件渲染
// 菜单项：先条件构造数组，再传给 ContextMenu
// 注意：MenuItem 的点击字段是 `action`（不是 onClick），没有 `visible` 字段
const menuItems: MenuItem[] = []

if (featureFlags.playback) {
  menuItems.push(
    { label: '播放', icon: IconPlay, action: () => handlePlay(track) },
    { label: '添加到播放队列', icon: IconList, action: () => handleAddToQueue(track) }
  )
}
// ... 其他菜单项同理，条件 push
```

**命名规范**：使用"播放队列"而非"播放列表"，避免与"歌单"混淆

---

### 3. 封面进播放界面动画：向上滑入

**现状**：封面点击直接切换到歌词页面，无过渡动画
**目标**：向上滑入过渡效果，300ms

**改动文件**：
- `src/components/Content.tsx` — 添加滑入动画逻辑
- `src/styles/content.css` — 添加动画样式

**实现方案**：使用 CSS transition + 状态控制，不引入 react-transition-group

```css
/* content.css */
.content__lyrics-enter {
  transform: translateY(100%);
  opacity: 0;
}

.content__lyrics-enter-active {
  transform: translateY(0);
  opacity: 1;
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
              opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.content__lyrics-exit {
  transform: translateY(0);
  opacity: 1;
}

.content__lyrics-exit-active {
  transform: translateY(100%);
  opacity: 0;
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
              opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

**与现有路由的关系**：当前 `Content.tsx` 使用 `renderPage()` 单点渲染（switch case 匹配 activeNav）。歌词动画需要分层处理，避免双渲染：

```typescript
// Content.tsx — 歌词页面分层渲染
// 策略：歌词页面始终渲染（用 visibility/opacity 控制显隐），其他页面正常 switch
// 这样退出动画期间，歌词页面仍可执行滑出动画，不会被 renderPage() 立即卸载

const [lyricsVisible, setLyricsVisible] = useState(false)
const [lyricsAnimating, setLyricsAnimating] = useState(false)

useEffect(() => {
  if (activeNav === 'lyrics') {
    setLyricsVisible(true)
    setLyricsAnimating(true)
    const timer = setTimeout(() => setLyricsAnimating(false), 300)
    return () => clearTimeout(timer)
  } else if (lyricsVisible) {
    // 退出动画
    setLyricsAnimating(true)
    const timer = setTimeout(() => {
      setLyricsVisible(false)
      setLyricsAnimating(false)
    }, 300)
    return () => clearTimeout(timer)
  }
}, [activeNav])

// 渲染：歌词页面独立于 renderPage()，避免冲突
return (
  <div className="content">
    {/* 歌词页面：分层渲染，不受 renderPage() 影响 */}
    {lyricsVisible && (
      <div className={`content__lyrics ${
        activeNav === 'lyrics'
          ? (lyricsAnimating ? 'content__lyrics-enter-active' : '')
          : (lyricsAnimating ? 'content__lyrics-exit-active' : '')
      }`}>
        <Lyrics />
      </div>
    )}

    {/* 其他页面：正常 switch 渲染，歌词激活时隐藏 */}
    {activeNav !== 'lyrics' && (
      <div className={`content__page fade-key-${fadeKey}`}>
        {renderPage()}
      </div>
    )}
  </div>
)
```

**关键点**：
- 歌词页面独立于 `renderPage()`，用 `lyricsVisible` 控制挂载/卸载
- 退出动画期间（`lyricsAnimating=true`），歌词页面仍渲染，不会被立即卸载
- `activeNav !== 'lyrics'` 时才渲染其他页面，避免双渲染

---

### 4. 歌单重命名：右键菜单 + 内联编辑

**现状**：`Playlists.tsx` 已有歌单列表，但无右键菜单
**目标**：右键菜单选重命名，内联输入框原位编辑

**改动文件**：
- `src/pages/Playlists.tsx` — 新增右键菜单 + 内联编辑逻辑
- `src/styles/playlists.css` — 新增重命名输入框样式

**实现要点**：
```typescript
// Playlists.tsx
const [contextMenu, setContextMenu] = useState<{
  x: number
  y: number
  playlist: Playlist
} | null>(null)

const [editingPlaylistId, setEditingPlaylistId] = useState<number | null>(null)
const [editingName, setEditingName] = useState('')

const handleContextMenu = (e: React.MouseEvent, playlist: Playlist) => {
  e.preventDefault()
  setContextMenu({ x: e.clientX, y: e.clientY, playlist })
}

const handleRename = () => {
  if (contextMenu) {
    setEditingPlaylistId(contextMenu.playlist.id)
    setEditingName(contextMenu.playlist.name)
    setContextMenu(null)
  }
}

const handleConfirmRename = async () => {
  if (editingPlaylistId && editingName.trim()) {
    await window.electronAPI.invoke('playlists:rename', {
      id: editingPlaylistId,
      name: editingName.trim()
    })
    loadPlaylists()
  }
  setEditingPlaylistId(null)
  setEditingName('')
}

const handleCancelRename = () => {
  setEditingPlaylistId(null)
  setEditingName('')
}

// 渲染
{playlists.map(playlist => (
  <div
    key={playlist.id}
    className="playlists__card"
    onContextMenu={(e) => handleContextMenu(e, playlist)}
  >
    {editingPlaylistId === playlist.id ? (
      <input
        type="text"
        value={editingName}
        onChange={(e) => setEditingName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConfirmRename()
          if (e.key === 'Escape') handleCancelRename()
        }}
        onBlur={handleConfirmRename}
        autoFocus
        className="playlists__rename-input"
      />
    ) : (
      <h3 className="playlists__name">{playlist.name}</h3>
    )}
  </div>
))}

// 右键菜单
{contextMenu && (
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    onClose={() => setContextMenu(null)}
    items={[
      { label: '重命名', action: handleRename },
      { label: '删除', action: () => handleDelete(contextMenu.playlist.id) }
    ]}
  />
)}
```

**现有 IPC 复用**：`playlists:rename` 已存在，参数 `{ id, name }`，无需新增

---

## 文件改动清单

| 文件 | 改动 | 类型 |
|------|------|------|
| `src/components/PlaylistPanel.tsx` | 重写为右侧滑入侧边面板 + 标签页 | 重构 |
| `src/styles/playlist-panel.css` | 重写样式：右侧定位 + 滑入动画 | 重构 |
| `src/components/SongList.tsx` | 新增"添加到播放队列"菜单项 | 增强 |
| `src/components/Content.tsx` | 封面进播放界面动画 | 新增 |
| `src/styles/content.css` | 新增滑入动画样式 | 新增 |
| `src/pages/Playlists.tsx` | 新增右键菜单 + 内联编辑 | 增强 |
| `src/styles/playlists.css` | 新增重命名输入框样式 | 增增 |

**不改动**：
- `playerStore.ts` — 使用现有 `playlist` 状态，无需新增
- `playlists.ts` — 现有 `playlists:rename` IPC 已满足需求
- `electron/main.ts` — GPU 加速单独开方案

---

## 前置条件

1. 读取 `src/components/PlaylistPanel.tsx` — 了解现有实现
2. 读取 `src/components/SongList.tsx` — 右键菜单结构
3. 读取 `src/pages/Playlists.tsx` — 歌单页面布局
4. 读取 `src/styles/playlist-panel.css` — 现有样式
5. 读取 `src/styles/content.css` — 内容区布局

## 验证方法

1. `npx tsc --noEmit` — TypeScript 语法检查
2. `npm test` — 全量测试通过（121 用例 + 新增测试）
3. `npm run dev` — 启动后验证：
   - 播放队列面板：右侧滑入、标签页切换、歌曲列表、清空队列
   - 右键菜单：新增"添加到播放队列"、重复歌曲跳过
   - 封面进播放界面：向上滑入动画
   - 歌单重命名：右键菜单、内联编辑、Enter/Esc 快捷键

## 测试计划

| 测试文件 | 测试点 |
|----------|--------|
| `tests/PlaylistPanel.test.tsx`（扩展） | 右侧滑入、标签页切换、清空队列 |
| `tests/SongList.test.tsx`（扩展） | "添加到播放队列"菜单项、重复歌曲跳过 |
| `tests/Playlists.test.tsx`（扩展） | 右键菜单、重命名交互、Enter/Esc |

## 风险与回滚

| 风险 | 应对 |
|------|------|
| 右侧面板遮挡内容 | 添加遮罩层或调整内容区宽度 |
| 动画性能问题 | 使用 transform + will-change 优化 |
| 右键菜单与现有功能冲突 | 严格条件渲染 |

**回滚方式**：
- 播放队列面板：恢复底部弹出实现
- 右键菜单：移除新增菜单项
- 动画：删除 CSS 动画类
- 歌单重命名：移除右键菜单和内联编辑

---

## 拆除项（单独开方案）

1. **GPU 加速优化** — 涉及 electron/main.ts、新增 IPC、设置页展示，与本需求弱相关
2. **播放历史记录** — 需要新增状态 + 持久化逻辑，可作为后续迭代
3. **播放队列拖拽排序** — 复杂交互，后续迭代

---

*方案就绪，等主人确认后执行。*
