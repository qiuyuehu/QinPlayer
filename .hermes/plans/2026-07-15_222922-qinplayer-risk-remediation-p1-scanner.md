# P1 — 增量扫描 fail-closed 对账

> Executor：Codex。
> 前置：先读 master；本阶段不得与 P2/P3/P4 并行。
> 目标：消除 deletion-only 漏清理、不可访问目录误删和错误完成计数。

## 现状证据

- `electron/main.ts`：窗口创建后调用 `startIncrementalScan`。
- `electron/workers/scanner.ts::scanDirectoryWithStat`：`readdir/stat` 失败被吞掉，只返回部分文件。
- `electron/workers/scanner.ts::incrementalScan`：`toProcess.length === 0` 时提前 return，不发送现存路径，因此只删除文件的场景不会清库。
- `electron/workers/scanner.ts::main`：无论实际工作量都发送 `done { total: 0 }`。
- `electron/ipc/scan.ts::cleanDeletedSongs`：拿全库歌曲与一个全局 path set 比较并逐条删除，无法区分删除与不可访问，也没有限制在注册 roots 内。
- 外键 cascade 会同步移除歌单关联、收藏和最近播放，误删影响不可接受。

## 范围

### 新增

- `electron/workers/scannerCore.ts`
- `electron/ipc/scanReconciliation.ts`
- `electron/ipc/scanRunState.ts`
- `electron/scanTypes.ts`
- `tests/scannerCore.test.ts`
- `tests/scanReconciliation.test.ts`
- `tests/scanRunState.test.ts`

### 修改

- `electron/workers/scanner.ts`
- `electron/ipc/scan.ts`
- `SPEC.md`
- `harness/CONSTRAINTS.md`
- `harness/DECISIONS.md`
- `harness/TEST_CONVENTIONS.md`
- 新建 `docs/devlog/devlog-YYYYMMDD-scanner-safety.md`

### 非目标

- 不改歌曲逐条 upsert 为批量写入；这是现有独立技术债。
- 不做内容 hash、mtime 倒退检测、扫描取消/并发调度、symlink cycle 或封面 GC。
- 不改变 Renderer `scan:*` 公共事件的形状，除 `scan:done.total` 修正为真实语义外。

## 内部合同

在 `electron/scanTypes.ts` 定义可辨识 union，Worker 与 main 共用，至少包含：

- `song`、`progress`、`file-error`、`fatal-error`、`log`。单文件解析失败是非致命的 `file-error`；遍历编排或 Worker 自身失败是终止本轮的 `fatal-error`。
- `filesystem-snapshot`：`{ roots: string[]; existingPaths: string[]; unavailablePaths: string[] }`。
- `done`：`{ total: number }`。

`filesystem-snapshot` 只属于 Worker → main 内部协议，不进入 preload 或 Renderer IPC。

`scannerCore` 的增量结果必须区分：

- 成功找到的音频文件。
- 本轮需要解析的文件。
- 已注册 roots。
- 无法确认的 root、目录或 entry 路径。
- 尝试解析数。

## Task 1：先写遍历失败测试

在 `tests/scannerCore.test.ts` 使用注入的 `readdir/stat/parse/emit` adapter，不导入会自动执行的 worker entry。

先覆盖并确认旧实现无法满足：

1. deletion-only：数据库已有 A/B，文件系统只有 A，A 的 mtime 未变；仍必须发送完整快照，`done.total = 0`。
2. root `readdir` 失败：快照记录该 root 为 unavailable。
3. 子目录 `readdir` 失败：只记录该 subtree；完整 sibling 仍出现在 existing paths。
4. 单 entry `stat` 失败：把该 entry 作为不确定 scope，不能静默丢失。
5. 成功遍历到空目录：existing paths 为空、unavailable 为空，两者必须与“访问失败”可区分。
6. full 模式的 total 等于发现数；incremental total 等于新增/修改数；parse 失败仍计入尝试数。
7. 无论 toProcess 是否为空，消息顺序都在 `done` 前提供 snapshot。
8. 单文件 parse 失败只产生 `file-error`，但遍历本身完整时仍可发送 snapshot 和 `done`。
9. 遍历编排抛错产生 `fatal-error`，不得再发送成功 `done`。

