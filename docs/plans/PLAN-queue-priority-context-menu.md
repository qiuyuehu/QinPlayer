# QinPlayer 播放队列优先级与歌曲右键菜单实施方案

> 日期：2026-07-12
> 状态：待主人确认
> 类型：播放状态变更 + UI 交互复用
> 建议执行模型：Strong Codex（涉及 `playerStore`、自然播放结束和跨视图状态语义）

## 1. 初审结论

原方案方向正确，但不能直接实施。主要问题如下：

| 原方案问题 | 风险 | 本方案处理 |
|---|---|---|
| 使用 `queue + queueIndex` 保存已播放和未播放条目 | queue 播完后的清理、回退和手动点歌会形成双索引状态机 | 改为只保存未消费项的 FIFO `priorityQueue`，另存恢复锚点和本次插队段已消费 ID |
| `setPlaylist()` 无条件清 queue | “清空后续”、切换来源和内部列表更新语义混在一起 | 明确：设置新来源或用户手动播放会取消插队；自动切歌使用内部提交函数，不误清 queue |
| 去重检查整个 playlist | 当前列表中的任何歌曲都无法加入“接下来播放” | 只对待播 FIFO 去重；允许 playlist 内已有歌曲插队，当前歌曲本身不可重复加入 |
| 只修改 `nextTrack()` | 自然结束的 loop 模式在 `useAudioSync` 内直接重播，永远不调用 nextTrack | priorityQueue 和插队恢复阶段都高于 loop；补 `useAudioSync` ended 分支与测试 |
| 未定义插队播完后从哪里恢复 | queued track 可能不在 playlist，`findIndex()` 为 -1 后会选错歌曲 | 首次消费插队时保存 `priorityResumeTrackId`，结束后按原锚点和播放模式恢复 |
| 未定义上一首、手动点歌、删除、清空 | 容易遗留 stale queue/resume 状态 | 给每个动作写出确定状态转换和测试矩阵 |
| 两个面板再追加一份 queue 列表 | 当前 MiniQueueView/PlaylistPanel 本身已经把 playlist 称为“播放队列”，会出现两个同名区域 | UI 区分“接下来”与“播放列表”；只显示未消费插队项，不显示历史 queueIndex |
| Hook 同时加载 playlists 和 likedIds | likedIds 只服务 SongList 爱心，不属于右键菜单；每个菜单宿主会产生无关请求 | Hook 只管理菜单目标、歌单子菜单和歌曲信息；SongList 保留收藏状态 |
| 队列项仍显示“添加到播放队列” | 对已在 FIFO 中的歌曲操作无意义 | priority 项改为“从接下来移除”；普通列表项才显示“添加到接下来播放” |
| 测试文件写成 `.test.ts` | Hook 构建 React 菜单项并依赖 JSX/React 生命周期 | 使用 `tests/useTrackContextMenu.test.tsx` |
| 漏掉 `useAudioSync`、现有 SongList 测试和 store 重置 | 自动结束与回归路径没有保护 | 补齐真实文件范围、定向测试和全量 Harness 门禁 |

## 2. 已核验的当前状态

### 2.1 播放状态

- `src/stores/playerStore.ts` 只有 `playlist` 与 `currentTrack`，没有独立的手动待播队列。
- `nextTrack()` 的 shuffle 从 playlist 随机选；sequential 与手动 next 下的 loop 都按列表下一首处理。
- `src/hooks/useAudioSync.ts` 在歌曲自然结束且 mode=loop 时直接把当前音频归零重播，不调用 `nextTrack()`。
- `playTrack()` 是统一播放记账入口；SongList/MyProfile 采用 `setPlaylist(list)` 后 `playTrack(track)`，队列面板直接调用 `playTrack(track)`。
- queued track 若不在 playlist，现有 next/prev 的 `findIndex()` 会返回 -1，不能直接复用其索引计算。

### 2.2 队列 UI

