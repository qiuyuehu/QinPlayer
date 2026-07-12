# QinPlayer 歌词界面置顶功能恢复方案（v2）

> 创建：2026-07-04
> 修订：2026-07-05（Codex 审查后修正）
> 状态：待确认

---

## 问题

1. 歌词界面原本有置顶功能，微调前端界面后消失了
2. 歌词界面返回按钮图标需要从向左改成向下

## 分析

1. 歌词界面（Lyrics.tsx）顶部操作区只有全屏和返回按钮，没有置顶按钮
2. 主进程没有现成的 `window:set-always-on-top` IPC handler，只有迷你模式里直接调用 `mainWindow.setAlwaysOnTop()`
3. `preload.ts` 没有暴露 `setAlwaysOnTop` 给渲染进程
4. 歌词界面没有调用置顶功能

## 目标

1. 在歌词界面右上角添加置顶按钮，点击后窗口置顶显示
2. 歌词界面返回按钮图标从向左改成向下（新增 IconChevronDown，不改 IconBack）

---

## 改动方案

### 1. preload.ts 暴露 setAlwaysOnTop API

**文件**：`electron/preload.ts`

```typescript
// 在 ElectronAPI interface 中新增
setAlwaysOnTop: (flag: boolean) => void

// 在 contextBridge.exposeInMainWorld 中新增
setAlwaysOnTop: (flag: boolean) => ipcRenderer.send('window:set-always-on-top', flag),
```

**注意**：需要同步更新 preload.ts 里的本地 ElectronAPI interface（第 122 行附近）。

### 2. 主进程新增 setAlwaysOnTop IPC handler

**文件**：`electron/ipc/window.ts`

```typescript
ipcMain.on('window:set-always-on-top', (_event, flag: boolean) => {
  // 运行时参数校验
  if (typeof flag !== 'boolean') return
  const mainWindow = getMainWindow()
  if (!mainWindow) return
  if (flag) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  } else {
    mainWindow.setAlwaysOnTop(false)
  }
})
```

**注意**：这是新增独立 handler，不是修改迷你模式的代码。

### 3. electron.d.ts 添加类型声明

**文件**：`src/types/electron.d.ts`

```typescript
setAlwaysOnTop: (flag: boolean) => void
```

### 4. Icons.tsx 新增 IconPin 和 IconChevronDown

**文件**：`src/components/Icons.tsx`

- 新增 `IconPin`：图钉样式的 SVG 图标
- 新增 `IconChevronDown`：向下的箭头 SVG 图标
- **不修改 IconBack**（保持向左箭头，语义上它就是返回箭头）

### 5. 歌词界面添加置顶按钮

**文件**：`src/pages/Lyrics.tsx`

- 新增 `isPinned` 状态（`useState(false)`）
- 在顶部操作区添加置顶按钮（在全屏按钮左边）
- 使用 `IconPin` 图标
- 点击后调用 `window.electronAPI.setAlwaysOnTop(!isPinned)`
- 按钮 active 样式（isPinned 时高亮）
- title 在"置顶"/"取消置顶"之间切换

**置顶切换写法**（避免快速点击闭包状态滞后）：
```typescript
setIsPinned(prev => {
  const next = !prev
  window.electronAPI.setAlwaysOnTop(next)
  return next
})
```

**active 样式**：isPinned 时给按钮加 `lyrics-page__action-btn--active` class。

### 6. 歌词界面返回按钮改用 IconChevronDown

**文件**：`src/pages/Lyrics.tsx`

- 把返回按钮的 `IconBack` 改成 `IconChevronDown`
- 不改 `IconBack` 本体

---

## 置顶状态与迷你模式冲突处理

**采用简化方案**：歌词置顶只在歌词页有效，离开歌词页就 `setAlwaysOnTop(false)`。

**实现**：
- 返回按钮点击前先调用 `window.electronAPI.setAlwaysOnTop(false)`
- `useEffect` cleanup 里也调用 `window.electronAPI.setAlwaysOnTop(false)`
- 迷你模式仍按自己的置顶逻辑工作，不受歌词页影响

---

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `electron/preload.ts` | 暴露 setAlwaysOnTop API + 更新本地 ElectronAPI interface |
| `electron/ipc/window.ts` | 新增 setAlwaysOnTop IPC handler（带参数校验） |
| `src/types/electron.d.ts` | 添加 setAlwaysOnTop 类型声明 |
| `src/components/Icons.tsx` | 新增 IconPin、IconChevronDown |
| `src/pages/Lyrics.tsx` | 添加置顶按钮 + 返回按钮改用 IconChevronDown |
| `src/styles/lyrics.css` | 新增 .lyrics-page__action-btn--active 样式 |

---

## 验证方法

1. `npx tsc --noEmit` — TypeScript 语法检查
2. `npm test` — 测试通过
3. 手动验证：
   - 歌词界面右上角显示置顶按钮
   - 点击置顶按钮，窗口置顶显示
   - 再次点击，取消置顶
   - 返回按钮图标是向下的箭头
   - 歌词置顶离开歌词页即取消；迷你模式仍按自己的置顶逻辑工作

---

*方案就绪，等主人确认后执行。*
