# 窗口尺寸持久化方案（v3）

> 创建：2026-07-09
> 状态：待确认
> 基于：Codex 二审意见重写

---

## 前置条件

- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`
- 代码规范：TypeScript，中文注释
- 测试运行：`npm test`
- 数据库：better-sqlite3（同步 API）
- 开工前必读：`src/types/ipc.ts`（确认当前 FeatureFlagKey 末尾元素）

---

## Codex 二审问题 → 本方案如何处理

| # | 问题 | 处理方式 |
|---|------|---------|
| P1 | 迷你模式 hide→setSize(350,150)→show 触发 resize，debounce 把迷你尺寸写进数据库 | 进入 mini 前 `saveCurrentWindowBoundsNow()` 立即保存 + 设 `isMiniMode` 标志暂停持久化 + timer 回调内二次检查 isMiniMode |
| P1 | windowSizePersist:false 时退出 mini 仍读数据库 | 退出 mini 按 flag 决定：true 恢复保存的 bounds，false 用默认 1000x680 |
| P1 | 退出 mini 的恢复逻辑没复用 isBoundsValid | 新增 `electron/windowBounds.ts` 共享模块，两条路径共用 normalizeWindowBounds |
| P2 | 任意像素在屏幕内太宽松，frame:false 窗口标题栏在屏幕外拉不回来 | normalizeWindowBounds 要求标题栏至少 60px 在 workArea 内 + clamp x/y |
| P2 | Task 5 缺 DEFAULT_FEATURE_FLAGS import | 方案明确列出完整 import 行 |
| P2 | normalizeWindowBounds 没给具体算法 | 已补完整伪代码（clamp 最小尺寸 → 找有效显示器 → clamp x/y） |
| P3 | main.ts 多余导入 screen/getDatabase | 已移除，封装在 windowBounds.ts 内 |

---

## 新增共享模块：electron/windowBounds.ts

**需要新建：** `C:\Users\秋月\Desktop\QinPlayer\electron\windowBounds.ts`

职责：读写、解析、验证、clamp 窗口 bounds。main.ts 和 window.ts 共用。

导出：
- `WindowBounds` 接口
- `loadWindowBounds()` — 从数据库读取
- `saveWindowBounds(bounds)` — 写入数据库
- `normalizeWindowBounds(bounds)` — 验证 + clamp，返回有效 bounds 或 null

**normalizeWindowBounds 完整算法：**
```typescript
import { screen } from 'electron'
import { getDatabase } from './db/database'

const MIN_WIDTH = 800
const MIN_HEIGHT = 600
const MIN_TITLEBAR_VISIBLE = 60  // 标题栏最小可见高度（frame: false）