- `PlaylistPanel` 和 `MiniQueueView` 当前展示的都是同一个 `playlist`。
- PlaylistPanel 的“清空后续队列”会保留 playlist 中当前歌曲及其之前的条目。
- MiniPlayer 顶层不订阅 playlist；订阅被隔离在 `MiniQueueViewContainer`，必须保持该性能边界。
- 两个列表的每行目前都是 button；加入移除图标时不能把 button 嵌套在 button 内。

### 2.3 右键菜单

- SongList 内联管理菜单目标、歌曲信息、歌单列表、收藏列表及菜单项。
- 公共菜单项为：播放、添加到播放队列、添加到歌单、打开文件目录、歌曲信息。
- “从歌单移除”和爱心按钮属于 SongList 特有能力，不能硬塞入通用 Hook。
- `ContextMenu` 已处理视口边界、外部点击、第二次右键和 Escape，无需重写。

## 3. 目标

1. SongList、PlaylistPanel、MiniQueueView 使用同一套歌曲右键菜单控制逻辑。
2. “添加到接下来播放”形成 FIFO 待播队列，优先级高于 sequential、shuffle 和自然结束时的 loop。
3. 插队播放完成后，能够从插队前的 playlist 锚点按原播放模式继续。
4. 普通 playlist 与待播 priorityQueue 的 UI、清空和移除语义清楚，不出现两个都叫“播放队列”的列表。
5. 保持统一播放记账、feature flags、MiniPlayer 订阅隔离和现有动画生命周期。

## 4. 非目标

- 不持久化 priorityQueue；刷新或重启后为空。
- 不新增或修改后端 IPC、数据库 schema、preload 白名单和依赖。
- 不增加拖拽排序、批量选择、播放历史栈或真正的 shuffle history。
- 不改变播放模式切换顺序和无插队时的既有 next/prev 行为。
- 不重写 ContextMenu、SongInfoDialog、SongList 虚拟列表或 MiniPlayer 固定 `400×150` 壳层。
- 不顺带修复现有菜单 IPC 的错误提示体验；失败沿用当前日志/降级方式。

## 5. 已确认的产品语义

术语：

- `playlist`：当前来源播放列表，负责正常 sequential/shuffle 导航。
- `priorityQueue`：用户明确加入“接下来播放”、尚未消费的 FIFO。
- `priorityResumeTrackId`：首次离开 playlist 进入插队播放时的来源锚点；不等于 queueIndex。
- `priorityConsumedTrackIds`：本次插队段内已消费的歌曲 ID，只用于恢复时避免立刻重复，恢复或取消后清空；不是播放历史。

### 5.1 动作规则

| 动作 | 结果 |
|---|---|
| 添加普通歌曲 | 追加到 priorityQueue 尾部 |
| 添加 playlist 中已有歌曲 | 允许；这是一次新的“接下来播放”意图 |
| 添加当前歌曲 | no-op，菜单项禁用 |
| 重复添加已在 priorityQueue 的歌曲 | no-op，菜单项禁用 |
| 下一首/自然结束且有 priorityQueue | FIFO 取出队首并播放；首次取出时记录当前 playlist 锚点，并记录本次消费 ID |
| priorityQueue 消费完、queued track 结束 | 从 resume 锚点按原模式恢复，然后清 resume |
| 用户手动点击/菜单选择“播放” | 视为新的明确播放意图，清 priorityQueue 与 resume，再播放目标 |
| 设置新的来源 playlist | 清 priorityQueue 与 resume，避免旧插队泄漏到新来源 |
| 删除未消费项 | 只从 priorityQueue 删除，不影响 playlist/currentTrack |
| 清空“接下来” | 清 priorityQueue；若正在播放已消费的插队歌曲，保留 resume，当前歌结束后仍能回来源 |
| 清空后续队列 | 保留既有 playlist 截断语义，同时清 priorityQueue；不得停止当前播放 |
| 插队期间按上一首 | 回到 resume 锚点并清 resume；尚未消费的 priorityQueue 保留，下一次 next 仍优先消费 |

### 5.2 恢复规则

插队序列结束后：

