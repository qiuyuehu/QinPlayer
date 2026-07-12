# Codex 任务包：QinPlayer 歌曲列表表头独立

## 背景
歌曲列表表头（#、歌名、歌手、时长）在滚动容器内，跟着滚动条一起滚动，不好看。需要把表头独立出来，不在滚动条范围内。

## 目标
按 `docs/plans/PLAN-songlist-header-fix.md` 方案实现表头独立，同时处理列对齐问题。

## 非目标
- 不改全局 `.content` padding
- 不改组件逻辑
- 不加新功能

## 相关文件
- `docs/plans/PLAN-songlist-header-fix.md` — 完整方案（已审查二轮）
- `src/components/SongList.tsx` — 歌曲列表组件（需调整结构）
- `src/styles/songlist.css` — 歌曲列表样式（需调整滚动区高度）

## 约束
- 不改 `src/styles/content.css`（保留现有 padding）
- 不引入新依赖
- 遵守 harness/CONSTRAINTS.md 约束
- 表头和数据列必须对齐（有滚动条/无滚动条两种情况）

## 当前方案摘要

### 1. 表头移出滚动容器
- 把 `<div className="song-list__header">` 从 `.song-list__scroll` 内移到 `.song-list` 内
- 更新注释（"表头 sticky 固定在内部" → "表头独立于滚动容器"）

### 2. 调整滚动区高度
- `.song-list__scroll` 从 `height: 100%` 改成 `flex: 1; min-height: 0; height: auto`
- 加 `scrollbar-gutter: stable` 预留滚动条宽度

### 3. 删除表头的 sticky 定位
- 删除 `.song-list__header` 的 `position: sticky; top: 0; z-index: 1`

### 4. Fallback
- 如果 `scrollbar-gutter: stable` 后仍出现表头/数据列错位，则给 `.song-list__header` 预留同等右侧 gutter（例如 `padding-right` 或 CSS 变量方式）

## 需要 Codex 做什么
1. 按方案调整 SongList.tsx 结构（表头移出滚动容器）
2. 调整 songlist.css 样式（滚动区高度、scrollbar-gutter、删除 sticky）
3. 更新注释
4. 运行 `npx tsc --noEmit` + `npm test -- SongList`
5. 手动验证：最近播放、本地音乐、搜索结果三处页面
6. 返回变更清单和验证结果

## 已验证
- 当前 git status 干净
- tsc --noEmit 通过
- npm test 通过（133 用例）

## 需要特别注意

### 历史踩坑
- 表头移出后，滚动区不能继续用 `height: 100%`（会溢出），必须改成 `flex: 1`
- 表头和数据列可能错位（滚动条宽度），需要 `scrollbar-gutter: stable` 或 fallback
- 删除 sticky 定位后，表头不再随滚动固定（这是预期行为）

### 主人偏好
- 表头不在滚动条范围内
- 列必须对齐
- 不改全局 padding

### 不能破坏的行为
- 现有播放功能
- 现有虚拟列表滚动
- 现有右键菜单
- 最近播放、本地音乐、搜索结果三处页面

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
- npm test -- SongList：X/Y 通过
- 手动验证：最近播放、本地音乐、搜索结果

### 风险
- 仍需注意的问题

### 需要主人确认
- UI/体验/产品取舍

### 给 Hermes Agent 的记录
- devlog 建议记录什么
- SPEC / DECISIONS 是否需要更新
```
