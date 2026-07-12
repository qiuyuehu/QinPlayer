# Codex 任务包：QinPlayer 歌词界面置顶功能 + 返回按钮图标

## 背景
歌词界面原本有置顶功能，微调前端界面后消失了。需要恢复置顶功能，并把返回按钮图标从向左改成向下。

## 目标
按 `docs/plans/PLAN-lyrics-pin-restore.md` 方案实现：
1. 歌词界面右上角添加置顶按钮
2. 返回按钮图标从向左改成向下（新增 IconChevronDown，不改 IconBack）

## 非目标
- 不改 IconBack 本体
- 不改迷你模式的置顶逻辑
- 不改其他页面

## 相关文件
- `docs/plans/PLAN-lyrics-pin-restore.md` — 完整方案（已审查二轮）
- `electron/preload.ts` — 暴露 setAlwaysOnTop API
- `electron/ipc/window.ts` — 新增 setAlwaysOnTop IPC handler
- `src/types/electron.d.ts` — 类型声明
- `src/components/Icons.tsx` — 新增 IconPin、IconChevronDown
- `src/pages/Lyrics.tsx` — 添加置顶按钮 + 返回按钮改用 IconChevronDown
- `src/styles/lyrics.css` — 新增 active 样式

## 约束
- 不改 IconBack 本体（保持向左箭头）
- 不改迷你模式的置顶逻辑
- 置顶只在歌词页有效，离开歌词页自动取消
- 遵守 harness/CONSTRAINTS.md 约束

## 当前方案摘要

### 1. preload.ts 暴露 setAlwaysOnTop API
- 在 ElectronAPI interface 中新增 `setAlwaysOnTop: (flag: boolean) => void`
- 在 contextBridge.exposeInMainWorld 中新增 `setAlwaysOnTop: (flag: boolean) => ipcRenderer.send('window:set-always-on-top', flag)`
- 同步更新 preload.ts 里的本地 ElectronAPI interface

### 2. 主进程新增 setAlwaysOnTop IPC handler
- 新增独立 handler（不是修改迷你模式的代码）
- 带参数校验：`if (typeof flag !== 'boolean') return`
- `flag ? setAlwaysOnTop(true, 'screen-saver') : setAlwaysOnTop(false)`

### 3. electron.d.ts 添加类型声明
- `setAlwaysOnTop: (flag: boolean) => void`

### 4. Icons.tsx 新增 IconPin 和 IconChevronDown
- IconPin：图钉样式的 SVG 图标
- IconChevronDown：向下的箭头 SVG 图标
- 不修改 IconBack

### 5. 歌词界面添加置顶按钮
- 新增 `isPinned` 状态
- 在顶部操作区添加置顶按钮（在全屏按钮左边）
- 使用 IconPin 图标
- 置顶切换用函数式更新避免闭包滞后：
  ```typescript
  setIsPinned(prev => {
    const next = !prev
    window.electronAPI.setAlwaysOnTop(next)
    return next
  })
  ```
- isPinned 时加 `lyrics-page__action-btn--active` class
- title 在"置顶"/"取消置顶"之间切换

### 6. 歌词界面返回按钮改用 IconChevronDown
- 把返回按钮的 IconBack 改成 IconChevronDown
- 不改 IconBack 本体

### 7. 置顶状态处理
- 退出歌词页自动取消置顶
- useEffect cleanup 里调用 `window.electronAPI.setAlwaysOnTop(false)`
- 返回按钮点击前先调用 `window.electronAPI.setAlwaysOnTop(false)`
- 迷你模式仍按自己的置顶逻辑工作

### 8. lyrics.css 新增 active 样式
- 新增 `.lyrics-page__action-btn--active` 样式（高亮状态）

## 需要 Codex 做什么
1. 按方案修改 preload.ts、window.ts、electron.d.ts
2. 新增 IconPin、IconChevronDown
3. 修改 Lyrics.tsx（置顶按钮 + 返回按钮改用 IconChevronDown）
4. 修改 lyrics.css（新增 active 样式）
5. 运行 `npx tsc --noEmit` + `npm test`
6. 返回变更清单和验证结果

## 已验证
- 当前 git status 干净
- tsc --noEmit 通过
- npm test 通过（134 用例）

## 需要特别注意

### 历史踩坑
- 不要修改 IconBack 本体，只新增 IconChevronDown
- 置顶切换用函数式更新，避免快速点击闭包滞后
- 退出歌词页要取消置顶，避免和迷你模式冲突
- 主进程 handler 要做运行时参数校验

### 主人偏好
- 返回按钮图标从向左改成向下
- 置顶功能要可用
- 不改其他页面

### 不能破坏的行为
- 现有播放功能
- 现有全屏功能
- 现有返回功能
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
- 手动验证：置顶按钮、返回按钮图标、退出歌词页取消置顶

### 风险
- 仍需注意的问题

### 需要主人确认
- UI/体验/产品取舍

### 给 Hermes Agent 的记录
- devlog 建议记录什么
- SPEC / DECISIONS 是否需要更新
```
