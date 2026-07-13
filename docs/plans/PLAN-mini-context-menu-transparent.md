# Mini 模式右键菜单：原生菜单改为独立透明窗口

## 审查结论

| 原方案问题 | 当前源码事实 | 本版修正 |
|-----------|-------------|---------|
| 原生菜单没有主题适配，只有白色 | Electron Menu是系统级菜单，无法自定义CSS样式 | 改用独立透明窗口渲染自定义菜单组件，复用主窗口ContextMenu样式 |
| 原生菜单样式与主窗口不一致 | 主窗口ContextMenu有深色/浅色主题适配 | 独立窗口使用相同的CSS变量和组件样式 |

## 问题

Mini 模式（400×150）的右键菜单使用 Electron 原生菜单，但：
1. 原生菜单没有主题适配，只有白色
2. 样式与主窗口的 ContextMenu 不一致

## 目标

Mini 模式右键菜单改用独立透明窗口，渲染自定义菜单组件，与主窗口 ContextMenu 样式一致。

## Non-goals

- 不改变主窗口 ContextMenu 的实现
- 不改变菜单的 action 逻辑（play/insertNext/removePlaylist 等）
- 不新增 npm 依赖
- 不改变 MiniPlayer 窗口尺寸

## 契约：独立透明窗口菜单

### 窗口创建

```ts
// electron/ipc/contextMenu.ts
interface MenuWindowOptions {
  x: number              // 屏幕坐标 X
  y: number              // 屏幕坐标 Y
  width: number          // 菜单宽度
  height: number         // 菜单高度
  entries: NativeTrackMenuEntry[]
}
```

规则：
1. 创建透明、无边框、置顶的 BrowserWindow
2. 窗口大小根据菜单项数量动态计算
3. 窗口位置在触发点附近，超出屏幕时自动调整
4. 窗口失去焦点时自动关闭

### IPC 协议

保留现有 `context-menu:show-track` 通道，返回 `action | null`。

新增 `context-menu:close` 通道，用于窗口关闭时通知 renderer。

### Renderer 组件

新建 `src/components/MiniContextMenu.tsx`，复用主窗口 ContextMenu 的样式。

规则：
1. 接收菜单项数据和位置参数
2. 渲染菜单项，点击后通过 IPC 返回 action
3. 点击外部或按 ESC 关闭
4. 适配深色/浅色主题

## 改动范围

| 类型 | 文件 | 改动 |
|------|------|------|
| Modify | `electron/ipc/contextMenu.ts` | 改为创建透明窗口渲染菜单 |
| Modify | `electron/main.ts` | 注册新 IPC 通道 |
| Create | `src/components/MiniContextMenu.tsx` | Mini 专用菜单组件 |
| Create | `src/styles/mini-context-menu.css` | Mini 菜单样式（复用主窗口样式） |
| Modify | `src/components/MiniQueueView.tsx` | 使用新菜单组件 |
| Modify | `src/types/ipc.ts` | 新增 IPC 通道类型 |
| Modify | `tests/contextMenuIPC.test.ts` | 更新测试 |
| Modify | `tests/MiniQueueView.test.tsx` | 更新测试 |

明确不修改：
- 主窗口 ContextMenu.tsx
- playerStore.ts
- useAudioSync.ts
- 其他组件

## 实现步骤

### Task 1：主进程创建透明窗口

修改 `electron/ipc/contextMenu.ts`：

1. 创建透明 BrowserWindow：
   - `transparent: true`
   - `frame: false`
   - `alwaysOnTop: true`
   - `skipTaskbar: true`
   - `resizable: false`

2. 加载菜单页面：
   - 使用 `file://` 协议加载本地 HTML
   - 或使用 `loadURL('data:text/html,...')` 加载内联 HTML

3. 窗口定位：
   - 在触发点附近显示
   - 超出屏幕时自动调整

4. 窗口关闭：
   - 失去焦点时关闭
   - 点击菜单项后关闭
   - 返回 action | null

### Task 2：菜单组件

新建 `src/components/MiniContextMenu.tsx`：

1. 复用主窗口 ContextMenu 的样式变量
2. 渲染菜单项（label + disabled 状态）
3. 点击菜单项通过 IPC 返回 action
4. 点击外部或按 ESC 关闭

### Task 3：样式适配

新建 `src/styles/mini-context-menu.css`：

1. 复用主窗口 ContextMenu 的样式
2. 适配深色/浅色主题（使用 CSS 变量）
3. 透明背景

### Task 4：MiniQueueView 接入

修改 `src/components/MiniQueueView.tsx`：

1. 删除 `useNativeTrackContextMenu` 调用
2. 右键时调用新 IPC 打开透明窗口菜单
3. 接收 action 后执行对应操作

### Task 5：测试

1. 更新 `tests/contextMenuIPC.test.ts`
2. 更新 `tests/MiniQueueView.test.tsx`
3. 新增 `tests/MiniContextMenu.test.tsx`

## 验收标准

1. `npm run verify` 全绿
2. Mini 模式右键菜单样式与主窗口一致
3. 深色/浅色主题都能正确显示
4. 菜单可越过 400×150 窗口边界
5. 点击菜单项执行正确 action
6. 点击外部或按 ESC 关闭菜单
7. 连续快速右键只显示一个菜单

## 手动测试

1. 切换到 Mini 模式，右键歌曲
2. 确认菜单样式与主窗口一致（深色/浅色）
3. 点击"下一首播放"，确认执行正确
4. 点击菜单外，确认菜单关闭
5. 按 ESC，确认菜单关闭
6. 快速连续右键两首歌，确认只显示一个菜单

## 独立程序员视角自审

| 自审问题 | 处理结果 |
|---------|---------|
| 透明窗口如何加载菜单组件？ | 使用 data URL 加载内联 HTML，或 file:// 加载本地 HTML |
| 菜单样式如何与主窗口一致？ | 复用 CSS 变量和样式类 |
| 窗口定位如何处理边界？ | 在触发点附近显示，超出屏幕时自动调整 |
| 点击外部如何检测？ | 窗口失去焦点时关闭 |
| 连续快速右键如何处理？ | 主进程单 pending guard |

**自审结论：** 方案已具备可实施性；主要风险是透明窗口的兼容性和性能，已通过 Electron 文档验证可行。

## 回滚方式

1. 按 Task 独立回滚
2. 失败时恢复原生菜单实现
3. 保留原生菜单 IPC 作为备选

## 验证

```bash
npx vitest run tests/contextMenuIPC.test.ts tests/MiniQueueView.test.tsx tests/MiniContextMenu.test.tsx
npx tsc --noEmit
npm run verify
```
