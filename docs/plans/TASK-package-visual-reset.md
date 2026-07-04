# Codex 任务包：QinPlayer 视觉重设

## 背景
QinPlayer 当前界面偏 SaaS/后台管理风格，需要重设为"私人唱片库 / 桌面音频控制台"风格。主人已确认 preview 样张方向。

## 目标
按 `docs/plans/PLAN-visual-reset.md` 方案实现视觉重设，重点改 3 个区域：
1. 浅色/暗色主题变量替换（暖灰+黄铜 accent）
2. 歌曲列表无边框全出血布局
3. 侧栏/底部播放器样式调整

## 非目标
- 不改组件逻辑
- 不加列表封面
- 不改播放按钮样式（保持原本）
- 不碰歌词、迷你模式、均衡器复杂页

## 相关文件
- `docs/plans/PLAN-visual-reset.md` — 完整方案（已审查三轮）
- `src/styles/themes.css` — 主题变量（需替换浅色/暗色变量）
- `src/styles/content.css` — 内容区（需调整 padding）
- `src/styles/songlist.css` — 歌曲列表（需去掉边框/圆角）
- `src/styles/sidebar.css` — 侧栏（需调整选中态）
- `src/styles/playerbar.css` — 底部播放器（需调整样式）
- `src/styles/titlebar.css` — 标题栏（需调整样式）
- `src/styles/base.css` — 滚动条变量

## 约束
- 不引入新依赖
- 不改播放按钮样式（保持原本 42px、透明背景、text-primary）
- 不改组件逻辑和信息架构
- 遵守 harness/CONSTRAINTS.md 约束
- 所有 SongList 页面统一调整
- 正式改 CSS 前必须做 hardcoded color sweep

## 当前方案摘要

### 1. 主题变量替换
- 浅色：暖灰纸面（#f3f1ec）+ 黄铜 accent（#a86f2a）
- 暗色：炭黑（#141312）+ 黄铜 accent（#c0914f）
- 新增变量：--control-hover、--control-active、--bg-card、--border-subtle、--progress-track、--progress-fill、--input-bg、--input-border、--scrollbar-thumb、--shadow-sm、--shadow-md、--focus-ring

### 2. 歌曲列表无边框全出血
- 去掉 border 和 border-radius
- content padding 左右缩小到 8px
- 表头去掉 border-radius
- 所有 SongList 页面统一调整

### 3. 侧栏选中态
- 左侧 3px 黄铜竖线
- 微弱背景 --control-active
- 图标用 accent 色

### 4. 底部播放器
- 比内容区"重"一点（--player-bg 比 --bg-primary 深）
- 播放按钮保持原本样式不改
- 进度条用黄铜色，hover 时容器高度固定，内部 fill 增粗

### 5. 滚动条
- thumb 用 --scrollbar-thumb
- track 透明

## 需要 Codex 做什么
1. 做 hardcoded color sweep：`rg "rgba\\(255|rgba\\(160|#ffffff|#fff|#121212|#1a1a1a"` 扫一遍
2. 按方案替换主题变量
3. 调整 content padding、songlist 边框/圆角、sidebar 选中态、playerbar 样式
4. 每个功能点完成后运行 `npx tsc --noEmit` + `npm test`
5. 全部完成后运行 `npm run build` 确认打包正常
6. 截图对比浅色/暗色主界面
7. 返回变更清单和验证结果

## 已验证
- 当前 git status 干净（preview 文件已提交）
- tsc --noEmit 通过
- npm test 通过（146 用例）

## 需要特别注意

### 历史踩坑
- SongList 是共享组件，改它会影响所有使用处
- content padding 改动会影响全局内容区，不只是歌曲列表
- 透明白 hover 在浅色主题下会变成黑色/灰色斑点
- accent 满底 hover 在琥珀色下会像警告色
- 进度条 hover 不能改容器高度（会抖动），要改内部 fill
- 播放按钮保持原本样式不改

### 主人偏好
- 暖灰纸面 + 黄铜 accent
- 无边框全出血列表
- 左右边距接近 0（content padding 8px）
- 播放按钮保持原本样式
- 不做蓝色、不做渐变大背景、不做玻璃拟态

### 不能破坏的行为
- 现有播放功能
- 现有右键菜单
- 现有虚拟列表滚动
- 亮色/暗色主题切换
- 播放队列面板
- 歌词页面
- 迷你模式

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
- hardcoded color sweep：结果

### 截图
- 浅色主界面截图（对话附件）
- 暗色主界面截图（对话附件）

### 风险
- 仍需注意的问题

### 需要主人确认
- UI/体验/产品取舍
- 是否需要手动测试

### 给 Hermes Agent 的记录
- devlog 建议记录什么
- SPEC / DECISIONS 是否需要更新
```
