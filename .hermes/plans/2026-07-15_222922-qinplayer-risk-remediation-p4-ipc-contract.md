# P4 — IPC 三方向端到端类型与 Harness 一致性

> 前置：P3 已完成 ID 协议迁移并通过 Reviewer。
> 目标：invoke、renderer→main send、main→renderer event 各自有完整类型表，preload 白名单、主进程注册和发送点无法静默漂移。

## 已确认的当前漂移

- `IpcChannels` 缺：
  - `settings:pickAvatar`
  - `songs:deleteAll`
  - `open-folder`
  - `open-file-location`
  - `read-lrc-file`
  - `db:export`
  - `db:import-select`
  - `db:import-apply`
- `scan-folder` 实际接收字符串并返回 `{ success, error? }`，类型表写对象和 void。
- `settings:addFolder` 实际无参数、返回 `string | null`。
- `settings:removeFolder` 实际返回 `{ deletedSongs: number }`。
- `playlists:getSongs` 实际是受限联合，类型表放宽为 string。
- `set-auto-launch` 是 send，却位于 invoke map。
- `theme-changed` 是 send，却位于 Push。
- Push 缺 `window:maximized`、`theme:system-changed`。
- Mini 菜单三个 invoke 属于专用 preload，当前没有独立 surface 表达。
- `electron/preload.ts` 的通用 API 是 `string + unknown`，Renderer 大量靠 `as Track[]` 等断言。

## 设计合同

`src/types/ipc.ts` 分成：

- `MainWindowInvokeChannels`。
- `ContextMenuInvokeChannels`。
- `IpcChannels`：二者合并，供主进程 typed handler 使用。
- `IpcSendChannels`：Renderer → main。
- `IpcEventChannels`：main → Renderer。

每个 channel 使用 tuple args 和 result：

~~~ts
type ChannelSpec<Args extends unknown[], Result> = {
  args: Args
  result: Result
}
~~~

公共 helper 只能接受对应 key：

- `invoke<C extends MainWindowInvokeChannel>(channel, ...args)`。
- `send<C extends IpcSendChannel>(channel, ...args)`。
- `on<C extends IpcEventChannel>(channel, callback)`。

类型必须追随 P3 完成后的真实运行时载荷。本阶段禁止为了“统一好看”把字符串参数顺手改成对象。

## 范围

### 新增

- `electron/ipc/typedIpc.ts`
- `tests/ipcContract.test.ts`

### 修改

- `src/types/ipc.ts`
- `src/types/electron.d.ts`
- `electron/preload.ts`
- `electron/contextMenuPreload.ts`
- `electron/main.ts`
- `electron/ipc/contextMenu.ts`
- `electron/ipc/eq.ts`
- `electron/ipc/listening.ts`
- `electron/ipc/playlists.ts`
- `electron/ipc/scan.ts`
- `electron/ipc/settings.ts`
- `electron/ipc/songs.ts`
- `electron/ipc/window.ts`
- 所有 `window.electronAPI.invoke/send/on` Renderer 调用点。
- `harness/checks.js`
- `tests/harnessChecks.test.ts`
- `tests/setup.ts`
- 所有受类型收紧影响的现有测试。
- `SPEC.md`、`harness/CONSTRAINTS.md`、`harness/DECISIONS.md`、`harness/TEST_CONVENTIONS.md`
- 新建 `docs/devlog/devlog-YYYYMMDD-ipc-contract.md`

### 非目标

- 不改变任何 channel 名、参数顺序、成功返回值或 Feature Flag 行为。
- 编译期类型不等于运行时授权；不借本阶段宣称所有输入已安全。
- 不重做协议、数据库导入或扫描算法。
- 不新增依赖。

## Task 1：先写完整契约和类型测试

在 `tests/ipcContract.test.ts` 使用 `expectTypeOf`/编译期断言固定：

1. 当前全部 invoke/send/event channel 都在正确方向。
2. main window 与 context menu preload surface 分离。
3. `scan-folder/settings:addFolder/settings:removeFolder/playlists:getSongs` 使用真实 tuple/result。
4. P2/P3 新形状准确。
5. 错误 channel、错误参数个数、错误参数类型和错误 callback payload 在 `@ts-expect-error` 下确实失败。
6. helper 返回值不再是 unknown。

先补齐 `src/types/ipc.ts`，但暂不迁移所有调用；`npx tsc --noEmit` 应暴露剩余断点。

## Task 2：把 runtime allowlist 与类型绑定

在 `src/types/ipc.ts` 或一个无 Node/Electron 依赖的共享模块导出：

- `MAIN_WINDOW_INVOKE_CHANNELS`。
- `MAIN_WINDOW_SEND_CHANNELS`。
- `MAIN_WINDOW_EVENT_CHANNELS`。
- `CONTEXT_MENU_INVOKE_CHANNELS`。

用 `as const satisfies readonly ...[]` 或 `satisfies Record<Channel, true>` 让新增/删除 key 必须同步更新。

`electron/preload.ts`：

- 从共享常量构造 Set。
- 保留运行时拒绝未知 channel 和 unsubscribe 行为。
- `contextBridge.exposeInMainWorld` 对完整 `ElectronAPI` 使用 `satisfies`。

`electron/contextMenuPreload.ts`：

- 仍只暴露 `getInit/ready/resolve` 三个固定方法。
- 使用 `satisfies ContextMenuWindowAPI`，不得扩大到通用 invoke。

先更新 `tests/preload.test.ts`：未知 channel 拒绝、合法方向通过、event unsubscribe、便利方法调用真实 channel。