- sequential：从 resume 锚点向后扫描，跳过本次插队段刚消费的来源歌曲，选择第一个未消费项；末尾沿用现有回绕。
- shuffle：优先从 playlist 中排除 resume 锚点和本次已消费项后随机选择；没有候选时退回现有“排除当前锚点”的规则。
- loop：回到 resume 锚点继续单曲循环。
- resume 锚点不存在：清理 resume；若当前曲在 playlist 中则按当前曲导航，否则安全 no-op，不用 -1 参与取模。
- 没有 currentTrack 时按 next：若 priorityQueue 非空可直接消费队首；否则保持现有 no-op。

### 5.3 自动结束优先级

`useAudioSync` 的 ended 判定顺序必须是：

```text
播放功能关闭 / 旧音频 ended → 忽略
priorityQueue 非空或 priorityResumeTrackId 非空 → nextTrack()
playMode === loop → 当前音频归零重播
其他模式 → nextTrack()
```

这样 queue 不只压过 shuffle，也确实压过自然结束时的 loop。

## 6. 执行批次与门禁

| 批次 | 内容 | 完成门 |
|---|---|---|
| A | playerStore 优先队列状态机 | store 定向测试、类型检查通过 |
| B | useAudioSync 自然结束优先级 | ended/loop 回归通过 |
| C | 通用右键菜单抽取与 SongList 接入 | Hook + SongList 测试通过 |
| D | 主面板与 MiniQueueView 接入、UI | 组件测试、Mini 订阅回归和手动 smoke 通过 |
| E | 全量验证、文档和独立代码审查包 | `npm run verify` 0 failed |

每批失败时先修复该批，不带失败进入下一批。主人确认本方案后才生成 Executor 任务包和修改源码。

## 7. 批次 A：优先队列状态机

### A1. 先写失败测试

扩展 `tests/playerStore.test.ts`，先固定第 5 节全部规则。测试必须显式重置新增字段，避免 Zustand 单例状态跨用例泄漏。

至少覆盖：

1. FIFO 添加、pending 内按 track.id 去重、当前歌曲不可添加。
2. playlist 内已有歌曲仍可加入 priorityQueue。
3. sequential/shuffle/loop 下手动 next 都优先消费 queue。
4. 首次消费保存 resume；连续消费不覆盖原锚点。
5. queue 消费完后，三种模式从 resume 正确恢复并清 resume/consumed。
6. 来源列表的正常下一首被插队消费后，恢复时不立即重复播放它。
7. queued track 不在 playlist 时不以 -1 做索引。
8. 无 currentTrack 但有 priorityQueue 时，next 可播放队首。
9. 插队期间 prev 返回 resume；剩余 pending 保留并清本次 consumed。
10. remove/clear 只操作未消费项。
11. setPlaylist 和用户手动 playTrack 清 queue/resume/consumed。
12. 内部自动切歌不通过公开 playTrack 清掉剩余 queue。
13. featureFlags.playback=false 时所有播放动作无副作用。
14. 每次实际开始播放仍只产生一组 recordPlay/updatePlayCount。
15. 无插队时现有 next/prev 全部回归不变。

### A2. Store 契约

修改 `PlayerState`：

```ts
priorityQueue: Track[]
priorityResumeTrackId: number | null
priorityConsumedTrackIds: number[]
addToPriorityQueue: (track: Track) => void
removeFromPriorityQueue: (trackId: number) => void
clearPriorityQueue: () => void
clearUpcoming: () => void
```

实现要求：

