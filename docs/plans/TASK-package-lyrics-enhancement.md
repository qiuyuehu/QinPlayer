# Codex 任务包：QinPlayer 歌词界面增强

## 背景
主人对歌词界面有两个增强需求：进度条加粗、添加音量按钮。

## 目标
按 `docs/plans/PLAN-lyrics-enhancement.md` 方案实现：
1. 歌词界面进度条加粗（复用主页面结构：8px 热区 + 4px 轨道/填充）
2. 歌词界面添加音量按钮（折叠弹窗，点击后向上弹出，可拖动调节）

## 非目标
- 不改歌词页面的置顶/返回逻辑（保留 IconPin、togglePinned、leaveLyrics、IconChevronDown）
- 不添加播放列表按钮
- 不改其他页面

## 相关文件
- `docs/plans/PLAN-lyrics-enhancement.md` — 完整方案（已审查二轮）
- `src/pages/Lyrics.tsx` — 添加音量按钮
- `src/styles/lyrics.css` — 进度条加粗 + 音量弹窗/音量条样式

## 约束
- 不改歌词页面的置顶/返回逻辑
- 在现有 import 上追加 IconVolumeHigh/IconVolumeLow/IconVolumeMuted，不要把 IconBack 加回来
- 遵守 harness/CONSTRAINTS.md 约束

## 当前方案摘要

### 1. 进度条加粗
- 复用主页面结构：bar 负责命中区域（8px），::before 画轨道（4px），fill 画填充（4px）
- 从 `0.4vh` 改成 `8px` 热区 + `4px` 轨道/填充

### 2. 音量按钮
- 新增 import：IconVolumeHigh/IconVolumeLow/IconVolumeMuted
- 新增 store 读取：volume、setVolume
- VolumeIcon 选择：volume === 0 ? IconVolumeMuted : volume < 0.5 ? IconVolumeLow : IconVolumeHigh
- showVolume 状态、volumeRowRef、volumeBarRef
- 点击外部收起（useEffect + mousedown + contains 判断）
- 音量按钮点击（stopPropagation）
- 音量拖动（updateVolume、handleVolumeMouseDown）
- JSX 结构：volume-wrapper > button + popup > volume-bar > volume-fill + volume-thumb
- CSS 样式：popup（absolute、bottom: 100%、z-index: 100）、volume-bar、volume-fill、volume-thumb

### 3. 按钮布局
- 当前：[上一首] [播放/暂停] [下一首]
- 改成：[上一首] [播放/暂停] [下一首] [音量]

## 需要 Codex 做什么
1. 修改 lyrics.css（进度条加粗 + 音量弹窗/音量条样式）
2. 修改 Lyrics.tsx（import、store 读取、状态、拖动逻辑、JSX）
3. 运行 `npx tsc --noEmit` + `npm test`
4. 返回变更清单和验证结果

## 已验证
- 当前 git status 干净
- tsc --noEmit 通过
- npm test 通过（134 用例）

## 需要特别注意

### 历史踩坑
- 不要把 IconBack 加回来，只追加 IconVolumeHigh/IconVolumeLow/IconVolumeMuted
- 音量条要补 thumb，不能只有 fill
- 进度条要复用主页面结构（8px 热区 + 4px 轨道/填充），不是简单改成 8px
- 不改歌词页面的置顶/返回逻辑

### 主人偏好
- 进度条要粗，像主页面一样
- 音量按钮做成折叠弹窗

### 不能破坏的行为
- 现有播放功能
- 现有进度条拖动功能
- 歌词页面的置顶、全屏、返回功能

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
- 手动验证：进度条变粗、音量弹窗、拖动调节、静音图标、置顶/全屏/返回

### 风险
- 仍需注意的问题

### 需要主人确认
- UI/体验/产品取舍

### 给 Hermes Agent 的记录
- devlog 建议记录什么
- SPEC / DECISIONS 是否需要更新
```
