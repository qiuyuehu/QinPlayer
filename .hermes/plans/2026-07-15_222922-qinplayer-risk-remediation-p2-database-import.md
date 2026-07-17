# P2 — 数据库导入验证、事务式发布与恢复

> 前置：P1 已通过 Reviewer；P0 第 1 项数据库兼容策略已由主人确认。
> 目标：任何候选错误、文件操作失败、初始化失败或进程中断都不能把应用留在“目标库损坏且连接已断”的状态。

## 现状证据

- `electron/ipc/window.ts::db:import-apply` 先 `closeDatabase()`，再把用户选择文件直接 `copyFile` 覆盖 live DB。
- 随后用 `existsSync/unlinkSync` 删除 WAL/SHM，违反主进程异步文件 I/O 约束。
- 候选没有 SQLite 完整性、外键、表/列或 QinPlayer 身份验证。
- 覆盖/初始化任一步失败后，没有旧库回滚，也不保证连接恢复。
- `electron/db/database.ts::initDatabase` 在 pragma/schema/目录全部成功前就赋值模块级 `db`；中途异常可能保留半开连接。
- `tests/windowIPC.test.ts` 只覆盖 Mini 窗口，没有导入故障路径。

## 范围

### 新增

- `electron/db/databaseImport.ts`
- `tests/databaseImport.test.ts`
- `tests/databaseLifecycle.test.ts`
- `tests/databaseImportIPC.test.ts`

### 修改

- `electron/db/database.ts`
- `electron/ipc/window.ts`
- `electron/main.ts`
- `SPEC.md`
- `harness/CONSTRAINTS.md`
- `harness/DECISIONS.md`
- `harness/TEST_CONVENTIONS.md`
- 新建 `docs/devlog/devlog-YYYYMMDD-database-import-safety.md`

### 非目标

- 不改数据库 schema，不引入通用 migration/version 框架。
- 不支持任意第三方 SQLite，不做云备份、加密或压缩格式。
- 不改变 Settings 的“两步选择/确认”UX 和现有成功后 reload/relaunch 语义。
- 不做 IPC 全量类型化；P4 处理。
- 不新增依赖。

## 经 P0 确认后固定的兼容策略

候选必须是可读的 SQLite 且具备当前代码依赖的核心表/列：

- `songs`：`id,file_path,file_name,title,artist,album,duration,cover_path,mtime,play_count,created_at`。
- `playlists`：`id,name,created_at`。
- `playlist_songs`：`playlist_id,song_id,sort_order`。
- `recently_played`：`id,song_id,played_at`。
- `liked_songs`：`song_id`。
- `music_folders`：`id,path`。
- `settings`：`key,value`。

还要验证现有 SQL 所依赖的关键 unique/FK，至少包括 `songs.file_path` unique、playlist 关系和 cascade 所需外键。

`listening_stats` 可以缺失，现有 `ensureListeningStatsTable` 会创建；若存在则必须含 `local_date,seconds` 且结构兼容。

当前没有可信的 `user_version/application_id`。不得把“任意能打开的 SQLite”当 QinPlayer 备份，也不得在本阶段猜测未知旧版迁移。

## Task 1：先固定数据库生命周期

在 `tests/databaseLifecycle.test.ts` 先证明：

1. pragma 失败、建表失败、listening table 失败、covers 目录创建失败时，局部连接都被 close，模块级 singleton 为 null。
2. 任一失败后可以再次成功 `initDatabase`。
3. 成功前 `getDatabase` 不返回半初始化 handle。
4. `closeDatabase` 幂等。

修改 `electron/db/database.ts`：

- 新增唯一的 `getDatabasePath()`，所有导入/导出使用同一来源。
- `initDatabase` 先创建局部 `nextDb`；只有 WAL、foreign keys、schema、listening table 和目录初始化全部成功后才赋模块级 `db`。
- catch 中 close 局部 handle，并确保 singleton 复位。
- 允许调用方选择是否显示初始化 error dialog，导入流程由 importer 统一报告，避免双弹窗。
- 不改变表 SQL 和现有正常启动行为。

## Task 2：先写候选验证测试

`tests/databaseImport.test.ts` 必须先覆盖：

1. 不存在、目录、空文件、随机文本、截断 SQLite 在 close live 前拒绝。
2. `PRAGMA quick_check` 不是唯一 `ok` 时拒绝。
3. `PRAGMA foreign_key_check` 返回任意行时拒绝。
4. 每个核心表/关键列缺失时给出明确中文错误。
5. 缺 `songs.file_path` unique 等当前 SQL 必需约束时拒绝。
6. 当前合法库通过。
7. 缺 `listening_stats` 的合法旧备份通过，初始化后创建该表。
8. 已存在但结构不兼容的 `listening_stats` 拒绝。
9. 候选与 live DB 是同一真实文件时拒绝。

