# Codex 任务包：QinPlayer 播放队列面板续作

## 背景
QinPlayer 已实现基础播放功能，上一轮 Codex 实现了 SongList 滚动、PlaylistPanel（底部弹出）、歌单封面。现在需要：
1. 将 PlaylistPanel 从底部弹出改为右侧滑入侧边面板
2. 新增"添加到播放队列"右键菜单
3. 封面进播放界面动画
4. 歌单重命名功能

## 目标
按 `docs/plans/PLAN-playback-queue-panel-v2.md` 方案实现 5 个功能点。

## 非目标
- GPU 加速优化（单独开方案）
- 播放历史持久化（后续迭代）
- 播放队列拖拽排序（后续迭代）

## 相关文件
- `docs/plans/PLAN-playback-queue-panel-v2.md` — 完整方案（已审查）
- `src/components/PlaylistPanel.tsx` — 现有实现（需重构）
- `src/styles/playlist-panel.css` — 现有样式（需重构）
- `src/components/SongList.tsx` — 右键菜单（需增强）
- `src/components/Content.tsx` — 页面路由（需增强）
- `src/styles/content.css` — 内容区样式（需增强）
- `src/pages/Playlists.tsx` — 歌单页面（需增强）
- `src/styles/playlists.css` — 歌单样式（需增强）
- `src/components/ContextMenu.tsx` — 右键菜单组件（只读参考）
- `src/stores/playerStore.ts` — 播放状态（只读参考）
- `src/types/index.ts` — 类型定义（只读参考）

## 约束
- 不引入新依赖（特别是 react-transition-group）
- 不修改 playerStore.ts（使用现有 `playlist` 状态）
- 不修改 playlists.ts（复用现有 `playlists:rename` IPC）
- 遵守 harness/CONSTRAINTS.md 约束
- ContextMenu 的 MenuItem 使用 `action` 字段（不是 `onClick`），没有 `visible` 字段
- 歌词动画必须分层渲染，避免与 renderPage() 冲突

## 当前方案摘要

### 1. 播放队列面板
- 右侧滑入侧边面板，宽度 30%（min-width 280px，max-width 480px）
- 两个标签页：当前队列 / 历史记录
- 关闭方式：关闭按钮、ESC、再次点击播放列表按钮（无遮罩）
- 清空队列：保留当前播放歌曲，只清空后续队列

### 2. 右键菜单增强
- 新增"添加到播放队列"选项
- 菜单项条件构造（先 push 到数组，再传给 ContextMenu）
- 插入到当前歌曲后一位，已存在则跳过
- currentIndex === -1 时追加到末尾

### 3. 封面进播放界面动画
- 向上滑入过渡，300ms cubic-bezier(0.4, 0, 0.2, 1)
- 歌词页面独立于 renderPage() 分层渲染
- 退出动画期间不卸载歌词页面

### 4. 歌单重命名
- 右键菜单选重命名，内联输入框原位编辑
- 复用现有 `playlists:rename` IPC（参数 { id, name }）
- Enter 确认，Esc 取消，失焦确认

## 需要 Codex 做什么
1. 按方案实现 5 个功能点
2. 每个功能点完成后运行 `npx tsc --noEmit` + `npm test`
3. 全部完成后运行 `npm run build` 确认打包正常
4. 返回变更清单和验证结果

## 已验证
- 当前 git status 干净（只有方案文件未提交）
- tsc --noEmit 通过
- npm test 通过（121 用例）

## 需要特别注意

### 历史踩坑
- ContextMenu 的字段是 `action` 不是 `onClick`，没有 `visible`
- 清空队列要保留当前歌曲，避免"正在播放但队列为空"
- currentIndex === -1 时要显式处理，不能隐式 splice(0, 0, track)
- 歌词动画退出期间不能被 renderPage() 卸载
- 右侧面板不要用遮罩层

### 主人偏好
- 窗口固定大小，不可拉伸（但本方案不改窗口）
- 暗色主题中性灰黑 #121212
- UI 分隔线留足呼吸感
- 不喜欢 emoji 做 UI 图标
- 代码注释用中文

### 不能破坏的行为
- 现有右键菜单（播放、添加到歌单、从歌单移除、打开文件目录、歌曲信息）
- 歌单封面显示
- SongList 滚动到当前歌曲
- 播放列表按钮功能

## 返回格式

```markdown
## Codex 返回摘要

### 结论
- 已完成 / 需要返工 / 需要主人确认

### 变更
- 改了哪些文件
- 改了什么行为

### 验证
- tsc --noEmit：通过/失败
- npm test：X/Y 通过
- npm run build：通过/失败

### 风险
- 仍需注意的问题

### 需要主人确认
- UI/体验/产品取舍
- 是否需要手动测试

### 给 Hermes Agent 的记录
- devlog 建议记录什么
- SPEC / DECISIONS 是否需要更新
```
