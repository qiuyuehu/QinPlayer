# 2026-07-15 scanner fail-closed safety

## 目标

- 修复 deletion-only 增量扫描不清库。
- 防止不可访问 root/subtree/entry 被误当成文件已删除。
- 只有同一个 Worker 完整成功终止后才事务式删除并发送 `scan:done`。

## 根因

- `toProcess.length === 0` 会提前返回，旧 Worker 不发送现存路径。
- `readdir/stat` 失败被吞掉，主进程无法区分“不存在”和“不知道”。
- 主进程收到旧 `existing-paths` 后立即对全库做 set 差集，并逐条提交删除。
- Worker 的 `done.total` 固定为 0，且没有 `exit(0)`、fatal 或 run identity 终止门。

## 修改

- 新增共享的可辨识 Worker 消息、可注入 `scannerCore`、path-aware 删除对账和每 Worker 独立状态机。
- 快照包含注册 roots、确认存在的音频路径和 unavailable scopes；所有路径按 Windows 语义去重。
- 快照 paths 必须为绝对路径，snapshot roots 必须与 Worker 启动 roots 一致。
- 删除只限可信 root 内且不受 unavailable scope 保护的确认缺失歌曲，并在一个 better-sqlite3 transaction 中提交。
- `scan:done` 延迟到合法 snapshot + `done` + `exit(0)` 后；fatal、Worker error、非零 exit、缺消息或畸形消息均删除 0 条。
- 保留逐条歌曲 upsert、现有音频格式、标签/封面兜底和 Renderer 公共事件形状。

## TDD

- Red：3 个新测试套件在旧实现上因计划模块不存在而失败，失败原因符合预期。
- Green：`scannerCore`、`scanReconciliation`、`scanRunState` 共 36 项定向测试通过。

## 验证

- `npx tsc --noEmit`：通过。
- `node harness/checks.js`：通过，扫描 electron=20、workers=2、src=59。
- `npx vitest run tests/scannerCore.test.ts tests/scanReconciliation.test.ts tests/scanRunState.test.ts`：3 files / 36 tests passed。
- `npm test -- --reporter=dot`：56 files / 556 tests passed；既有 React `act(...)` 与 Vite 配置警告仍存在，留给 P7。
- `npm run build`：通过，主进程、preload 和 Renderer 生产 bundle 均生成成功。
- `git diff --check`：通过；输出仅有仓库既有 LF→CRLF 提示。新增文件另以 no-index `--check` 验证通过。
- 静态遗留检查：`cleanDeletedSongs`、`existing-paths`、固定 `done.total=0` 均为 0 匹配。

## 未做与风险

- 未改逐条 upsert、数据库 schema、Renderer IPC、扫描取消/并发调度、symlink cycle 或封面 GC。
- 未在真实用户曲库或 `userData` 上执行故障测试。
- 隔离 Electron profile 的 deletion-only、双 root 权限恢复和空目录 smoke 尚未执行。

## Reviewer

- 独立 Reviewer 结论：通过，P1 Blocker = 0；审查前后工作树一致，Reviewer 未修改文件。
- Reviewer 独立重跑 3 files / 36 tests、56 files / 556 tests、类型、Harness、legacy 0 匹配与 `git diff --check` 均通过；生产构建沿用 Executor 的通过记录。
- 残余非阻断项：隔离 Electron profile smoke 未执行；事务回滚使用 fake 故障注入，未在真实 better-sqlite3 外键级联中注入失败；`scan.ts` 接线依赖状态机测试与源码调用链审查，尚无直接集成测试。