## Task 2：抽出可测试 scanner core

在 `electron/workers/scannerCore.ts`：

- 将递归遍历和 full/incremental 编排从 worker entry 分离。
- 捕获 `readdir` 失败时记录当前目录；捕获 entry `stat` 失败时记录该 entry。
- 所有失败都 fail-closed，不把“不知道”解释为“不存在”。
- 对 roots、files、unavailable paths 做 Windows 语义去重。
- 保持音频扩展名集合和解析/封面行为不变。
- `electron/workers/scanner.ts` 只保留 worker_threads adapter、ID3/封面实现和消息转发；不得让测试 import 时执行 `main()`。

先让 Task 1 测试变绿，再重构。

## Task 3：先写删除决策与终止门测试

在 `tests/scanReconciliation.test.ts` 先覆盖删除候选：

1. deletion-only 完整快照只删除缺失 B。
2. unavailable root 下所有 DB 歌曲保留；另一个完整 root 仍正常清理。
3. unavailable 子目录只保护该 subtree，完整 sibling 中缺失歌曲可删。
4. entry stat 失败保护同一路径及其潜在后代。
5. 所有 roots 不可用、roots 为空、字段畸形时删除 0 条。
6. 成功扫描到空目录时，可删除该 root 下全部旧记录。
7. root 外歌曲绝不被本轮 reconciliation 删除。
8. `C:\Music` 不匹配 `C:\Music2`；嵌套 roots、重复 roots、尾分隔符和大小写按 Windows 语义处理。
9. existing path 永不删除。
10. 注入第二次 delete 失败时整个删除 transaction 回滚，不能半删。

在 `tests/scanRunState.test.ts` 先覆盖每个 Worker 实例独立的成功终止门：

1. 只收到 snapshot、尚未收到 `done` 时不允许对账。
2. 只收到 `done`、没有合法 snapshot 时不允许对账。
3. snapshot + `done` 之后，仍要等同一个 Worker 的 `exit(0)` 才允许提交对账。
4. snapshot 后发生 `error` 事件、`fatal-error`、非零 exit、缺少 `done` 或消息校验失败时，丢弃缓存且删除 0 条。
5. snapshot + `done` + `exit(0)` 只产生一次成功决策；重复消息/exit 不得重复删除或重复发 `scan:done`。
6. A Worker 的 snapshot/done 不能与 B Worker 的 exit 拼成成功。
7. `file-error` 不终止本轮；只要随后 snapshot + `done` + `exit(0)` 完整，仍可成功对账。

## Task 4：实现 path-aware reconciliation

在 `electron/ipc/scanReconciliation.ts`：

- 提供纯函数计算删除候选，以及一个很薄的数据库应用函数。
- containment 使用 `path.resolve`、`path.relative`、`path.isAbsolute` 和统一的 Windows 大小写策略；禁止裸 `startsWith`。
- 只有同时满足以下条件才是删除候选：
  1. DB 歌曲位于至少一个本轮注册 root 内。
  2. 不在 `existingPaths`。
  3. 不等于、也不位于任何 `unavailablePaths` 下。
- snapshot 非法或没有可信 root 时返回空候选。
- 用一个 better-sqlite3 transaction 执行本轮删除；这只解决 deletion reconciliation 原子性，不宣称 upsert 已批量化。

在 `electron/ipc/scanRunState.ts`：

- 实现纯状态机，按 Worker 实例或不可复用的 run token 缓存 `filesystem-snapshot`、`done`、fatal 状态与 exit code。
- 只有“合法 snapshot + `done` + `exit(0)`，且从未出现 fatal/error 事件”才返回一次 `successful-terminal`。
- 任一失败终止都返回 `failed-terminal` 并清空快照；状态机本身不访问数据库或 BrowserWindow。

## Task 5：接入 main，并保持公共 IPC