## Task 3：建立唯一 Electron 边界

在 `electron/ipc/typedIpc.ts` 提供：

- `handleIpc`：typed invoke registration。
- `onIpc`：typed renderer→main listener。
- `sendIpc`：typed main→renderer sender。

要求：

- Electron 的 untyped rest args 转换只允许集中在该文件，用 `unknown` 和窄化，不允许显式 `any`。
- wrapper 不改变 handler 的业务结果。
- thrown error 统一记录 channel，并转成不泄露本地路径/堆栈的中文 Error。
- 已返回结构化 `{ success:false }` 的 handler 继续保持结构化失败；不要双重包装。
- send 输入边界仍要由各 handler 的现有/新增 guard 处理；类型不是安全校验。

## Task 4：机械迁移全部注册和发送

按模块逐个迁移，每迁完一个模块运行 `tsc` 和对应测试：

1. contextMenu、eq、listening。
2. songs、playlists、settings。
3. scan、window。
4. main.ts 中 close、auto-launch、theme、tray/window push。

约束：

- handler 主体、SQL 和正常业务返回值保持不变。
- 实际参数是 string 的继续是 string。
- 所有 `webContents.send` 业务事件改走 `sendIpc`。
- Electron 内部事件 API（BrowserWindow `on('close')` 等）不属于 IPC，不应被误改。
- 删除 Renderer 的返回值强转，只保留真正的运行时 narrowing。

## Task 5：先写 Harness 失败 fixtures

在 `tests/harnessChecks.test.ts` 先添加会失败的临时仓库 fixture：

1. typedIpc 之外直接 `ipcMain.handle`。
2. typedIpc 之外直接 `ipcMain.on`。
3. typed sender 之外直接业务 `webContents.send`。
4. map 中有 channel 但没有注册。
5. 注册存在但 map 缺 channel。
6. 同方向重复注册。
7. invoke channel 被注册为 send，或反之。
8. 动态 channel 名。
9. main preload allowlist 漏 key/多 key。
10. context menu channel 意外进入 main preload。
11. event map 中 channel 没有任何发送点。

再修改 `harness/checks.js`：

- 收集 typed wrappers 的字符串字面量。
- 与三方向类型/运行时清单比较。
- 报告缺失、重复、方向错误和动态通道。
- 允许精确说明的 Electron 非业务 send 例外，但禁止大范围 whitelist。

Harness 规则最后启用，便于逐模块迁移；启用后不得保留裸业务 IPC。

## Task 6：收紧错误处理但不改正常语义

对所有 invoke handler 做一次审计：

- 无 try/catch 且可能抛出的 handler，经 `handleIpc` 统一转换为中文拒绝。
- 业务层需要区分 canceled/success 的继续返回现有 union。
- 不吞错后返回假 success。
- 不把 `String(err)` 中的绝对路径直接展示给 Renderer。
- 对无返回 send 的非法 payload 记录并忽略，不让异常穿透主事件循环。

该任务只改变失败路径，不更改正常 payload；Reviewer 必须逐通道抽查。

## 自动验收

~~~powershell
npx vitest run tests/ipcContract.test.ts tests/preload.test.ts tests/harnessChecks.test.ts
npx tsc --noEmit
node harness/checks.js
npm test -- --reporter=dot
npm run build
git diff --check
~~~

静态验收：

~~~powershell
rg -n "ipcMain\\.(handle|on)\\(|webContents\\.send\\(" electron
rg -n "electronAPI\\.invoke\\([^\\n]+\\) as |as Promise<" src
~~~

第一条只能命中 `electron/ipc/typedIpc.ts` 或明确非业务 Electron API；第二条不应再靠返回值断言弥补桥接 unknown。

## 真实 Electron smoke

按 surface 抽查：

- 主窗口：扫描、歌曲 CRUD、歌单、设置、EQ、导入导出、歌词读取、close/mini/theme/auto-launch。
- Push：scan progress/done/error、window maximized、system theme、tray controls、close request。
- Mini menu：三个专用 invoke 仍只接受 active child sender。

类型迁移不能只靠 build；至少走一次这些主路径，记录未测 OS 能力。

## 文档闭环

- `SPEC.md`：把 preload/IPC 描述改为三方向类型 + runtime allowlist + typed main boundary 的当前事实；仍明确运行时授权由 handler guard 负责。
- `harness/CONSTRAINTS.md`：用三个 map/typed wrapper 替代旧“全部在 IpcChannels invoke 接口”的过时表述。
- `harness/DECISIONS.md`：记录为何保留现有 payload，而不在类型迁移中对象化。
- `harness/TEST_CONVENTIONS.md`：IPC 完整性由类型测试和 Harness fixture 双重覆盖。
- devlog：列出通道计数、迁移模块和 smoke。

## Reviewer 阻断清单

- preload 仍接受任意 string。
- 类型 map 完整但 main 注册/发送仍裸字符串且无 Harness。
- Mini menu 获得主窗口通用 API。
- 通过 `any` 或大量返回值 `as` 伪造类型安全。
- 为统一类型改了运行时 payload。
- 正常业务结果被 wrapper 改写。
- 把 compile-time 类型宣称成 runtime 授权。

## 回滚

- 按模块可逐步回滚 typed wrapper 迁移；Harness“禁止裸 IPC”规则必须最后回滚/最后启用，避免中间状态卡死。
- 若 P4 整体失败，恢复到 P3 已审的运行时接口，不回滚 P3 安全协议。
- 不需要数据库或用户数据迁移。
- 不自动 commit；由主人决定提交边界。
