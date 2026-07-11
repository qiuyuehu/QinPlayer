# Devlog — 2026-07-11 迷你队列视图滚动条修复

## 问题

迷你队列视图的滚动条和迷你模式边缘之间有28px空白，且滚动条滚动到顶端时会和关闭按钮重叠。

## 原因

`.mini-player__content` 的 `padding-right: 28px` 应用到了所有视图，包括队列视图。这个padding是为了给关闭按钮留空间，但队列视图的滚动条应该贴着右边缘。

## 修复

1. 移除 `.mini-player__content` 的 `padding-right: 28px`
2. 给 `.mini-player__default-view` 加 `padding-right: 28px`（只给默认视图留空间）
3. 给 `.mini-queue-view` 加 `margin-top: 28px` + `height: calc(100% - 28px)`（避免滚动条和关闭按钮重叠）

## 修改文件

- `src/styles/miniplayer.css`：调整 padding 和 margin

## 验证

- `npx tsc --noEmit` 通过
- `npm test`：22 文件 / 241 测试全绿

## 注意

- 滚动条现在贴着右边缘，没有多余空白
- 滚动条滚动到顶端时不会和关闭按钮重叠
- 默认视图的歌曲信息和进度条不被关闭按钮遮挡
- 歌词视图样式不受影响