- 不新增 `queueIndex`；播放过的 priority 项在消费时立即从数组移除。
- 抽取 store 内部 `commitTrack(track, extraState?)`，统一重置进度、一次 `set()` 更新 currentTrack/duration/isPlaying 及附加队列状态，再执行一组播放记账。
- 公开 `playTrack(track)` 表示用户主动播放：通过 extraState 同次清 queue/resume/consumed，再提交目标歌曲。
- `nextTrack/prevTrack` 内部直接调用 commitTrack，不能回调公开 playTrack 后误清队列。
- 消费 queue 时通过 extraState 原子完成 shift、resume、consumed IDs 和当前播放状态；避免中间状态被订阅者看到。
- `setPlaylist(list)` 表示切换来源，清 queue/resume/consumed。
- `clearUpcoming()` 在 store 中原子执行现有 playlist 截断与 priorityQueue 清理，PlaylistPanel 不再自行拼数组。
- 所有 ID 查找失败都走显式 fallback；禁止让 -1 进入 `% playlist.length`。
- priorityQueue 不进入现有 settings dirty-key 持久化。

Run：

```bash
npx vitest run tests/playerStore.test.ts
npx tsc --noEmit
```

## 8. 批次 B：自然结束覆盖 loop

修改 `src/hooks/useAudioSync.ts`，在 loop 重播前读取实时 store 的 `priorityQueue.length` 和 `priorityResumeTrackId`。

扩展 `tests/useAudioSync.test.tsx`：

1. loop + 无插队：保持当前曲归零重播，不记第二次播放。
2. loop + pending：ended 调用 nextTrack，播放 FIFO 队首。
3. loop + resume 但 pending 已空：queued track 结束后返回 resume 锚点。
4. sequential/shuffle + pending：ended 只前进一次，不因旧音频 ended 跳两首。
5. playback=false 与 trackTransitionRef 保护不退化。

Run：

```bash
npx vitest run tests/useAudioSync.test.tsx tests/playerStore.test.ts
npx tsc --noEmit
```

## 9. 批次 C：通用右键菜单

### C1. 抽取边界

新建 `src/hooks/useTrackContextMenu.tsx`。Hook 负责：

- 当前 `{ x, y, track, kind }` 菜单目标。
- `openContextMenu(event, track, kind)`、关闭菜单、歌曲信息目标。
- 根据 feature flags 构建公共菜单项。
- 第一次实际打开菜单时再读取 playlists；同一 Hook 实例只加载一次，flag 关闭时不请求。
- 普通项调用 addToPriorityQueue；priority 项显示 remove action。
- 接收 `getExtraItems(track)`，供 SongList 注入“从歌单移除”。

Hook 不负责：

- likedIds、爱心切换或 SongList 行状态。
- playlist/priorityQueue 的展示和排序。
- ContextMenu 本身的定位、键盘监听或动画。
- 直接操作 AudioEngine。

建议契约：

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

返回菜单目标、open/close handler、`items` 和 songInfoTrack；宿主继续显式渲染 ContextMenu/SongInfoDialog，避免 Hook 隐式返回 JSX 树。

### C2. 公共菜单语义

普通 source 项：

1. 播放。
2. 添加到接下来播放；当前曲或 pending 重复项 disabled。
3. 添加到歌单（playlists flag 开启时）。
4. 宿主 extra items。
5. 打开文件所在目录。
6. 歌曲信息。

priority 项：

1. 播放（会成为手动意图并清空剩余 pending）。
2. 从接下来移除。
3. 添加到歌单（flag 开启时）。
4. 打开文件所在目录。
5. 歌曲信息。

保持现有 Icons、ContextMenu 和 IPC 通道；不自行解析 Windows 目录时优先复用项目现有可接收 filePath 的 `open-file-location`，实施者先核对共享 IPC 类型后再替换，若类型只允许现有 `open-folder` 则保持当前实现。

### C3. SongList 接入

- 保留虚拟列表、初始行动画、likedIds 加载/切换和 playlistId 特有逻辑。
- 删除菜单目标、songInfoTrack、playlists 和公共菜单项的重复实现。
- `handlePlay` 仍先 setPlaylist(tracks) 再 playTrack(track)，因此主动播放会清空旧 priorityQueue。
- “从歌单移除”通过 getExtraItems 注入，顺序保持在“添加到歌单”之后。
- 现有“添加到播放队列”测试改为 priorityQueue 断言，不再断言修改 playlist。

新增 `tests/useTrackContextMenu.test.tsx`，扩展 `tests/SongList.test.tsx`：

