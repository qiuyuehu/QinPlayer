# 2026-07-16 IPC contract

## 目标

- 让 invoke、Renderer → main send、main → Renderer event 各自拥有完整 tuple/result 合同。
- 让类型表、preload runtime allowlist、主进程注册和事件发送点无法静默漂移。
- 保持现有 channel、参数顺序和正常业务结果，集中收紧异常暴露面。

## 合同与迁移

- `src/types/ipc.ts` 当前包含 40 个主窗口 invoke、3 个 Mini 菜单 invoke、10 个 send、10 个 event，并导出四个 exhaustive runtime record。
- 主 preload 从三个主窗口 record 构造 Set；Mini preload 继续只暴露 `getInit`、`ready`、`resolve`。
- 新增 `typedIpc.ts`，集中 `handleIpc`、`onIpc`、`sendIpc`。所有 Electron untyped rest args 只在该文件以 `unknown` 窄化，没有显式 `any`。
- contextMenu、eq、listening、songs、playlists、settings、scan、window 与 main 的业务注册/发送已迁移；Renderer invoke 返回值强转已删除，调用点直接取得合同结果。
- `scan:song-found` 保留真实 Worker payload；LocalMusic 在主进程已入库后按 `filePath` 取回正式 Track，没有伪造数据库 ID。

## Harness 与错误面

- Harness 新增跨文件 AST 审计，阻断 typed 边界外裸 IPC、动态 channel、漏注册、合同外注册、同方向重复、错方向、preload 漏/多 key、context surface 泄漏与 event 无 sender。
- 19 个 Harness 测试覆盖原规则和 12 类 IPC 故障 fixture；真实仓库扫描 electron=24、workers=2、src=59。
- thrown error 由 typed wrapper 记录原始异常并拒绝固定中文错误；正常值和既有结构化失败不被重写。
- `scan-folder`、扫描错误 event、`db:export` 的结构化失败已脱敏；注入含绝对路径/秘密标记的异常时，Renderer 只收到固定中文消息。

## 自动验证

- `npx tsc --noEmit`：通过。
- `npx tsc -p tsconfig.ipc-contract.json --noEmit`：通过。
- `npx tsc -p tsconfig.web.json --noEmit`：通过。
- P4 核心验收：3 files / 37 tests passed；首审修复回归：7 files / 64 tests passed。
- 全量：67 files / 774 tests passed；`pretest` Harness 同时通过。
- `npm run build`：main、两个 preload 和 Renderer bundle 均构建成功。
- 静态扫描：裸 `ipcMain.handle/on` 只命中 `typedIpc.ts`；业务 `webContents.send`、Renderer invoke 返回值强转和 `typedIpc.ts` 显式 `any` 均无残留。
- `git diff --check`：通过，仅显示仓库既有 LF/CRLF 转换提示。

## Electron 隔离 smoke

- 使用 Electron 31.7.7、真实 Electron ABI `better-sqlite3`、两个不可见 BrowserWindow 和工作区内临时 profile；结束后数据库、bundle、入口与 profile 全部删除，未触碰用户 profile。
- 主窗口使用生产 preload 与 typed wrapper，真实调用歌曲查询、歌单创建/查询/删除、设置读写、文件夹查询、EQ 保存/读取、听歌日统计、歌词读取、auto-launch 查询和 URL helper。
- 10 类 main → Renderer event 均通过生产 `sendIpc` 到达；安全的 `theme-changed` send 到达生产 listener；主 preload 拒绝 Mini context channel。
- Mini 窗口使用生产专用 preload，只存在 `getInit`、`ready`、`resolve`，没有 `electronAPI`；三个 invoke 通过 sender guard 完成。

## 未做与风险

- 未自动操作系统文件/文件夹对话框、真实扫描 Worker、数据库导入导出对话框、窗口最小化/关闭/Mini 尺寸、托盘控制或 auto-launch 写入，避免修改桌面与系统状态。
- 未执行 packaged 应用 smoke；Mini 菜单真实 active child 创建、透明窗口/DPI/多显示器行为继续由现有单元测试和人工 Electron 验收覆盖。

## Reviewer

- 首轮独立 Review：Blocker 0、Important 5、Suggestion 1，gate 未通过。
- 已修复五项 Important：数据库导入 resolved failure 脱敏、扫描事件刷新合并、boolean send 运行时 guard、Harness IPC 别名追踪、`playlists:getSongs` 既有 `added` wire 值恢复。
- 同轮处理 Suggestion：`onIpc` 同时收敛同步抛错与异步 rejection；新增 AST shorthand 解构回归，避免 Harness 在真实仓库崩溃。
- 第一次短复审：Blocker 0、Important 2、Suggestion 0；发现 `scan:error` 会丢弃尚未刷新的已入库歌曲，以及 Harness 只追踪 import alias、仍会被局部别名绕过并误认无 import 的同名函数。
- 已在 `scan:error` 立即刷新并用 generation 防止旧请求覆盖终态；Harness 改为只从真实 import 建立根绑定，再传播 ipcMain、typed wrapper、namespace 与 webContents 局部别名。新增 4 项回归后全量为 67 files / 774 tests。
- 最终短复审：Blocker 0、Important 0、Suggestion 1，gate 通过。非阻断建议是用 deferred Promise 单独锁定旧曲库查询晚到不得覆盖 error/done/cleanup 终态；当前 generation 逻辑已由 Reviewer 确认正确。
