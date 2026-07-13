# 任务包 B：关闭窗口行为

> 来源：PLAN-sort-closebehavior-eq.md 批次 B
> 约束：不改托盘菜单、不改迷你播放器关闭按钮语义、不用 window.confirm

## 入场条件

- 任务包 A 已完成并验证
- `npm run verify` 基线全绿
- 读完 `docs/plans/PLAN-sort-closebehavior-eq.md` 第 8 节（批次 B）

## 任务

### B1. 共享类型

- `src/types/ipc.ts` 新增：
  - `CloseBehavior = 'minimize' | 'exit' | 'ask'`
  - `CloseDecision = 'minimize' | 'exit' | 'cancel'`
  - `IpcPushChannels['close:request'] = { requestId: string }`
  - `CloseResponse = { requestId: string; decision: CloseDecision; remember: boolean }`

### B2. 主进程 CloseCoordinator

- 新建 `electron/closeBehavior.ts`
- 状态机：读取/normalize closeBehavior 设置 → 同步 preventDefault → 发送 request → 等待 response
- 每次请求带 `requestId`（crypto.randomUUID）
- 只接受当前 mainWindow.webContents、当前 requestId、合法 action 的一次响应
- pending 时忽略重复 close
- renderer 未 ready / send 失败时安全回退 minimize，不创建 pending
- tray=false 时任何 closeBehavior 都直接退出
- tray 菜单"退出"、before-quit、系统退出绕过 ask
- Escape = cancel
- remember 勾选时才保存 closeBehavior 设置

### B3. preload 白名单

- `ON_CHANNELS` 加 `close:request`
- `SEND_CHANNELS` 加 `close:ready`、`close:respond`

### B4. renderer 弹窗

- 新建 `src/components/CloseConfirmDialog.tsx`
- App.tsx 根级注册 listener（在任何壳层之外）
- listener 挂载后发送 `close:ready`
- 收到 `close:request` 后渲染弹窗
- 弹窗：两个按钮（最小化到托盘 / 退出）+ "不再询问" checkbox + Escape 取消
- overlay 点击不关闭
- 选择后 send `close:respond` 一次，立即清状态
- 重复点击由 ref 锁阻止
- 复用现有 dialog token 和 reduced-motion 规则
- 400×150 mini 窗口紧凑布局不溢出

### B5. 设置页

- "通用"区域新增"关闭窗口时"：最小化到托盘 / 直接退出 / 每次询问
- `role="radiogroup"` + `role="radio"` + `aria-checked`
- mount 时读取 `settings:get(closeBehavior)`，normalize
- 变更先 await `settings:set`，成功再更新状态；失败保留旧值
- tray=false 时 minimize/ask 禁用但保留数据库原值

### B6. IPC 通道注册

- `electron/main.ts`：import CloseCoordinator，替换原有 close 处理逻辑
- `electron/main.ts`：`createTray()` 调用时传入 closeCoordinator 的 quit 方法

### B7. 测试

- `tests/closeBehavior.test.ts`：状态机测试（依赖注入，不需要 Electron 窗口）
  - 缺失/非法设置归一为 minimize
  - minimize + tray=true → prevent + hide
  - minimize + tray=false → exit
  - exit → 不发 request，quitting 只设一次
  - ask → 先 prevent，发唯一 requestId
  - pending 时重复 close 不发第二个 request
  - sender/id/action 非法均无副作用
  - renderer 未 ready → 回退 minimize
  - before-quit / tray exit 绕过 ask
- `tests/CloseConfirmDialog.test.tsx`：弹窗渲染、两按钮、checkbox、Escape、overlay 不关闭
- `tests/Settings.test.tsx`：关闭行为三态读写、tray=false 禁用
- `tests/MiniPlayer.test.tsx`：关闭按钮仍调用 setMiniMode(false)，不触发 close:respond

### B8. 验收

```bash
npx vitest run tests/closeBehavior.test.ts tests/CloseConfirmDialog.test.tsx tests/Settings.test.tsx tests/AppMotionHydration.test.tsx tests/MiniPlayer.test.tsx
npx tsc --noEmit
```

### B9. 完成后

- 更新 SPEC.md（关闭行为语义）
- 写 devlog
- 等主人手动验证后 commit