export function normalizeWindowBounds(bounds: WindowBounds): WindowBounds | null {
  const displays = screen.getAllDisplays()
  if (displays.length === 0) return null

  // 1. clamp 最小尺寸
  const width = Math.max(bounds.width, MIN_WIDTH)
  const height = Math.max(bounds.height, MIN_HEIGHT)

  // 2. 检查是否有显示器能看到窗口顶部（标题栏可见）
  const validDisplay = displays.find(display => {
    const { x, y, width: dw, height: dh } = display.workArea
    const titlebarBottom = bounds.y + MIN_TITLEBAR_VISIBLE
    return bounds.x + width > x   // 窗口右边界在 workArea 左侧之右
      && titlebarBottom > y       // 标题栏底部在 workArea 顶部之下
      && bounds.x < x + dw        // 窗口左边界在 workArea 右侧之左
      && bounds.y < y + dh         // 窗口顶部在 workArea 底部之上
  })
  if (!validDisplay) return null

  // 3. clamp x/y 到该显示器 workArea，保证顶部可拖拽区域可见
  const { x: wx, y: wy, width: ww, height: wh } = validDisplay.workArea
  const clampedX = Math.max(wx, Math.min(bounds.x, wx + ww - width))
  const clampedY = Math.max(wy, Math.min(bounds.y, wy + wh - height))

  return { x: clampedX, y: clampedY, width, height }
}
```

---

## 改动范围

| 文件 | 改动 |
|------|------|
| `electron/windowBounds.ts` | **新建**，共享模块 |
| `src/types/ipc.ts` | FeatureFlagKey + FeatureFlags 新增 `windowSizePersist` |
| `src/utils/featureFlags.ts` | FEATURE_FLAG_KEYS + DEFAULT_FEATURE_FLAGS 新增字段 |
| `electron/main.ts` | 导入共享模块；createWindow 读取 bounds；resize/move debounce + close 兜底；模块级 featureFlags + isMiniMode；macOS activate 修复 |
| `electron/ipc/window.ts` | 导入共享模块；进入 mini 前保存 bounds；退出 mini 时按 flag 恢复或用默认值 |
| `tests/featureFlags.test.ts` | 新增消融测试 |
| `tests/setup.ts` | 检查 mock 是否需要更新 |

---

## Task 1: 新增 windowSizePersist feature flag

**目标：** 类型和默认值中加入 `windowSizePersist`

**文件：** `src/types/ipc.ts`、`src/utils/featureFlags.ts`

**实现要点：** ⚠️ 打开当前源码找到最后一个元素，在其后追加。不要照抄上下文行。

`src/types/ipc.ts` — FeatureFlagKey 联合类型末尾追加：
```typescript
  | 'windowSizePersist'
```

`src/types/ipc.ts` — FeatureFlags 接口末尾追加：
```typescript
  windowSizePersist: boolean
```

`src/utils/featureFlags.ts` — FEATURE_FLAG_KEYS 数组末尾追加：
```typescript
  'windowSizePersist',
```

`src/utils/featureFlags.ts` — DEFAULT_FEATURE_FLAGS 末尾追加：
```typescript
  windowSizePersist: true,
