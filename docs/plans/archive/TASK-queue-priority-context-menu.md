# 任务包：播放队列优先级与歌曲右键菜单

> 来源：PLAN-queue-priority-context-menu.md（Reviewer 重写版）
> 建议模型：Strong（涉及 playerStore 核心状态机 + useAudioSync + 跨视图 UI）

## 入场条件

- `npm run verify` 基线全绿
- 读完 `docs/plans/PLAN-queue-priority-context-menu.md` 全文
- 读完第 5 节（产品语义）和第 6 节（批次门禁）

## 批次 A：优先队列状态机

### 改动文件
- `src/stores/playerStore.ts`

### 状态新增
```ts
priorityQueue: Track[]                    // 未消费 FIFO
priorityResumeTrackId: number | null      // 插队前锚点
priorityConsumedTrackIds: number[]        // 本次段已消费 ID
```

### Actions 新增
```ts
addToPriorityQueue(track: Track): void
removeFromPriorityQueue(trackId: number): void
clearPriorityQueue(): void
clearUpcoming(): void    // 原子：截断 playlist + 清 priorityQueue
```

### 核心规则
1. 不新增 `queueIndex`；消费时 shift 出队首
2. 抽取内部 `commitTrack(track, extraState?)`：统一重置进度 + set() + 播放记账
3. 公开 `playTrack(track)` = 用户意图：清 queue/resume/consumed + commitTrack
4. `nextTrack/prevTrack` 内部调 commitTrack，不回调公开 playTrack
5. `setPlaylist(list)` = 切换来源：清 queue/resume/consumed
6. `clearUpcoming()` 在 store 原子执行
7. ID 查找失败走 fallback，禁止 -1 进入取模
8. priorityQueue 不进入 settings 持久化

### 测试（扩展 tests/playerStore.test.ts）
至少 15 个用例，覆盖第 5.1 节全部动作规则 + 第 5.2 节恢复规则。每次测试显式重置新增字段。

### 验收
```bash
npx vitest run tests/playerStore.test.ts
npx tsc --noEmit
```

---

## 批次 B：自然结束覆盖 loop

### 改动文件
- `src/hooks/useAudioSync.ts`

### 改动
在 loop 重播前读取实时 store 的 `priorityQueue.length` 和 `priorityResumeTrackId`：

```text
播放功能关闭 / 旧音频 ended → 忽略
priorityQueue 非空或 priorityResumeTrackId 非空 → nextTrack()
playMode === loop → 当前音频归零重播
其他模式 → nextTrack()
```

### 测试（扩展 tests/useAudioSync.test.tsx）
5 个用例：
1. loop + 无插队：保持重播
2. loop + pending：ended 调 nextTrack
3. loop + resume 但 pending 已空：回到 resume 锚点
4. sequential/shuffle + pending：只前进一次
5. playback=false 和 trackTransitionRef 不退化

### 验收
```bash
npx vitest run tests/useAudioSync.test.tsx tests/playerStore.test.ts
npx tsc --noEmit
```

---

## 批次 C：通用右键菜单

### 改动文件
- `src/hooks/useTrackContextMenu.tsx`（新建）
- `src/components/SongList.tsx`
- `tests/useTrackContextMenu.test.tsx`（新建）
- `tests/SongList.test.tsx`（扩展）

### Hook 契约
```ts
type TrackMenuKind = 'source' | 'priority'

interface UseTrackContextMenuOptions {
  onPlay: (track: Track) => void
  onAddToPriorityQueue: (track: Track) => void
  onRemoveFromPriorityQueue?: (trackId: number) => void
  canAddToPriorityQueue: (track: Track) => boolean
  getExtraItems?: (track: Track) => MenuItem[]
}
```

### Hook 职责边界
**负责**：菜单目标 state、open/close handler、公共菜单项构建、playlists 懒加载（首次打开时读取）
**不负责**：likedIds、爱心切换、虚拟列表、ContextMenu 渲染、AudioEngine

### 菜单项语义
- **source 项**：播放、添加到接下来播放（disabled 条件）、添加到歌单、extra items、打开目录、歌曲信息
- **priority 项**：播放（清剩余 pending）、从接下来移除、添加到歌单、打开目录、歌曲信息