1. source/priority 两种菜单项正确。
2. feature flags 隐藏 playback/playlists 项且关闭时不发 playlists:getAll。
3. playlists 首次打开懒加载，同一实例不重复请求。
4. add/remove/play/info/open location action 路由正确。
5. SongList 特有“从歌单移除”仍存在。
6. liked=false 行为和虚拟列表测试不退化。

## 10. 批次 D：两个队列视图

### D1. PlaylistPanel

- 订阅 playlist、priorityQueue、currentTrack 和对应 actions。
- priorityQueue 非空时，在列表顶部显示“接下来”区；playlist 使用“播放列表”区。
- 标题总数不能简单相加后称为“播放队列 N 首”，因为同曲可同时存在于 playlist 和 priorityQueue；分别显示各区数量。
- source 与 priority 行都支持右键；priority 行使用 TrackMenuKind='priority'。
- priority 行提供独立 IconClose 按钮和 tooltip“从接下来移除”。行容器改为非 button 容器，播放按钮与移除按钮为同级，禁止 button 嵌套。
- 面板退出动画期间禁用播放、移除、清空和右键打开，避免退出中继续改状态。
- “清空后续队列”调用 store.clearUpcoming()，保持原有保留当前及历史 playlist 的行为，同时清 pending。
- currentTrack 自动滚动优先定位当前所在区；相同 track.id 同时存在两区时，使用带 kind 的复合 ref key，避免 Map 覆盖。

### D2. MiniQueueView 与 Container

- Container 继续作为 queue-only Zustand connector；MiniPlayer 顶层不得新增 playlist/priorityQueue 订阅。
- Container 向纯展示组件传 playlist、priorityQueue、currentTrackId、播放/添加/移除 callbacks。
- `400×150` 内使用同一个滚动容器，priorityQueue 非空时先显示紧凑“接下来”标签，再显示“播放列表”；不创建第二个独立滚动区。
- priority 行移除按钮使用图标与 tooltip，不显示长文本；source/priority 行都可右键。
- 行结构同样避免嵌套 button，并保持 `-webkit-app-region: no-drag`。
- 空状态只在 playlist 与 priorityQueue 都为空时显示。
- currentTrack 自动定位使用 `kind:id` 复合 key；相同歌曲重复显示时，优先定位当前实际播放来源，无法判定时定位 playlist 行。

### D3. 组件测试

扩展：

- `tests/PlaylistPanel.test.tsx`
- `tests/MiniQueueView.test.tsx`
- `tests/MiniPlayer.test.tsx`

覆盖：

1. 两区标题、数量、空状态和顺序。
2. source/priority 右键菜单差异。
3. priority 删除不触发行播放；点击播放不会触发删除。
4. 清空后续同时截断 playlist 并清 pending。
5. 相同 track 同时存在两区时 key/ref 不冲突。
6. 退出动画期间操作无效。
7. MiniPlayer 默认/歌词视图仍不订阅 queue；只有 queue view 随 playlist/priorityQueue 更新。
8. 400×150 DOM 结构只有一个滚动容器且按钮无嵌套；真实溢出由 Electron smoke 验证。

## 11. 文件范围

Create：

- `src/hooks/useTrackContextMenu.tsx`
- `tests/useTrackContextMenu.test.tsx`

Modify：

- `src/stores/playerStore.ts`
- `src/hooks/useAudioSync.ts`
- `src/components/SongList.tsx`
- `src/components/PlaylistPanel.tsx`
- `src/components/MiniQueueView.tsx`
- `src/components/MiniQueueViewContainer.tsx`
- `src/styles/playlist-panel.css`
- `src/styles/miniplayer.css`
- `tests/playerStore.test.ts`
- `tests/useAudioSync.test.tsx`
- `tests/SongList.test.tsx`
- `tests/PlaylistPanel.test.tsx`
- `tests/MiniQueueView.test.tsx`
- `tests/MiniPlayer.test.tsx`
- `SPEC.md`
- `harness/DECISIONS.md`
- 对应 devlog

