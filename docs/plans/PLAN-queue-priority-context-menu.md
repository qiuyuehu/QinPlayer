# 方案：播放列表右键菜单 + 队列优先级

## 需求

1. PlaylistPanel（主页面右下角播放列表）和 MiniQueueView（迷你模式队列视图）新增右键菜单，复用 SongList 的菜单逻辑。
2. "添加到播放队列"的歌曲优先级高于播放方式——即使在随机模式下，下一首也应该是队列中的歌曲。

## 现状

### 右键菜单

- SongList 已有完整右键菜单：播放、添加到播放队列、添加到歌单、打开文件目录、歌曲信息
- 菜单逻辑（state + handler + getMenuItems）全部内联在 SongList 内部
- PlaylistPanel 和 MiniQueueView 没有右键菜单

### 播放队列

- playerStore 只有 `playlist: Track[]`，没有独立的 `queue`
- `nextTrack` 随机模式从整个 `playlist` 随机选
- `handleAddToQueue`（SongList 里）把歌曲插入 `playlist` 的当前位置后面
- 随机模式下手动添加的歌曲没有优先权

## 改动清单

### A. 提取右键菜单 Hook

**新建 `src/hooks/useTrackContextMenu.ts`**

从 SongList 提取右键菜单逻辑为独立 hook：

```ts
interface UseTrackContextMenuOptions {
  onPlay: (track: Track) => void
  onAddToQueue: (track: Track) => void
}

interface UseTrackContextMenuReturn {
  contextMenu: { x: number; y: number; track: Track } | null
  songInfoTrack: Track | null
  handleContextMenu: (e: React.MouseEvent, track: Track) => void
  closeContextMenu: () => void
  closeSongInfo: () => void
}
```

Hook 内部：
- 管理 `contextMenu` 和 `songInfoTrack` state
- `handleContextMenu`：preventDefault + 记录坐标和歌曲
- 构建菜单项：播放、添加到播放队列、添加到歌单、打开文件目录、歌曲信息
- 加载 playlists 列表和 likedIds（和 SongList 现有逻辑一致）
- 返回 contextMenu state、handler、关闭函数

**修改 `src/components/SongList.tsx`**

- 删除内联的右键菜单 state 和 handler（lines 53-59, 130-147, 149-167, 171-239）
- 改为调用 `useTrackContextMenu({ onPlay: handlePlay, onAddToQueue })`
- 保留 SongList 特有的逻辑（virtualList、playlistId、onRemoveFromPlaylist）
- `getMenuItems` 中的"从歌单移除"选项保留在 SongList 内部（不放入 hook）

### B. PlaylistPanel 加右键菜单

**修改 `src/components/PlaylistPanel.tsx`**

- import `useTrackContextMenu` 和 `ContextMenu`
- 调用 `useTrackContextMenu({ onPlay: handlePlayTrack, onAddToQueue })`
- 每个 track 按钮加 `onContextMenu={(e) => handleContextMenu(e, track)}`
- 渲染 `{contextMenu && <ContextMenu ... />}`
- 渲染 `{songInfoTrack && <SongInfoDialog ... />}`

### C. MiniQueueView 加右键菜单

**修改 `src/components/MiniQueueView.tsx`**

- Props 新增 `onAddToQueue: (track: Track) => void`
- import `useTrackContextMenu` 和 `ContextMenu`
- 调用 `useTrackContextMenu({ onPlay, onAddToQueue })`
- 每个 track 按钮加 `onContextMenu`
- 渲染 ContextMenu 和 SongInfoDialog

**修改 `src/components/MiniQueueViewContainer.tsx`**

- 从 store 读取 `queue`、`queueIndex`、`addToQueue`
- 传递 `queue`、`currentQueueIndex`、`onAddToQueue` 给 MiniQueueView

### D. 队列优先级（playerStore）

**修改 `src/stores/playerStore.ts`**

新增状态：
```ts
queue: Track[]           // 手动添加的播放队列（独立于 playlist）
queueIndex: number       // 当前播到 queue 的哪个位置（-1 = 未开始播 queue）
```

新增 actions：
```ts
addToQueue: (track: Track) => void    // 添加到 queue 末尾
removeFromQueue: (trackId: number) => void  // 从 queue 移除
clearQueue: () => void                // 清空 queue
```

修改 `nextTrack`：
```ts
nextTrack: () => {
  const { queue, queueIndex, playlist, currentTrack, playMode } = get()
  
  // 1. 优先检查 queue
  if (queue.length > 0) {
    const nextQueueIndex = queueIndex + 1
    if (nextQueueIndex < queue.length) {
      set({ queueIndex: nextQueueIndex })
      get().playTrack(queue[nextQueueIndex])
      return
    }
    // queue 播完了，清空 queue 和 queueIndex
    set({ queue: [], queueIndex: -1 })
  }
  
  // 2. queue 为空，按播放方式选
  // （现有逻辑不变）
}
```