优先用真实临时 SQLite 验证 schema；若当前 `better-sqlite3` 只为 Electron ABI 重建、无法在 Vitest Node 载入，则：

- 保留依赖注入的 validator 单元测试。
- 在 Electron 环境增加隔离集成测试或 smoke。
- 明确报告 ABI 限制；不得删除故障矩阵或把 mock 测试宣称为真实 SQLite 集成。

## Task 3：实现 staged validator

在 `electron/db/databaseImport.ts`：

- 对选择路径做 `realpath/stat`，拒绝非普通文件和 live 同一实体。
- 把候选复制到 `dirname(qinplayer.db)` 下唯一 stage 文件；候选原件永不修改。
- stage 与 target 必须同卷，为后续 Windows rename 做准备。
- 使用 `better-sqlite3(stage, { readonly: true, fileMustExist: true })` 做 quick check、foreign key check、表/列/约束验证。
- validator 始终 close 自己的只读连接。
- 所有文件 I/O 使用 `fs/promises`；禁止 `existsSync/unlinkSync`。

## Task 4：先写发布/回滚故障矩阵

通过注入 fs 和 DB lifecycle 依赖，逐个失败点测试：

1. stage copy/validation 失败：从未 close live。
2. import lock：并发第二次导入被拒绝，不创建第二组 artifacts。
3. checkpoint 抛错、返回 busy 或未完整 checkpoint：live 保持打开，target 不变；不能只测异常分支。
4. live → rollback rename 失败：恢复/保持旧连接，绝不 copy 覆盖 target。
5. stage → target rename 失败：rollback rename 回 target，重新 init 旧库。
6. 新 target 发布成功但 init/migration 失败：关闭半开新连接、清新 sidecars、把新 target rename 到唯一 quarantine，再把 rollback rename 回 target 并 init 旧库。
7. 新 target 无法 rename 到 quarantine 时进入 fatal recovery，target 与 rollback 都原样保留；禁止覆盖 target 或先动 rollback。
8. rollback restore 或旧库 reopen 失败：返回 fatal recovery，保留 stage/rollback/quarantine/phase markers，绝不 reload/relaunch。
9. 成功后新数据可查、连接已打开且 `committed` marker 已落盘；只有此时允许 reload/relaunch。
10. 成功清理失败只告警并保留可独立验证的 `committed` 恢复证据；删除 `committed` marker 必须是最后一步。
11. `prepared`、`old-moved`、`new-published`、`committed` 每种状态及“文件操作成功但下一 marker 尚未写入”的进程中断，都有 startup recovery 测试。
12. 从删除 rollback/stage/前三个 markers 的每一个清理点中断并重启，仍必须由单独的 `committed` 证明新 target 已提交并安全收尾。
13. 保留 `committed` 后对新库做正常设置/播放统计写入、WAL checkpoint 和 close；重启仍识别同一已提交文件，绝不因字节变化回滚。
14. 把 target 替换为另一份结构合法但文件身份不同的 DB；恢复器必须识别冲突，不能只凭 schema 接受。
15. 多组事务、marker 缺失/损坏、artifact 与 phase 矛盾时 fail-closed 并保留证据，不能猜测覆盖。

## Task 5：实现 Windows 可恢复发布状态机

不能假设 Windows 支持用 rename 原子覆盖已存在 target，也不能用“临时 journal rename 到已存在 journal”伪装原子更新。每次导入使用唯一 transaction id，在数据库同目录创建唯一 stage、rollback、quarantine 和以下不可变 phase marker：

- `<tx>.prepared.json`
- `<tx>.old-moved.json`
- `<tx>.new-published.json`
- `<tx>.committed.json`

每个 marker 都记录 version、transaction id、规范化 target/stage/rollback/quarantine 文件名和候选内容 digest；用独占新建（`wx`）、写入、`FileHandle.sync()`、close 完成，禁止覆盖或截断已有 marker。`prepared`、`old-moved`、`new-published` 只有前序 marker 全部存在且内容一致时才有效，最高连续 marker 定义提交前 phase。