明确不修改：

- `electron/`
- `src/types/ipc.ts`
- `electron/preload.ts`
- 数据库与迁移
- `package.json` 和 TypeScript 配置
- `ContextMenu.tsx`、`SongInfoDialog.tsx`（除非实施时发现现有公开契约无法复用，届时先停止报告）

## 12. 自动验证

基线与每批结束时记录实际结果，不把未执行写成通过。

```bash
npm run verify
```

实施期间可定向运行：

```bash
npx vitest run tests/playerStore.test.ts tests/useAudioSync.test.tsx
npx vitest run tests/useTrackContextMenu.test.tsx tests/SongList.test.tsx
npx vitest run tests/PlaylistPanel.test.tsx tests/MiniQueueView.test.tsx tests/MiniPlayer.test.tsx
npx tsc --noEmit
```

最终门禁：

1. `node harness/checks.js` 通过。
2. TypeScript/build 通过。
3. 全量 Vitest 0 failed。
4. 无新增依赖、IPC、持久化字段或未授权源码范围。
5. `git diff --check` 通过。

## 13. 主人手动验收

在真实 Electron 中分别使用正常窗口和 `400×150` MiniPlayer：

1. SongList、主播放队列、Mini 队列右键菜单位置、子菜单、Escape 和外部点击正常。
2. 随机模式加入 A、B 后，连续下一首严格先播 A、B，再恢复随机。
3. 单曲循环加入 A 后，当前曲结束先播 A；A 结束后回到原曲继续循环。
4. 顺序模式插队结束后，从插队前歌曲的下一首继续。
5. playlist 中已有歌曲仍能加入“接下来”，同一 pending 不重复，当前曲不可添加。
6. 插队期间按上一首回原锚点；剩余待播项仍保留。
7. 点击任意歌曲“播放”会清掉旧待播队列，避免旧插队稍后突然出现。
8. 删除单项、清空“接下来”、清空后续队列均不误停当前歌曲。
9. 两区相同歌曲不产生 React key 警告，当前项滚动定位合理。
10. Mini 窗口无文字/图标溢出、按钮重叠和拖拽区域吞点击。
11. 重启后 priorityQueue 为空。

## 14. 验收标准

1. priorityQueue 是未消费 FIFO，不保存已播放 Track 或 queueIndex；临时 consumed IDs 在恢复或取消后清空。
2. 手动 next 与自然 ended 都在所有播放模式前消费 priorityQueue。
3. 插队结束按 resume 锚点恢复；锚点缺失安全降级，不出现 -1 取模。
4. 手动播放、切换来源、移除、清空、上一首的状态转换均有测试。
5. 三个表面复用公共菜单逻辑，SongList 收藏和虚拟列表不退化。
6. priority 项显示移除而不是重复添加；普通项允许 playlist 内歌曲插队。
7. MiniPlayer 订阅隔离保持不变。
8. 无嵌套 button，键盘/ARIA/no-drag 基本语义有效。
9. `npm run verify` 0 failed，主人完成真实 Electron 视觉与听感无关的交互验收。

## 15. 风险与控制

| 风险 | 控制 |
|---|---|
| 自动 next 调用公开 playTrack 清空剩余队列 | store 内部 commitTrack 与用户 action 分层，专项测试连续 FIFO |
| loop 在 useAudioSync 提前重播 | priority/resume 判定放在 loop 前，ended 测试锁定 |
| queued track 不在 playlist 导致 -1 索引 | resume 锚点导航 + 显式 missing fallback |
| current/playlists 中同曲被错误判为重复 | 只对 pending 和 current 做不同规则判断 |
| 两区同 ID 导致 key/ref 覆盖 | React key 与 ref 都使用 `kind:id` |
| 移除按钮触发行播放 | 同级按钮结构 + stopPropagation + 组件测试 |
| Hook 每次 render 请求 playlists | 首次打开懒加载并按实例缓存，flag 测试 |
| MiniPlayer 顶层重新订阅队列 | 所有 selector 留在 MiniQueueViewContainer，Profiler/订阅回归 |
| 状态新增后测试相互污染 | 所有 playerStore fixture 显式重置 priority 字段 |
| 范围扩张到播放历史/拖拽 | 列为非目标，发现需求时另开方案 |

