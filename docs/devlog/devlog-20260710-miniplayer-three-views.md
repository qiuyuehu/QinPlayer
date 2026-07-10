# Devlog — 2026-07-10 迷你播放器三视图

## 目标

- 把迷你模式扩展为歌曲、歌词、队列三种紧凑视图。
- 三视图共用固定 `400×150` BrowserWindow，切换时不改变尺寸或位置。
- 统一歌曲播放入口与歌词读取入口，消除重复记账和异步竞态。

## 实现

1. `playerStore.playTrack()` 原子更新当前曲目、时长、播放状态和播放记账；`SongList`、`PlaylistPanel`、上一首、下一首及迷你队列都复用该入口。
2. `useTrackLyrics` 负责同目录 LRC 读取、解析和组件局部状态，并用 request token 隔离 A→B→A、同 id 换路径、卸载后迟到结果。
3. `MiniLyricsView` 只显示当前句与下一句；`MiniQueueView` 使用固定列宽、滚动定位、封面降级和统一播放回调。
4. `MiniPlayer` 提供歌曲/歌词/队列选择器和共用工具栏；一个 RAF 同时维护歌曲进度与歌词索引，视图状态仅在组件挂载期间保存。
5. `miniplayer.css` 使用主题 token、固定两行壳层、可见焦点态、减少动态效果降级和明确的 `no-drag` 交互边界。
6. `electron/ipc/window.ts` 以 `MINI_PLAYER_WIDTH` / `MINI_PLAYER_HEIGHT` 为单一尺寸来源，进入迷你模式时统一设置为 `400×150`，退出恢复逻辑不变。

## 修改文件

- 新增：`src/hooks/useTrackLyrics.ts`、`src/components/MiniLyricsView.tsx`、`src/components/MiniQueueView.tsx`。
- 新增测试：`tests/useTrackLyrics.test.tsx`、`tests/MiniLyricsView.test.tsx`、`tests/MiniQueueView.test.tsx`、`tests/MiniPlayer.test.tsx`。
- 修改：`src/stores/playerStore.ts`、`src/components/SongList.tsx`、`src/components/PlaylistPanel.tsx`、`src/pages/Lyrics.tsx`、`src/components/MiniPlayer.tsx`、`src/components/Icons.tsx`、`src/styles/miniplayer.css`、`electron/ipc/window.ts`。
- 同步：`SPEC.md`、`harness/CONSTRAINTS.md`、`harness/DECISIONS.md`。

## 新增测试

共新增 38 条：

- `playerStore.playTrack`：4 条，覆盖原子状态更新、recent 开关和 playback 禁用。
- `SongList`：1 条，覆盖成功播放时的队列、状态和单次记账。
- `useTrackLyrics`：9 条，覆盖路径、空结果、异常、切歌清空和迟到结果隔离。
- `MiniLyricsView`：6 条，覆盖空态、当前/下一句、首尾与双语结构。
- `MiniQueueView`：6 条，覆盖空态、固定信息、当前项、点击、自动定位和封面降级。
- `MiniPlayer`：12 条，覆盖三视图、公共控制、功能开关回退、挂载重置、队列记账、RAF 歌词更新和相同时长切歌的索引缓存重置。

## 验证结果

- Task 0 基线：5 个文件 / 54 个测试通过。
- Task 1：3 个文件 / 46 个测试通过。
- Task 2：3 个文件 / 22 个测试通过。
- Task 3：2 个文件 / 12 个测试通过。
- Task 4：`MiniPlayer` 1 个文件 / 11 个测试通过；组合回归 4 个文件 / 32 个测试通过。
- Task 5：生产构建的 main、preload、renderer 三段通过；组合回归 4 个文件 / 32 个测试通过。
- `npx tsc --noEmit`：通过。
- 首轮 `npm run verify`：Harness 约束检查通过；生产构建通过；19 个测试文件 / 206 个测试全部通过，0 failed。
- 审查补充：相同时长切歌回归测试先失败、修复后 `MiniPlayer` 12 个测试通过；`npx tsc --noEmit` 再次通过。
- 审查后 `npm test`：Harness 约束检查通过；19 个测试文件 / 207 个测试全部通过，0 failed。
- 审查后的完整 `npm run verify` 因 Codex 提权用量上限被工具拒绝，未能重跑生产构建；此前 main、preload、renderer 三段构建均已通过，之后仅修改歌词索引 ref 与 1px 工具栏内边距。

## 约束确认

- 未新增依赖、IPC、preload API 或 feature flag。
- 歌词数据未进入 Zustand；未嵌入全尺寸歌词或队列组件。
- 未改变播放模式、淡入淡出和正常窗口 bounds 恢复逻辑。
- 未自动提交 Git。

## 主人手动验证

状态：**待主人验证**。

- 深色和浅色主题分别检查歌曲、歌词、队列三视图，确认层级、对齐和 active 状态清晰。
- 播放单语、双语、无歌词歌曲，确认切歌不闪旧歌词，长文本不覆盖关闭按钮或工具栏。
- 使用 20 首以上队列，确认至少完整显示两项、当前项自动定位、滚动稳定且点击只播放一次。
- 三视图分别操作音量、上一首、播放/暂停、下一首、展开和关闭。
- 拖动窗口空白处，再操作按钮、进度条和队列行，确认 `drag` / `no-drag` 边界正确。
- 进出迷你模式，确认窗口始终为 `400×150`，退出后恢复进入前的正常 bounds。
- 分别关闭 `lyrics`、`queuePanel`，确认入口隐藏且 active 视图回退到歌曲。
- 开启 Windows 减少动态效果后重启，确认无新增过渡且功能完整。