修改 `electron/ipc/scan.ts`：

- 删除旧 `cleanDeletedSongs(existingPaths)` 的全库 set 差集算法。
- main 只缓存 snapshot 和 `done`；不得在任一消息到达时立即 reconciliation。
- 只有同一个 Worker 经 `scanRunState` 判定为 `successful-terminal` 后，才执行一次 reconciliation；成功终止的最低条件是合法 snapshot、`done` 和 `exit(0)` 全部到齐。
- Worker `error` 事件、`fatal-error`、非零 exit、没有 `done`、没有合法 snapshot 或消息验证失败时，丢弃缓存并绝不删除。
- `file-error` 继续作为可见的单文件错误转发，但不把完整遍历误判为 fatal。
- `scan:done` 只在成功终止且 reconciliation 已提交后发送；失败本轮只发 `scan:error`，不能先报完成再失败。
- 不在收到 `done` 时清理 `scanWorker`；等待 exit 后再释放引用，并防止旧 Worker 的迟到消息污染新 run。
- 继续把现有 `scan:song-found/progress/error` 发送给 Renderer；`scan:done.total` 沿用本计划定义的真实尝试数。
- 不在本阶段改 scan-folder 参数形状或 preload 白名单；那属于 P4。

## 自动验收

~~~powershell
npx vitest run tests/scannerCore.test.ts tests/scanReconciliation.test.ts tests/scanRunState.test.ts
npx tsc --noEmit
node harness/checks.js
npm test -- --reporter=dot
npm run build
git diff --check
~~~

额外静态检查：

~~~powershell
rg -n "cleanDeletedSongs|existing-paths|done.*total: 0" electron tests
~~~

期望：旧全库清理函数和 deletion-only 早退协议消失；不得通过改名保留等价风险。

## 隔离 Electron smoke

只能使用一次性音乐目录和隔离 userData：

1. 扫描 A/B，退出；只删除 B，A 不改 mtime；重启后 B 被清理。
2. 扫描两个 roots；让其中一个盘/目录不可访问；重启后该 root 的歌曲、收藏、歌单关联、最近播放都保留，另一 root 仍可对账。
3. 恢复权限后再次启动，真实缺失文件才被清理。
4. 成功访问的空目录能清理其旧歌曲。

若无法安全隔离 userData，本阶段只报告自动验证，不得在真实库上试验。

## 文档闭环

- `SPEC.md`：把增量扫描描述改为“每轮发送完整/不确定快照，只有可信 scope 才清理”；更新真实测试快照。
- `harness/CONSTRAINTS.md`：新增“不可访问路径禁止作为删除证据”和 path-aware containment 永久约束；保留逐条 upsert 技术债。
- `harness/DECISIONS.md`：记录 fail-closed、total 语义和为何不顺手批量 upsert。
- `harness/TEST_CONVENTIONS.md`：Worker 可通过抽出的纯 core 和注入 adapter 测试，删除策略必须故障注入。
- devlog：写实际修改、验证、未做项和 Electron smoke。

## Reviewer 阻断清单

- 任一不完整快照仍可能删除 unavailable scope。
- 用字符串前缀判断 root。
- root 外歌曲被清理。
- 删除不是事务式。
- 收到 snapshot 就提前删除，或收到 `done` 就提前发送公共完成事件。
- snapshot 后 Worker 崩溃、缺 `done` 或非零 exit 仍发生删除。
- 两个 Worker 的消息可拼成一次“成功”。
- toProcess=0 仍不发 snapshot。
- done total 与 progress 分母不一致。
- 以修复本阶段为名重写歌曲 upsert、schema 或 Renderer IPC。

## 回滚

- 代码回滚按本阶段文件整体反向撤销。
- 紧急运行时降级只能“停止自动删除并保留陈旧记录”，不得恢复旧全局误删算法。
- 不清理 cover cache、music_folders 或任何用户文件。
- 若 smoke 使用了临时 profile，只删除明确确认的临时 profile；不触碰真实 userData。
