# Devlog — 2026-07-11 动画全覆盖

## 目标

- 为页面、集合、弹层、主播放条、歌词页和迷你播放器建立一致且克制的动态效果。
- 保留 SongList 虚拟定位、播放 pulse、range thumb 和既有 hover transform。
- 支持手动与系统减少动画，并让 CSS 与 JS 行为同步降级。

## 实现

1. 在 `themes.css` 增加 10 个全局 motion token，并新增最后导入的 `motion.css`。
2. 新增 `motionPreference`、`useReducedMotion`，把手动偏好放入 `uiStore`；App 水合读取一次，Settings 每次切换写入一次 SQLite。
3. 所有原生按钮使用独立 `scale`；原有 0.9、0.92、0.94、0.98 强度保留，组件 transition 简写补齐 scale 通道。
4. Content 使用稳定导航 key；SongList 首批可见行使用独立 `translate` 和 28ms stagger，inline `transform: translateY()` 原样保留。
5. 专辑/歌单卡片、QueuePanel 条目、ContextMenu、AlbumSortMenu 和 MiniPlayer 三视图增加 token 化入场。
6. 新增 `useExitTransition`，Dialog 与 QueuePanel 在根动画结束后卸载；提供幂等、fallback、reduced 微任务和卸载清理。
7. 创建歌单确认改为 Promise，pending 期间阻止重复确认、取消、overlay 与 Escape；失败后恢复控件并保留弹窗。
8. review 发现 StrictMode effect replay 会把 Hook 的 mounted 标记永久清除，新增第 271 个测试并在每次 effect setup 时恢复标记。

## 修改文件

- 状态与逻辑：`src/App.tsx`、`src/stores/uiStore.ts`、`src/pages/Settings.tsx`、`src/pages/Playlists.tsx`。
- 新增 helper/hook：`src/utils/motionPreference.ts`、`src/hooks/useReducedMotion.ts`、`src/hooks/useExitTransition.ts`。
- 组件：`Content`、`SongList`、`LyricsPanel`、`CreatePlaylistDialog`、`SongInfoDialog`、`PlaylistPanel`。
- 样式：`themes`、`motion`、`base`、`content`、`songlist`、`albums`、`playlists`、`contextmenu`、`dialog`、`playlist-panel`、`playerbar`、`lyrics`、`miniplayer`、`titlebar`、`sidebar`、`localmusic`、`settings`、`Equalizer`。
- 测试：新增 motion preference、根 Hook、App 水合、Settings、Content、退出 Hook 和 Dialog 测试，并扩展 uiStore、SongList、PlaylistPanel 与 setup。

## Motion Token

- 时长：100ms、180ms、250ms、300ms；reduced duration 为 1ms。
- easing：standard `cubic-bezier(0.2, 0, 0, 1)`，emphasized `cubic-bezier(0.22, 1, 0.36, 1)`。
- 位移：4px、8px；默认按压比例 0.96。

## 验证结果

- Task 0 基线：Harness、生产构建、22 个文件 / 243 个测试通过。
- Task 1：6 个 motion helper 测试与生产构建通过。
- Task 2：4 个文件 / 14 个测试与生产构建通过。
- Task 3：PlayerBar、SongList 共 24 个测试与生产构建通过。
- Task 4：7 个文件 / 64 个测试与生产构建通过。
- Task 5：4 个文件 / 21 个测试与生产构建通过。
- review 前最终 `npm run verify`：Harness 通过；main、preload、renderer 构建通过；29 个文件 / 270 个测试全部通过，0 failed。
- 静态审计：无 `will-change`；无按钮 `:active transform: scale`；reducedMotion 不在 playerStore；SongList keyframe 未改写定位 transform。
- review 新增 StrictMode 回归测试后先失败并完成修复；由于沙箱外工具审批额度耗尽，271 个测试的最终复跑尚未执行。
- StrictMode 修复后 `npx tsc --noEmit`、Harness 与 `git diff --check` 均通过。

## 审查结果

- 发现并修复 1 个重要问题：StrictMode 开发环境会 replay effect，旧 cleanup 把 `mountedRef` 留在 false，导致退出完成回调失效。
- 修复方式：每次 effect setup 显式恢复 mounted 标记，cleanup 继续清理 fallback。
- 未发现其他状态归属、持久化次数、虚拟定位、重复提交或退出幂等问题。

## UI Smoke

状态：**待主人验证**。当前工具审批额度耗尽，未启动 Electron 做截图或交互验证。

- 深色/浅色：LocalMusic、Albums、Playlists、Settings。
- 普通、手动 reduce、系统 reduce 三种 motion 状态。
- PlayerBar、MiniPlayer 三视图、CreatePlaylistDialog、SongInfoDialog、QueuePanel。
- 1000 首以上 SongList 的首屏入场、滚动定位和滚动后不重播。

## 约束确认

- 未新增依赖、IPC、数据库 schema 或 feature flag。
- 未修改音频淡入淡出逻辑，reducedMotion 未进入 playerStore 或 AudioEngine。
- 未使用 `will-change`，未覆盖虚拟行定位 transform。
- 未自动提交 Git。
