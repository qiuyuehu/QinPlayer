# 2026-07-13 UI micro adjustments

## 目标

- 缩小歌单详情的“播放全部”按钮，并将其与排序控件对齐。
- 删除播放队列中的重复标签，降低 header 下分隔线对比度。
- 缩小 Mini 队列菜单，并保持窗口几何、边缘夹取和安全协议一致。

## 修改内容

- “播放全部”移入排序栏最后一个子项，使用 `playlists__sort-btn playlists__play-all` 组合 class；既有 handler 和 disabled 条件未改。
- 删除队列 header 的歌曲总数和普通队列的“播放列表”标题；保留“接下来 N 首”、优先项背景及左侧强调 class。header 下分隔线改为 `var(--border-subtle)`。
- Mini 菜单内容宽度改为 160px，窗口宽度改为 176px；条目改为 30px 高，窗口附加高度为 26px，右下 workArea 夹取断言同步更新。

## 验证

- `npx vitest run tests/Playlists.test.tsx`: 10 passed
- `npx vitest run tests/PlaylistPanel.test.tsx`: 13 passed
- `npx vitest run tests/contextMenuIPC.test.ts tests/MiniContextMenu.test.tsx`: 17 passed
- `npx tsc --noEmit`: passed
- `node harness/checks.js`: passed
- `npm run build`: passed
- `npm test`: 53 test files, 520 tests passed
- `git diff --check`: passed

## 未测量与手动验收

- 未在真实 Electron 中记录 Mini 菜单冷启动、连续 10 次打开的中位数或 p95；本次未宣称延迟改善。
- 需要在深色和浅色主题、100%/150%/200% DPI、四个屏幕边缘确认最长菜单文案没有裁切，且重复右键、Escape、失焦和 Mini 退出没有残留窗口或错误 action。
- 需要确认窄窗口下排序栏不换行、不重叠，队列 header 仅显示“播放队列”，优先队列仍显示“接下来 N 首”和左侧强调线。