### SongList 改动
- 保留：虚拟列表、初始行动画、likedIds、playlistId 特有逻辑
- 删除：内联菜单目标、songInfoTrack、playlists、公共菜单项
- "从歌单移除"通过 getExtraItems 注入
- handlePlay 仍 setPlaylist(tracks) + playTrack(track)

### 测试
1. source/priority 菜单项正确
2. feature flags 隐藏/显示项
3. playlists 懒加载，同实例不重复请求
4. add/remove/play/info/open location 路由
5. SongList 特有项保留
6. liked=false 和虚拟列表不退化

### 验收
```bash
npx vitest run tests/useTrackContextMenu.test.tsx tests/SongList.test.tsx
npx tsc --noEmit
```

---

## 批次 D：队列视图 UI

### 改动文件
- `src/components/PlaylistPanel.tsx`
- `src/components/MiniQueueView.tsx`
- `src/components/MiniQueueViewContainer.tsx`
- `src/styles/playlist-panel.css`
- `src/styles/miniplayer.css`
- `tests/PlaylistPanel.test.tsx`（扩展）
- `tests/MiniQueueView.test.tsx`（扩展）
- `tests/MiniPlayer.test.tsx`（扩展）

### PlaylistPanel
- 订阅 playlist + priorityQueue + currentTrack
- priorityQueue 非空时列表顶部显示"接下来"区，playlist 用"播放列表"区
- 标题分别显示各区数量，不相加
- source/priority 行都支持右键，priority 行 TrackMenuKind='priority'
- priority 行有 IconClose 按钮 + tooltip"从接下来移除"
- 行容器改为非 button，播放和移除为同级按钮，禁止嵌套
- 退出动画期间禁用所有操作
- "清空后续队列"调 store.clearUpcoming()
- currentTrack 自动滚动用 kind:id 复合 ref key

### MiniQueueView + Container
- Container 向 MiniQueueView 传 playlist + priorityQueue + currentTrackId + callbacks
- 400×150 内单滚动容器，priorityQueue 非空时先显示"接下来"标签再显示"播放列表"
- priority 行移除用图标 + tooltip
- 行结构避免嵌套 button，保持 no-drag
- 空状态只在两者都为空时显示
- currentTrack 定位用 kind:id 复合 key

### 测试
1. 两区标题、数量、空状态和顺序
2. source/priority 右键差异
3. priority 删除不触发行播放
4. 清空后续同时截断 playlist + 清 pending
5. 相同 track 两区共存时 key/ref 不冲突
6. 退出动画期间操作无效
7. MiniPlayer 只有 queue view 订阅
8. 400×150 DOM 无嵌套 button

### 验收
```bash
npx vitest run tests/PlaylistPanel.test.tsx tests/MiniQueueView.test.tsx tests/MiniPlayer.test.tsx
npx tsc --noEmit
```

---

## 批次 E：全量验证 + 文档

### 改动文件
- `SPEC.md`
- `harness/DECISIONS.md`
- `docs/devlog/devlog-20260712-queue-priority-context-menu.md`

### 验收
```bash
npm run verify
git diff --check
```

### 主人手动验收（真实 Electron）
1. 随机模式加入 A、B → 连续下一首先播 A、B → 恢复随机
2. 单曲循环加入 A → 当前曲结束先播 A → A 结束后回原曲
3. 顺序模式插队结束 → 从插队前歌曲下一首继续
4. playlist 中已有歌曲仍能加入"接下来"
5. 插队期间上一首回原锚点，剩余待播保留
6. 点击任意歌曲"播放"清旧待播队列
7. 删除/清空不误停当前歌曲
8. 两区相同歌曲无 React key 警告
9. Mini 窗口无溢出
10. 重启后 priorityQueue 为空

---

## 约束条件

1. 不新增 queueIndex
2. 不持久化 priorityQueue
3. 不新增后端 IPC / preload 白名单 / 数据库
4. 不改 ContextMenu.tsx、SongInfoDialog.tsx
5. 不改播放模式切换逻辑
6. 自动切歌用内部 commitTrack，不用公开 playTrack
7. 禁止 -1 进入取模
8. 不新增 npm 依赖
