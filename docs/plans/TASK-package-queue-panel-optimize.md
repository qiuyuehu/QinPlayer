# Codex 任务包：QinPlayer 播放队列面板优化 + queuePanel开关

## 背景
QinPlayer 播放队列面板已实现基础功能（PlaylistPanel 底部弹出），现在需要：
1. 优化 UI（砍掉标签页、封面缩略图、固定宽度等）
2. 新增 `queuePanel` feature flag 独立开关

## 目标
按 `docs/plans/PLAN-queue-panel-optimize.md` 方案实现 7 个功能点。

## 非目标
- GPU 启动参数（拆成单独方案）
- 播放历史持久化
- 播放队列拖拽排序

## 相关文件
- `docs/plans/PLAN-queue-panel-optimize.md` — 完整方案（已审查三轮）
- `src/components/PlaylistPanel.tsx` — 现有实现（需重构）
- `src/styles/playlist-panel.css` — 现有样式（需重构）
- `src/components/Content.tsx` — 页面路由（需增强）
- `src/styles/content.css` — 内容区样式（需增强）
- `src/types/ipc.ts` — IPC 类型定义（需新增 queuePanel）
- `src/utils/featureFlags.ts` — Feature Flags 工具（需新增 queuePanel）
- `src/components/PlayerBar.tsx` — 播放控制条（需增强）
- `src/components/Icons.tsx` — 图标组件（只读参考，确认 IconMusic 存在）
- `src/utils/formatTime.ts` — 时间格式化（只读参考）
- `src/stores/playerStore.ts` — 播放状态（只读参考）
- `src/stores/uiStore.ts` — UI 状态（只读参考）

## 约束
- 不引入新依赖
- 不修改 playerStore.ts（使用现有 playlist 状态）
- 不修改 playlists.ts（复用现有 IPC）
- 遵守 harness/CONSTRAINTS.md 约束
- 歌词动画必须清理 timerRef 和 rafRef，防止快速切换留下残留
- 封面加载失败用 brokenCoverIds 状态管理，不是简单隐藏 img

## 当前方案摘要

### 1. 砍掉历史记录标签页
- 删除 activeTab 状态和标签页切换逻辑
- 只保留当前队列渲染
- header 简化：标题"播放队列" + 歌曲数 + 关闭按钮

### 2. 清空队列逻辑修正
- 保留当前歌曲 + 之前的，只清空之后的
- 按钮文案："清空后续队列"
- 逻辑：`playlist.slice(0, currentIndex + 1)`

### 3. 返回动画串行
- 歌词退出完再显示主页面
- 使用 showMainContent 控制，歌词退出动画结束后才设为 true
- timerRef + rafRef 双重清理，防止快速切换残留
- 依赖：`[activeNav, featureFlags.lyrics, lyricsVisible]`
- import 补 useRef

### 4. 固定宽度 320px
- `width: min(320px, 100vw)`，极端窗口下不溢出

### 5. 封面缩略图 36x36px
- 自定义歌曲列表渲染，不复用 SongList
- 有 coverPath 且未失败：用 `window.electronAPI.getCoverUrl()` 显示图片
- 无封面或加载失败：CSS 占位（IconMusic 图标）
- brokenCoverIds 状态管理封面加载失败
- onError 回调：`setBrokenCoverIds(prev => new Set(prev).add(track.id))`

### 6. 自动滚动
- 使用 itemRefs + scrollIntoView({ block: 'nearest', behavior: 'smooth' })
- ref 挂载：`ref={(el) => { if (el) itemRefs.current.set(track.id, el); else itemRefs.current.delete(track.id) }}`

### 7. 播放逻辑
- 参考 SongList.tsx 的 handlePlay
- setCurrentTrack + setPlaying(true)
- songs:recordPlay（受 featureFlags.recent 控制）
- songs:updatePlayCount
- 保持当前完整队列，只切换当前歌曲

### 8. queuePanel feature flag
- FeatureFlagKey 类型新增 `'queuePanel'`
- FeatureFlags interface 新增 `queuePanel: boolean`
- FEATURE_FLAG_KEYS 和 DEFAULT_FEATURE_FLAGS 新增 `queuePanel: true`
- PlayerBar 按钮和面板渲染加 `featureFlags.queuePanel` 守卫
- className 用 `player-bar__btn`（不是 playerbar__btn）

## 需要 Codex 做什么
1. 按方案实现 7 个功能点
2. 每个功能点完成后运行 `npx tsc --noEmit` + `npm test`
3. 全部完成后运行 `npm run build` 确认打包正常
4. 返回变更清单和验证结果

## 已验证
- 当前 git status 干净
- tsc --noEmit 通过
- npm test 通过（127 用例）

## 需要特别注意

### 历史踩坑
- ContextMenu 的字段是 `action` 不是 `onClick`，没有 `visible`
- 清空队列要保留当前歌曲+之前的，不是只保留当前歌曲
- 歌词动画退出期间不能被 renderPage() 卸载
- timerRef 和 rafRef 必须清理，防止快速切换导航留下残留
- featureFlags.lyrics 守卫不能漏
- className 是 `player-bar__btn` 不是 `playerbar__btn`
- 封面加载失败用 brokenCoverIds 状态管理，不是简单隐藏 img

### 主人偏好
- 暗色主题中性灰黑 #121212
- UI 分隔线留足呼吸感
- 不喜欢 emoji 做 UI 图标
- 代码注释用中文
- 歌曲名/歌手名超长省略号显示

### 不能破坏的行为
- 现有播放功能（播放/暂停/切歌）
- 歌单封面显示
- 播放列表按钮功能
- Feature Flags 机制（13 个现有 flag 不能受影响）

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
