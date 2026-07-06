# Codex 任务包：QinPlayer 播放器 UI 调整

## 背景
主人对播放器 UI 有三个调整需求：音量条折叠、歌词页按钮改大、歌词页进度条位置调整。

## 目标
按 `docs/plans/PLAN-playerbar-lyrics-ui.md` 方案实现：
1. 主页面音量条折叠到音量按钮里，点击后向上弹出
2. 歌词页面播放按钮改大
3. 歌词页面播放进度条移到按钮上面

## 非目标
- 不改歌词页面的置顶逻辑（保留 IconPin、togglePinned、leaveLyrics、IconChevronDown）
- 不改迷你模式的置顶逻辑
- 不改其他页面

## 相关文件
- `docs/plans/PLAN-playerbar-lyrics-ui.md` — 完整方案（已审查二轮）
- `src/components/PlayerBar.tsx` — 音量条折叠逻辑
- `src/styles/playerbar.css` — 音量弹窗样式
- `src/pages/Lyrics.tsx` — 播放按钮改大 + 进度条移到按钮上面
- `src/styles/lyrics.css` — 按钮容器尺寸调整

## 约束
- 不改歌词页面的置顶逻辑
- 不改迷你模式的置顶逻辑
- 遵守 harness/CONSTRAINTS.md 约束

## 当前方案摘要

### 1. 主页面音量条折叠

**PlayerBar.tsx**：
- 新增 `showVolume` 状态和 `volumeRowRef`
- 点击外部收起：`useEffect` 监听 mousedown，用 `volumeRowRef.contains(e.target)` 判断
- 音量按钮点击：`stopPropagation` 防止触发 document click
- 音量按钮加 `aria-expanded`、`aria-label`

**JSX 结构**：
```tsx
<div className="player-bar__volume-wrapper" ref={volumeRowRef}>
  <button className="player-bar__btn" onClick={handleVolumeBtnClick} ...>
    <VolumeIcon ... />
  </button>
  {showVolume && (
    <div className="player-bar__volume-popup">
      {/* 复用现有 .player-bar__volume-bar、volumeBarRef、handleVolumeMouseDown、volumeHover tooltip 逻辑 */}
    </div>
  )}
</div>
```

**playerbar.css**：
```css
.player-bar__volume-wrapper {
  position: relative;  /* 锚点 */
}

.player-bar__volume-popup {
  position: absolute;
  bottom: 100%;  /* 向上弹出 */
  right: 0;
  z-index: 100;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  box-shadow: var(--shadow-md);
}
```

### 2. 歌词页面播放按钮改大

**Lyrics.tsx**：
- 上一首/下一首：`width={24} height={24}`
- 播放/暂停：`width={32} height={32}`

**lyrics.css**：
```css
.lyrics-page__btn {
  width: 48px;
  height: 48px;
}

.lyrics-page__buttons {
  gap: 16px;
}
```

**注意**：不改顶部 actions 和置顶 cleanup。

### 3. 歌词页面进度条移到按钮上面

**Lyrics.tsx**：
- 在 `.lyrics-page__controls` 内，把 `.lyrics-page__progress-row` 移到 `.lyrics-page__buttons` 前面

**注意**：不改顶部 actions 和置顶 cleanup。

## 需要 Codex 做什么
1. 修改 PlayerBar.tsx（音量条折叠逻辑）
2. 修改 playerbar.css（音量弹窗样式）
3. 修改 Lyrics.tsx（播放按钮改大 + 进度条移到按钮上面）
4. 修改 lyrics.css（按钮容器尺寸调整）
5. 运行 `npx tsc --noEmit` + `npm test`
6. 返回变更清单和验证结果

## 已验证
- 当前 git status 干净
- tsc --noEmit 通过
- npm test 通过（134 用例）

## 需要特别注意

### 历史踩坑
- 音量弹窗要用 wrapper ref 做 outside-click，不能只监听 document click
- 音量按钮点击要 stopPropagation，防止刚打开就关掉
- 歌词页按钮不能只改图标尺寸，还要改容器尺寸
- 进度条移动要明确在 `.lyrics-page__controls` 内部移动
- 不改歌词页面的置顶逻辑

### 主人偏好
- 音量条折叠到按钮里，点击后向上弹出
- 歌词页播放按钮要大一些
- 进度条在按钮上面

### 不能破坏的行为
- 现有播放功能
- 现有音量拖动功能
- 现有音量气泡显示
- 歌词页面的置顶、全屏、返回功能
- 迷你模式的置顶逻辑

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
- 手动验证：音量弹窗、歌词按钮、进度条位置、置顶/全屏/返回

### 风险
- 仍需注意的问题

### 需要主人确认
- UI/体验/产品取舍

### 给 Hermes Agent 的记录
- devlog 建议记录什么
- SPEC / DECISIONS 是否需要更新
```