`committed` 是例外：它是可独立验证的终态证书/tombstone，必须自含完整 manifest、候选内容 digest、同卷 rename 后 target 的稳定文件身份以及前三个 marker 内容的 chain digest。稳定身份使用经目标 Windows/Electron 环境验证的文件 identity（例如 fs adapter 暴露的 volume/device + file ID/inode），必须在正常写入、WAL checkpoint 和 rename 后保持不变；禁止用文件字节 hash、size 或 mtime 代替。若运行平台无法取得非零且稳定的 identity，P2 保持 blocked，执行者必须先补平台 adapter 设计，不能降级为易漂移指纹。

恢复器即使看不到已被成功清理的前三个 marker，也能用 `committed` 的 stable identity 绑定同一个 target，再重新运行 SQLite integrity/schema 验证和安全 init；正常业务写入不会让终态证书失效。前三个 marker 尚存在时额外核对 chain digest。`committed` 无效、stable identity 不同或与仍存在的 chain 冲突时 fail-closed。

1. 获得进程内 import mutex。
2. live 仍可用时完成 stage copy/validate。
3. stage 验证完成后写 `prepared` marker。
4. 执行 `wal_checkpoint(TRUNCATE)` 并检查返回行：`busy === 0` 且 WAL frames 已全部 checkpoint；返回 busy/不完整与抛错同样失败。验证结果后立即 close，checkpoint 与 close 之间不得插入其他异步工作。
5. `rename(target, rollback)`，成功后写 `old-moved` marker。marker 写失败时按“old 已移动但 marker 未落盘”恢复旧库，不能继续发布。
6. 异步清理 target 名称对应的旧 WAL/SHM；失败进入恢复，不继续发布。
7. `rename(stage, target)`，成功后写 `new-published` marker；禁止 fallback 到 `copyFile(..., target)` 或 delete+copy。
8. 用安全模式 `initDatabase` 打开新库。只有初始化完全成功后才写可独立验证的 `committed` marker，并在写入前读取 target stable identity、候选内容 digest 与前三个 marker 的 chain digest；不得对会继续写入的 target 建立“字节必须永久相同”合同。
9. 导入结果只有在新连接可查询且 `committed` 已持久化后才是 success；随后可清 rollback、stage、quarantine 和前三个 marker，`committed` marker 最后删除。清理中断由下次启动继续。
10. dev reload 或 packaged relaunch/exit 只能发生在 success 之后；清理可在 reload 前完成，也可由保留的 `committed` marker 让启动恢复收尾。
11. 任一步失败都按“连续有效 marker + 实际 artifacts”恢复；恢复成功返回普通导入失败，应用继续可用。
12. 新 target 已占用目标名时，恢复顺序固定为：关闭/复位新连接 → 清 target WAL/SHM → `rename(target, unique-quarantine)` → `rename(rollback, target)` → init 旧库。quarantine rename 失败时立即 fatal，绝不覆盖 target、删除 target 或移动 rollback。
13. 恢复本身失败时保留全部 artifacts，在主进程显示包含 artifact 位置的中文致命错误；不得假装成功。

`electron/main.ts` 在正常 `initDatabase` 前调用 `recoverInterruptedDatabaseImport`。恢复器一次只接受一组内容一致的 transaction artifacts，并按下表处理：

| 最高连续 marker / 物理状态 | 恢复动作 |
|---|---|
| `prepared`；target 存在、rollback 不存在 | target 仍是旧库；验证/init 旧库，清 stage 与本事务 markers |
| `prepared`；target 缺失、rollback 存在 | 视为 old rename 后 marker 尚未落盘；rollback → target，再 init 旧库 |
| `old-moved`；target 缺失、rollback 存在 | rollback → target，再 init 旧库 |
| `old-moved`；target 与 rollback 都存在、stage 缺失 | 视为 publish rename 后 marker 尚未落盘；先 quarantine target，再恢复 rollback |
| `new-published`；target 与 rollback 存在 | 验证并 init target；成功则写 `committed`，失败则 quarantine target、恢复 rollback |
| `new-published`；target 缺失、rollback 存在 | 新库无法证明仍存在；恢复 rollback |
| `committed` 可独立验证；target stable identity 相同且 integrity/schema/init 成功 | 不要求前三个 marker 仍存在，也不比较可变的 DB 字节；保留新 target，继续清 rollback/artifacts，最后删 `committed` |
| `committed`；target 缺失/无效且 rollback 存在 | 无效 target 存在时先 quarantine，再恢复 rollback，并报告降级恢复 |
| 多事务、marker 序列损坏/内容不一致、artifact 组合不在表内 | 停止启动并保留全部证据，禁止猜测 |

orphan stage 不得覆盖可用 target。任何 target → quarantine 都必须使用不存在的唯一名字；任何 rollback → target 前都必须证明 target 不存在。恢复完成并重新获得可用连接后才清理证据。