修改 `prevTrack`：
```ts
prevTrack: () => {
  const { queue, queueIndex, playlist, currentTrack, playMode } = get()
  
  // 1. 如果正在播 queue，可以往回
  if (queue.length > 0 && queueIndex > 0) {
    const prevQueueIndex = queueIndex - 1
    set({ queueIndex: prevQueueIndex })
    get().playTrack(queue[prevQueueIndex])
    return
  }
  
  // 2. 按播放方式选
  // （现有逻辑不变）
}
```

修改 `handleAddToQueue`（原 SongList 内部逻辑，迁移到 store）：
```ts
// SongList 的 handleAddToQueue 改为调用 store.addToQueue
addToQueue: (track) => {
  const { queue } = get()
  if (queue.some(t => t.id === track.id)) return  // 去重
  set({ queue: [...queue, track] })
}
```

修改 `setPlaylist`：
```ts
setPlaylist: (list) => set({ playlist: list, queue: [], queueIndex: -1 })
// 开始新播放列表时，手动队列清空
```

### E. PlaylistPanel 显示 queue

**修改 `src/components/PlaylistPanel.tsx`**

- 新增显示 queue 区域（在 playlist 列表下方或上方）
- queue 有歌曲时显示"即将播放"标题 + queue 列表
- queue 列表每项也支持右键菜单和点击播放
- queue 列表每项显示 x 按钮（hover 时可见），点击调用 `removeFromQueue`
- 清空队列按钮同时清空 queue 和 playlist

### F. MiniQueueView 显示 queue

**修改 `src/components/MiniQueueView.tsx`**

- Props 新增 `queue: Track[]` 和 `currentQueueIndex: number`
- 在 tracks 列表下方显示 queue 列表（有 queue 时）
- queue 列表每项也支持右键菜单
- queue 列表每项显示 x 按钮（hover 时可见），点击调用 `removeFromQueue`

## 改动文件

| 文件 | 改动 |
|------|------|
| `src/hooks/useTrackContextMenu.ts` | **新建**：提取右键菜单逻辑 |
| `src/components/SongList.tsx` | 改用 useTrackContextMenu hook |
| `src/components/PlaylistPanel.tsx` | 加右键菜单 + 显示 queue |
| `src/components/MiniQueueView.tsx` | 加右键菜单 + 显示 queue |
| `src/components/MiniQueueViewContainer.tsx` | 读取 queue/addToQueue 传给 MiniQueueView |
| `src/stores/playerStore.ts` | 新增 queue 状态和 addToQueue/removeFromQueue/clearQueue，修改 nextTrack/prevTrack |
| `src/styles/playlist-panel.css` | queue 区域样式 |
| `src/styles/miniplayer.css` | queue 列表样式 |

## 约束条件

1. 不改 SongList 的虚拟列表逻辑
2. 不改播放模式（sequential/loop/shuffle）的切换逻辑
3. queue 和 playlist 独立，互不影响
4. 右键菜单样式复用现有 ContextMenu 组件
5. 去重逻辑：同一首歌不重复添加到 queue
6. queue 播完后自动回到 playlist + 播放方式
7. 不改后端 IPC
8. 不持久化 queue（重启后清空）

## 回归测试

### 新增测试

**`tests/useTrackContextMenu.test.ts`**：
1. 右键触发返回正确的 contextMenu state
2. 菜单项包含播放、添加到播放队列、添加到歌单、打开目录、歌曲信息
3. 关闭菜单清空 state

**`tests/playerStore.test.ts`**（扩展）：
4. addToQueue 添加歌曲到 queue
5. addToQueue 去重（同一首歌不重复添加）
6. nextTrack 优先播 queue（随机模式下验证）
7. queue 播完后回到 playlist + 播放方式
8. prevTrack 可以在 queue 内往回
9. clearQueue 清空 queue

**`tests/PlaylistPanel.test.tsx`**（扩展）：
10. 右键菜单渲染
11. queue 区域渲染

**`tests/MiniQueueView.test.tsx`**（扩展）：
12. 右键菜单渲染
13. queue 列表渲染

### 手动验证

1. 主页面播放列表：右键歌曲 → 菜单正常显示
2. 迷你模式队列：右键歌曲 → 菜单正常显示
3. 右键"添加到播放队列" → 歌曲加入 queue
4. 随机模式下 → 下一首优先播 queue 中的歌曲
5. queue 播完 → 自动回到随机模式
6. 重启应用 → queue 清空，playlist 保持
