# 任务包：清理 SongList 死代码 + PlaylistPanel/MiniQueueView 右键菜单

> 来源：C-D 审查的 2 个建议修复
> 模型：Balanced 足够

## 入场条件

- `npm run verify` 基线全绿
- 读完 `src/hooks/useTrackContextMenu.tsx` 了解 Hook 契约
- 读完 `src/components/SongList.tsx` 了解当前接入方式

## 任务 1：清理 SongList 死代码

`useTrackContextMenu` hook 已接管了菜单目标、playlists 加载和菜单项构建，但 SongList 中以下旧代码还在：

1. `contextMenu` state（约 line 58）— 已被 `trackMenu.target` 替代
2. `playlists` state（约 line 70）— 已被 hook 内部的 `playlists` 替代
3. `getMenuItems` 函数（约 line 177）— 已被 `trackMenu.getItems` 替代
4. 旧的 ContextMenu 渲染代码（约 line 343）— 已被 hook 的 target 驱动替代

**保留不动**：
- `likedIds` state + `toggleLike` — SongList 特有的收藏功能
- 虚拟列表、forwardRef、playlistId、onRemoveFromPlaylist

**验证**：
```bash
npx vitest run tests/SongList.test.tsx
npx tsc --noEmit
```

## 任务 2：PlaylistPanel 加右键菜单

`src/components/PlaylistPanel.tsx`：

- import `useTrackContextMenu` 和 `ContextMenu`、`SongInfoDialog`
- 调用 hook：
  ```ts
  const trackMenu = useTrackContextMenu({
    onPlay: handlePlayTrack,
    onAddToPriorityQueue: (track) => addToPriorityQueue(track),
    canAddToPriorityQueue: (track) => currentTrack?.id !== track.id && !priorityQueue.some(t => t.id === track.id),
    playbackEnabled: true,  // PlaylistPanel 只在播放功能开启时显示
    playlistsEnabled: featureFlags?.playlists ?? true,
  })
  ```
- playlist 行的 button 加 `onContextMenu={(e) => trackMenu.open(e, track, 'source')}`
- priority 行的 div 加 `onContextMenu={(e) => trackMenu.open(e, track, 'priority')}`
- 渲染 `{trackMenu.target && <ContextMenu items={trackMenu.getItems(trackMenu.target.track, trackMenu.target.kind)} x={trackMenu.target.x} y={trackMenu.target.y} onClose={trackMenu.close} />}`
- 渲染 `{trackMenu.songInfoTrack && <SongInfoDialog track={trackMenu.songInfoTrack} onClose={trackMenu.closeSongInfo} />}`

**注意**：
- PlaylistPanel 已经有 `useExitTransition`，退出动画期间右键菜单应该被禁用（检查 `isExiting`）
- priority 行当前是 `<div>` + `<button>` 嵌套，onContextMenu 放在外层 div 上
- 需要从 store 读取 `addToPriorityQueue` 和 `featureFlags`

**验证**：
```bash
npx vitest run tests/PlaylistPanel.test.tsx
npx tsc --noEmit
```

## 任务 3：MiniQueueView 加右键菜单

`src/components/MiniQueueView.tsx`：

- import `useTrackContextMenu` 和 `ContextMenu`、`SongInfoDialog`
- Props 新增 `onAddToPriorityQueue: (track: Track) => void` 和 `canAddToPriorityQueue: (track: Track) => boolean`
- 调用 hook：
  ```ts
  const trackMenu = useTrackContextMenu({
    onPlay,
    onAddToPriorityQueue,
    canAddToPriorityQueue,
    playbackEnabled: true,
    playlistsEnabled: false,  // Mini 窗口不显示歌单菜单（空间不够）
  })
  ```
- source 行和 priority 行加 `onContextMenu`
- 渲染 ContextMenu 和 SongInfoDialog

`src/components/MiniQueueViewContainer.tsx`：
- 从 store 读取 `addToPriorityQueue`，传给 MiniQueueView
- 传 `canAddToPriorityQueue` 函数

**注意**：
- 400×150 窗口空间有限，菜单可能溢出——ContextMenu 组件已有边界自动调整
- 不要破坏现有的订阅隔离（Container 读 store，View 只接收 props）
- 保持 `-webkit-app-region: no-drag`

**验证**：
```bash
npx vitest run tests/MiniQueueView.test.tsx tests/MiniPlayer.test.tsx
npx tsc --noEmit
```

## 全量验收

```bash
npm run verify
```

## 约束

1. 不改 useTrackContextMenu hook 的接口
2. 不改 playerStore
3. 不改 useAudioSync
4. 不改 SongList 的虚拟列表、likedIds、forwardRef 逻辑
5. 不新增 IPC / preload 通道
6. 不新增 npm 依赖