## Task 6：把 IPC 变成薄适配

修改 `electron/ipc/window.ts`：

- `db:import-apply` 先验证参数是非空字符串，再只调用 importer。
- handler 保持 Renderer 当前消费的 `{ success: boolean; error?: string }` 基本形状。
- 只有 importer 明确 success 后，开发模式才 reload，打包模式才 relaunch + exit。
- 删除直接 close/copy/unlink/init 的旧流程。
- 导出继续先 WAL checkpoint，再异步 copy；改用 `getDatabasePath()`。

在 `tests/databaseImportIPC.test.ts` 验证：

- canceled/invalid/失败都不 reload/relaunch。
- success 的开发/打包分支各执行一次，且发生在连接可用之后。
- importer 抛出时返回中文失败，不泄露堆栈给 UI。

## 自动验收

~~~powershell
npx vitest run tests/databaseLifecycle.test.ts tests/databaseImport.test.ts tests/databaseImportIPC.test.ts
npx tsc --noEmit
node harness/checks.js
npm test -- --reporter=dot
npm run build
git diff --check
~~~

额外静态检查：

~~~powershell
rg -n "existsSync|unlinkSync|copyFile\\(backupPath, dbPath\\)" electron/ipc/window.ts electron/db
~~~

期望：旧直接覆盖和同步 sidecar 删除消失。

## 隔离 Electron smoke

绝不对真实唯一数据库做故障注入：

1. 隔离 profile 中导出并重新导入，核对歌曲、歌单、收藏、最近播放、设置和听歌统计。
2. 导入文本、截断 DB、缺表 DB，确认在关闭 live 前拒绝且应用继续查询。
3. 模拟 rename 被占用或目标目录临时不可写，确认失败后旧数据仍可读且不重启。
4. 人为留下每个 phase 及“rename 已成功、下一 marker 未落盘”的 artifacts，再启动，验证 startup recovery。
5. 模拟 checkpoint 返回 busy/不完整、new target init 失败及 quarantine rename 失败，确认绝不覆盖现存 target/rollback。
6. 在成功清理删除 rollback、stage 和前三个 marker 的每一步后强制中断；重启必须只凭 `committed` 保留有效新 target 并完成清理。
7. 保留 `committed`，对新库写入设置和播放统计并 checkpoint/close；重启必须保留新数据。再用另一份合法 SQLite 替换 target，确认 stable identity mismatch 被拦截。
5. 打包版只在成功时 relaunch。

## 文档闭环

- `SPEC.md`：把“确认后替换”改为候选验证、staging、可恢复发布和成功后重启的当前事实。
- `harness/CONSTRAINTS.md`：新增导入不得直接覆盖 live、成功前不得删除 rollback、失败后必须恢复可用连接。
- `harness/DECISIONS.md`：记录严格 schema 兼容、`listening_stats` 例外、Windows rename gap 与不可变 phase markers。
- `harness/TEST_CONVENTIONS.md`：数据库导入必须覆盖每个故障点与中断恢复。
- devlog：列出真实/模拟验证边界和所有未执行 smoke。

## Reviewer 阻断清单

- 候选在 close live 后才验证。
- 任意路径仍可直接 copy 覆盖 target。
- Windows rename 失败后使用非原子 copy fallback。
- 只捕获 checkpoint 异常，却忽略 busy/未完整返回值。
- 新库 init 失败后没有恢复旧连接。
- target 已存在时直接 `rename(rollback, target)`，或 quarantine 失败后仍移动 rollback。
- initDatabase 仍暴露半初始化 singleton。
- process restart 无法处理 old-moved/new-published。
- `committed` 仍依赖已计划删除的前序 marker 才能生效，导致成功清理中断后无法启动。
- `committed` 使用内容 hash/size/mtime 绑定可写 DB，导致正常写入后误判冲突或回滚。
- 成功前删除 rollback 或执行 reload/relaunch。
- 故障测试使用真实用户 DB。

## 回滚

- 实现 diff 可整体撤销，但不得用代码回滚操作用户现存 DB。
- 若 markers/rollback 已由开发 smoke 产生，先按该版本 importer 的恢复程序完成或人工确认 target，再回滚代码。
- fatal recovery 的人工原则：完全退出应用、保留所有 artifacts；若 target 占用正式名称，先把它移动到唯一 quarantine，只有成功后才把已验证 rollback 同卷 rename 回 `qinplayer.db`，清对应 WAL/SHM 后再启动。
- 未经确认不删除任何 `*.rollback-*`、`*.stage-*`、`*.quarantine-*` 或 import phase marker。