## 16. 回滚

按批次独立回滚：

1. D 的 UI 接入可单独撤销，保留已经验证的 store 状态机。
2. C 的 Hook 抽取可恢复 SongList 内联实现，不影响队列状态。
3. B 必须与 A 的 priority 状态机一起回滚，避免 loop 分支读取不存在字段。
4. A 回滚后恢复原 SongList “插入 playlist 当前项后”行为及对应测试。
5. 不使用整仓 reset；只按本方案文件清单撤销，保留其他已完成工作。

## 17. 文档与交接

实现完成后：

- `SPEC.md`：记录 priorityQueue 为会话内、非持久化的待播 FIFO。
- `harness/DECISIONS.md`：记录优先级、resume 锚点和 loop ended 决策。
- `docs/devlog/devlog-20260712-queue-priority-context-menu.md`：记录实际改动、验证结果和主人待验项。
- 由于涉及 core playback state、自然结束和跨视图交互，实施后必须交 Codex Reviewer 做独立代码审查。

审查包重点：

1. 所有自动播放路径是否绕过“用户手动播放会清 queue”的副作用。
2. loop/shuffle/sequential 的 queue 与 resume 转移是否与本方案一致。
3. 所有 ID missing、空 playlist、无 currentTrack 路径是否安全。
4. 菜单 Hook 是否引入重复 IPC、旧闭包或未清理 listener。
5. MiniPlayer queue-only subscription 是否保持。

## 18. 独立维护者视角二审

审查身份：未参与方案编写、后续负责播放器状态与 React UI 维护的工程师。

### 18.1 二审问题与处理

| 二审问题 | 处理结果 |
|---|---|
| 是否真的需要 queueIndex？ | 不需要；只保存 pending FIFO，降低双索引复杂度 |
| queue 是否能加入 playlist 已有歌曲？ | 可以；去重范围改为 pending，不再误杀主要使用场景 |
| queued track 不在 playlist 怎么恢复？ | 首次消费保存 resume 锚点，结束后按锚点恢复 |
| 插队歌曲恰好是来源下一首会不会连播两次？ | 本次插队段记录 consumed IDs，首次恢复时跳过刚消费的来源项，随后立即清理 |
| loop 自然结束会不会绕过 queue？ | 已把 priority/resume 判定放到 useAudioSync loop 分支之前 |
| 手动播放与自动切歌如何区分？ | 公开 playTrack 是用户意图；内部 commitTrack 给状态机使用 |
| prev/remove/clear/setPlaylist 是否定义？ | 已逐项规定状态转换并列入失败测试 |
| 为什么不做播放历史栈？ | 当前需求只要求 next 优先级，历史栈会显著扩 scope |
| 两个 UI 是否重复叫播放队列？ | 分成“接下来”和“播放列表”，只展示 pending queue |
| Hook 是否抽得过深？ | 只抽公共菜单控制；likedIds、虚拟列表和宿主特有项保留原处 |
| Mini 150px 是否会塞不下？ | 单滚动区 + 紧凑 section label，仍要求真实 Electron smoke |
| 是否需要后端或持久化？ | 不需要，明确排除 IPC/schema/settings |
| 回归范围是否足够？ | 覆盖 store、ended、SongList、两队列视图与 Mini 订阅隔离 |

### 18.2 二审结论

**有条件通过。** 状态所有权、优先级、恢复锚点和 UI 复用边界已经明确，Executor 可以在主人确认后按 A→E 顺序以 TDD 实施。实施者不得恢复 `queueIndex` 方案、不得让自动切歌调用带清队列副作用的公开 `playTrack()`，也不得省略真实 Electron 下的 loop、shuffle 与 `400×150` MiniPlayer 验收。
