# 2026-07-16 database import safety

## 目标

- 在关闭 live DB 前验证候选是结构兼容且完整的 QinPlayer SQLite。
- 用同卷 rename、rollback、quarantine 和持久化 phase markers 替代直接覆盖。
- 任何发布失败或进程中断都恢复可用连接，无法安全恢复时 fail-closed 并保留证据。

## 修改

- 数据库生命周期改为局部连接初始化；WAL、外键、schema、`listening_stats` 和 covers 目录全部成功后才发布 singleton，失败关闭局部连接并允许重试。
- `getDatabasePath()` 成为 live DB 唯一路径来源，导入 IPC 删除直接 close/copy/unlink/init，导出也复用该路径。
- 候选经 realpath/stat、同一实体检查、同目录 stage、只读 `quick_check`、`foreign_key_check`、核心表/列、关键 unique/cascade FK 和可选 `listening_stats` 验证。
- 发布先写不可变 `prepared`，验证完整 WAL checkpoint 后紧邻关闭连接，再同卷 rename `target → rollback`、`stage → target`。
- `prepared`、`old-moved`、`new-published` 形成 digest chain；`committed` 自含 manifest、候选 digest、三个 marker digest、chain digest 和 stable device/file ID。
- phase manifest 额外记录导入前 target 的 stable identity；rollback 回迁后必须匹配该身份，清理中断时也据此确认当前 target 确实是原旧库。
- 新库 init、查询和 `committed` 持久化全部成功后才返回 success；cleanup 保证 `committed` 最后删除，失败时保留其作为独立恢复证书。
- 启动在普通 `initDatabase()` 前恢复中断事务；target 冲突必须先移到唯一 quarantine，quarantine/rollback/reopen 失败即 fatal 并显示 artifact 目录。
- prepared 前遗留的 orphan stage 会在不触碰可用 target 的前提下清理；失败恢复残留 artifacts 时拒绝同进程创建第二组事务，要求先重启续跑恢复。
- 移除旧同步 WAL/SHM 清理代码及四条失效 Harness 白名单。

## TDD

- Red：新增生命周期、导入状态机和 IPC 三组测试；旧实现缺少生命周期工厂与 importer，IPC 仍执行直接覆盖。首次 IPC red 还包含测试 mock 预期新依赖、旧 handler 仍读取旧依赖的噪声，生产切换后由薄适配断言取代。
- Green：P2 定向测试 3 files / 104 tests passed，其中导入 schema、故障发布和启动恢复矩阵为 87 tests。
- 故障矩阵覆盖 copy/validation、并发锁、checkpoint throw/busy/incomplete、四种 marker 写失败、两次 rename、sidecar、new init、quarantine、rollback restore、old reopen、cleanup 和每个 durable/cleanup 中断点。
- 恢复覆盖 stable identity 正常写入不漂移、合法文件替换冲突、rollback 身份替换、无 marker orphan stage、stage/quarantine 矛盾、rollback 后清理中断、残留事务重试门、多事务、损坏 marker 和 marker/artifact 矛盾。

## 验证

- `npx tsc --noEmit`：通过。
- `node harness/checks.js`：通过，扫描 electron=21、workers=2、src=59。
- P2 定向：3 files / 104 tests passed。
- `npx vitest run --reporter=dot --silent`：59 files / 660 tests passed；仅有既有 Vite 配置警告。
- `npm run build`：通过，main、preload 和 Renderer 生产 bundle 均生成成功。
- `git diff --check`：通过；仅输出仓库既有 LF→CRLF 提示。
- 静态检查：`existsSync`、`unlinkSync` 和 `copyFile(backupPath, dbPath)` 在 `electron/ipc/window.ts` 与 `electron/db` 为 0 匹配。

## Electron 隔离 smoke

- Electron 31.7.7 / Node 20.18.0 / Windows 临时目录：真实 SQLite 文件的 `dev + ino` 非零，经同卷 rename 与实际 SQLite 写入后保持不变，另一文件身份不同。
- 用 Electron ABI 的真实 `better-sqlite3` 调用生产 `validateDatabaseFile`：缺 `listening_stats` 的合法当前库通过；随机文本和缺核心表 SQLite 均拒绝。
- 用同一 Electron ABI、真实 WAL 连接和 Windows 文件系统完整调用 importer factory：返回 success，新库歌曲可查，缺失的 `listening_stats` 已创建，连接保持打开，候选原件未修改，事务 artifacts 为 0。
- validator 首次 smoke 因临时 bundle 位于系统 Temp、Node 未解析到项目 `node_modules` 而在加载前失败；设置项目级 `NODE_PATH` 后同一 smoke 通过，临时 bundle 已删除。

## 未做与风险

- 未触碰真实用户 profile 或唯一数据库；所有故障发布测试使用系统临时目录和注入 lifecycle。
- 未在完整 Electron GUI 应用进程中逐相位强制终止，也未执行打包版成功导入后的真实 relaunch；factory 已在 Electron RUN_AS_NODE 中端到端通过，但 GUI 生命周期与进程级中断 smoke 仍是人工项。
- 未用真实 Windows 文件锁逐点制造 rename/quarantine 权限失败；自动测试通过 fs adapter 精确注入同一错误合同。
- Vitest Node ABI 不能直接加载为 Electron 重建的 `better-sqlite3`；schema 使用 `node:sqlite` 真实内存库，生产 validator 另由上述 Electron smoke 覆盖。

## Reviewer

- 首轮独立 Review 发现 2 个 Blocker：无 marker orphan stage 分支不可达，以及 rollback 已恢复后清理中断会导致下次启动误判 fatal。修订后以原 target stable identity、可续跑清理顺序和三条回归测试闭环。
- 二轮发现 1 个 Important：无 marker stage 与 quarantine 同时存在时会先删除部分证据；修订为该矛盾组合立即 fail-closed，并补 rollback identity 替换测试。
- 最终独立复审：Blocker 0、Important 0；Reviewer 独立确认 database import 87/87、P2 定向 104/104、TypeScript 与 Harness 均通过。
- 残余人工项不变：真实 Electron GUI 逐相位强制终止、Windows 文件锁故障和 packaged relaunch smoke 未执行。