```

**完成标准：** `npx tsc --noEmit` 无报错 + `npm test` 通过

---

## Task 2: main.ts — 导入共享模块 + 模块级变量

**目标：** 导入 windowBounds 工具，新增 isMiniMode 标志，修复 macOS activate

**文件：** `electron/main.ts`

**实现要点：**

1. **新增导入：**
```typescript
import { app, BrowserWindow, ipcMain, protocol, nativeTheme, nativeImage } from 'electron'
import { initDatabase, closeDatabase } from './db/database'
import { loadWindowBounds, saveWindowBounds, normalizeWindowBounds } from './windowBounds'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
```

2. **新增模块级变量：**
```typescript
let mainWindow: BrowserWindow | null = null
let isPlaying = false
let isQuitting = false
let currentFeatureFlags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS }  // 新增
let isMiniMode = false  // 新增：迷你模式标志，暂停 bounds 持久化
```

3. **app.whenReady() 中保存 featureFlags：**
```typescript
const featureFlags = await loadFeatureFlags()
currentFeatureFlags = featureFlags  // 保存到模块级变量
```

4. **macOS activate 修复：**
```typescript
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(currentFeatureFlags)
  }
})
```

**完成标准：** `npx tsc --noEmit` 无报错

---

## Task 3: main.ts — createWindow 读取已保存 bounds

**目标：** 创建窗口时从数据库读取 bounds，验证后应用

**文件：** `electron/main.ts` — createWindow 函数

**实现要点：**

**⚠️ createWindow 保持同步，不改 async。**

```typescript
function createWindow(flags: FeatureFlags): void {
  // ... iconPath 不变 ...

  // 读取已保存的 bounds
  let bounds: Partial<WindowBounds> = {}
  if (flags.windowSizePersist) {
    const saved = loadWindowBounds()
    if (saved) {
      const normalized = normalizeWindowBounds(saved)
      if (normalized) bounds = normalized
    }
  }

  mainWindow = new BrowserWindow({
    width: bounds.width || 1000,
    height: bounds.height || 680,
    ...(bounds.x !== undefined && { x: bounds.x }),
    ...(bounds.y !== undefined && { y: bounds.y }),
    minWidth: 800,
    minHeight: 600,
    // ... 其余参数不变 ...
  })

  // ... 后续代码不变 ...
}
```

**完成标准：** `npx tsc --noEmit` 无报错 + `npm test` 通过

---

## Task 4: main.ts — resize/move debounce 保存 + close 兜底

**目标：** 窗口尺寸变化时 debounce 保存，关闭时兜底保存一次

**文件：** `electron/main.ts` — createWindow 函数内，BrowserWindow 创建后

**实现要点：**

```typescript
if (flags.windowSizePersist) {
  let boundsTimer: ReturnType<typeof setTimeout> | null = null

  const debouncedSaveBounds = () => {
    // ⚠️ 迷你模式期间不保存（避免把迷你尺寸写进数据库）
    if (isMiniMode) return
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      // ⚠️ timer 触发时再次检查 isMiniMode（用户可能在等待期间进入了迷你模式）
      if (isMiniMode) return
      if (mainWindow && !mainWindow.isMaximized() && !mainWindow.isMinimized() && mainWindow.isVisible()) {
        saveWindowBounds(mainWindow.getBounds())
      }
    }, 500)
  }

  mainWindow.on('resize', debouncedSaveBounds)
  mainWindow.on('move', debouncedSaveBounds)

  // close 兜底
  mainWindow.on('close', () => {
    if (isMiniMode) return  // 迷你模式期间关闭不保存
    if (boundsTimer) clearTimeout(boundsTimer)
    if (mainWindow && !mainWindow.isMaximized() && !mainWindow.isMinimized() && mainWindow.isVisible()) {
      saveWindowBounds(mainWindow.getBounds())
    }
  })
}
```

**⚠️ 注意：**
- **boundsTimer 提升为模块级变量**：`saveCurrentWindowBoundsNow` 回调需要访问它来清除 pending timer
- **close handler 合并**：main.ts 已有 `mainWindow.on('close')` 处理 tray 最小化（第 146 行）。bounds 保存逻辑应合并到现有 close handler 中，不要新增一个独立的 close listener
- 跳过 `isMaximized()`：最大化的 bounds 超出 workArea，恢复后窗口会溢出屏幕
- 跳过 `isMinimized()`：最小化的 bounds 是 0x0 或负数
- 跳过 `!isVisible()`：隐藏到托盘时 bounds 可能是迷你模式的尺寸
- debounce 500ms 是拖动/调整的合理间隔，不会丢失用户最终操作
- close 先清除 timer 再保存一次，确保不丢数据

**完成标准：** `npx tsc --noEmit` 无报错

---

## Task 5: window.ts — 迷你模式进入/退出

**目标：** 进入迷你模式前保存正常 bounds 并暂停持久化，退出时按 flag 恢复

**文件：** `electron/ipc/window.ts`

**实现要点：**

1. **新增导入：**
```typescript
import { loadWindowBounds, normalizeWindowBounds } from '../windowBounds'
```

2. **需要访问 `isMiniMode` 和 `currentFeatureFlags`，以及清除 pending timer + 立即保存 bounds。**
   - 通过 `registerWindowIPC` 的回调参数传递，保持模块边界清晰
   - 扩展为三个回调：`getFeatureFlags`、`setMiniMode`、`saveCurrentWindowBoundsNow`

   修改 `registerWindowIPC` 签名，新增三个回调参数：
   ```typescript
   export function registerWindowIPC(
     getMainWindow: () => BrowserWindow | null,
     getFeatureFlags: () => FeatureFlags,
     setMiniMode: (isMini: boolean) => void,
     saveCurrentWindowBoundsNow: () => void  // 清除 pending timer + 立即保存正常 bounds
   ): void {
   ```

   main.ts 中注册时传入：
   ```typescript
   registerWindowIPC(
     getMainWindow,
     () => currentFeatureFlags,
     (isMini) => { isMiniMode = isMini },
     () => {
       // 清除 pending debounce timer + 立即保存正常 bounds
       if (boundsTimer) { clearTimeout(boundsTimer); boundsTimer = null }
       if (mainWindow && !mainWindow.isMaximized() && !mainWindow.isMinimized() && mainWindow.isVisible()) {
         saveWindowBounds(mainWindow.getBounds())
       }
     }
   )
   ```

   **⚠️ 注意：** `boundsTimer` 需要从 createWindow 内部的局部变量提升为模块级变量，以便 `saveCurrentWindowBoundsNow` 回调能访问。

3. **迷你模式进入/退出逻辑：**
```typescript
ipcMain.on('window:set-mini-mode', (_event, isMini: boolean) => {
  const mainWindow = getMainWindow()
  if (!mainWindow) return
  const flags = getFeatureFlags()

  if (isMini) {
    // 进入迷你模式：先保存正常 bounds，再暂停持久化
    saveCurrentWindowBoundsNow()  // 清除 pending timer + 立即保存当前正常 bounds
    setMiniMode(true)  // 通知 main.ts 暂停 bounds 持久化
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.setMinimumSize(350, 150)
    mainWindow.hide()
    mainWindow.setSize(350, 150)
    mainWindow.show()
  } else {
    // 退出迷你模式
    setMiniMode(false)  // 通知 main.ts 恢复 bounds 持久化
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setMinimumSize(800, 600)
    mainWindow.hide()

    if (flags.windowSizePersist) {
      const saved = loadWindowBounds()
      if (saved) {
        const normalized = normalizeWindowBounds(saved)
        if (normalized) {
          mainWindow.setBounds(normalized)
        } else {
          mainWindow.setSize(1000, 680)
          mainWindow.center()
        }
      } else {
        mainWindow.setSize(1000, 680)
        mainWindow.center()
      }
    } else {
      mainWindow.setSize(1000, 680)
      mainWindow.center()
    }

    mainWindow.show()
  }
})
```

**完成标准：** `npx tsc --noEmit` 无报错 + `npm test` 通过

---

## Task 6: 测试

**目标：** 新增 windowSizePersist 消融测试，检查 mock 同步

**文件：** `tests/featureFlags.test.ts`、`tests/setup.ts`

**featureFlags.test.ts 测试用例：**
1. DEFAULT_FEATURE_FLAGS 包含 `windowSizePersist: true`
2. FEATURE_FLAG_KEYS 包含 `'windowSizePersist'`
3. 消融验证：关闭 windowSizePersist 不影响其他 flag

**tests/setup.ts：**
- 如果有手动构造的 FeatureFlags 对象，补上 `windowSizePersist: boolean`
- 如果用 DEFAULT_FEATURE_FLAGS 展开，自动包含，无需改动

**完成标准：** `npm test` 全部通过

---

## 验收标准

1. `npx tsc --noEmit` 无报错
2. `npm test` 全部通过
3. `windowSizePersist: false` → 窗口始终 1000x680，不读取/保存 bounds
4. `windowSizePersist: true` →
   - 首次启动：默认 1000x680
   - 调整窗口后关闭 → 再次启动：恢复
   - 最大化后关闭 → 再次启动：默认 1000x680
   - 进入迷你模式 → 退出迷你模式：恢复到迷你模式之前的 bounds
   - 迷你模式期间调整窗口 → 关闭：不保存迷你尺寸
5. 多显示器变化：bounds 无效时 clamp 到可见区域，标题栏至少 60px 可见

## 手动测试（主人执行）

1. `npm run dev` 启动
2. 调整窗口大小和位置，关闭，再次启动 → 恢复
3. 最大化，关闭，再次启动 → 默认 1000x680
4. 进入迷你模式，退出 → 恢复到之前的 bounds
5. 进入迷你模式，拖动迷你窗口，退出 → 不影响正常 bounds
6. `"windowSizePersist": false` → 重启，窗口默认 1000x680
7. 退出迷你模式 → 仍然是 1000x680（不读数据库）
