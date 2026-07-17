# QinPlayer 风险修复执行包

> 状态：可转交 Codex Executor；仅完成计划，尚未实施。
> 基线日期：2026-07-15。
> 仓库：`C:\Users\秋月\Desktop\QinPlayer`。
> 执行原则：一个阶段一个变更集、一个独立审查门；不自动 commit、push、package 或 release。

## 目标

把本轮只读审计发现的七组风险修到可验证状态，同时避免把数据安全、协议迁移、IPC 重构和 Renderer 可靠性绑成一次不可回滚的大改：

1. 增量扫描在 deletion-only、不可访问目录和不完整快照下的漏清理或误删。
2. 数据库导入缺少候选验证、原子发布、失败回滚、连接恢复和中断恢复。
3. `qinplayer://` 接受任意绝对路径，Range 解析没有完整边界。
4. preload 白名单、IPC 类型表、主进程注册和实际发送方向不一致。
5. 音频失败没有用户态、pending seek 丢失、Media Session 异步结果倒序覆盖。
6. Renderer 缺少全局 Error Boundary，Liked 取消收藏后页面不即时刷新。
7. scanner/protocol/database/tray 的主进程测试缺口，以及 React `act(...)` 与 Vite/Vitest 配置警告。

## 当前可复现基线

- `node harness/checks.js`：通过。
- `npx tsc --noEmit`：通过。
- `npm test -- --reporter=dot`：53 个测试文件、520 个测试通过。
- 沙箱内首次测试因 Vitest 无权在系统临时目录创建 client 目录而 53 suites 全失败；沙箱外重跑全部通过。这是运行环境限制，不是代码失败。
- 当前测试输出仍包含：
  - Vite CJS Node API deprecated。
  - `vite:react-babel` 的 `esbuild`、`optimizeDeps.esbuildOptions` deprecated，以及 esbuild/oxc 同时设置警告。
  - 18 条 React `act(...)` 警告：SongList 10、MiniPlayer 6、App 1、Playlists 1。
- `npm ls` 显示应用、electron-vite、plugin-react 使用 Vite 5.4.21，而 Vitest 4.1.8 自带 Vite 8.0.16。

执行者开始任何阶段前必须重新运行基线，不得直接依赖上述数字。

## 固定执行顺序

| 阶段 | 主题 | 风险等级 | 进入下一阶段前的门 |
|---|---|---:|---|
| P0 | 主人确认产品/兼容行为 | 决策门 | 明确回复“按推荐项执行”或逐项选择 |
| P1 | 增量扫描 fail-closed 对账 | 最高 | 独立 Reviewer 确认没有误删路径 |
| P2 | 数据库导入事务式发布与恢复 | 最高 | 故障注入测试 + 独立 Reviewer |
| P3 | 受控资源 ID 协议与 Range | 最高 | 旧 `?path=` 完全不可用 + Electron seek smoke |
| P4 | IPC 三方向端到端类型化 | 高 | 全通道清单/Harness 一致性审查 |
| P5 | 播放失败、pending seek、Media Session | 高 | 快速切歌/重试/恢复专项审查 |
| P6 | Error Boundary 与 Liked 即时刷新 | 中 | Renderer 专项测试和 UI smoke |
| P7 | Tray 直测、act/Vite 警告清零 | 中/低 | 全量输出无框架警告 |

P0 不改代码。P1–P4 禁止并行修改。P5 与 P6 逻辑上独立，但仍建议顺序执行，避免同时改全局 Renderer 壳层。P7 最后做，防止前面阶段新增测试后重新引入警告。

## 阶段文件

- P0：`2026-07-15_222922-qinplayer-risk-remediation-p0-decision-gate.md`
- P1：`2026-07-15_222922-qinplayer-risk-remediation-p1-scanner.md`
- P2：`2026-07-15_222922-qinplayer-risk-remediation-p2-database-import.md`
- P3：`2026-07-15_222922-qinplayer-risk-remediation-p3-resource-protocol.md`
- P4：`2026-07-15_222922-qinplayer-risk-remediation-p4-ipc-contract.md`
- P5：`2026-07-15_222922-qinplayer-risk-remediation-p5-playback-resilience.md`
- P6：`2026-07-15_222922-qinplayer-risk-remediation-p6-renderer-recovery.md`
- P7：`2026-07-15_222922-qinplayer-risk-remediation-p7-test-quality.md`

每个阶段文件都是自包含的 Executor 任务包。另一个窗口应先读本文件，再一次只执行一个阶段。

## 全局硬约束

1. 开始前先读 `SPEC.md`、`harness/CONSTRAINTS.md`、`harness/DECISIONS.md`、`harness/TEST_CONVENTIONS.md` 和对应阶段文件。
2. 若根目录存在 `.codegraph/`，理解或定位调用链时先使用 CodeGraph。若索引报 `unable to open database file`，记录失败后才回退到 `rg`/逐文件读取。
3. 遵循 red → green → refactor：先写能证明风险的失败测试，再做最小实现。
4. 不新增联网能力，不更换技术栈，不修改三个 tsconfig。
5. P1–P6 不新增依赖，不修改数据库 schema，不改变 17 个 Feature Flags。
6. 不删除已有测试；新测试放在 `tests/`，描述使用中文。
7. 禁止在真实用户 `userData` 或唯一音乐目录上做删除、导入、损坏和权限故障测试。必须使用临时目录、依赖注入、内存/临时数据库或隔离的 Electron profile。
8. 任何“安全失败”都采用 fail-closed：扫描宁可保留陈旧记录，导入宁可拒绝候选，协议宁可返回 4xx，不得猜测并继续破坏性操作。
9. 不以修改 SPEC 来掩盖未修技术债；实现完成后再把 SPEC 改为新的当前事实。
10. 不自动 commit、push、打包或发布。每阶段保留可审 diff 交给 Reviewer。

## 不可放宽的安全不变量

这些不变量来自现有 Harness 与本轮风险目标，不是可选 UI 偏好：

- 扫描：不可访问 root/subtree/entry 一律保留相关数据库记录；只有“成功遍历到空目录”才允许清空该 scope。
- 扫描提交：同一个 Worker 必须同时具备合法 snapshot、`done`、`exit(0)` 且从未 fatal，才允许删除和发送公共 `scan:done`；早到 snapshot/done 只能缓存。
- 扫描完成数：`scan:done.total` 表示本轮尝试解析的文件数，解析失败仍计入，与 progress 分母一致。
- 数据库导入：Windows 上不得 rename 覆盖已存在 target；phase 使用不可变 marker。`committed` 用稳定文件身份而非可变内容 hash 绑定 target；回滚遇到新 target 时必须先 quarantine 成功，才能移动 rollback。
- 协议：生产代码不保留 `?path=` 回退。音频/封面使用歌曲 ID，头像只解析主进程设置中的当前头像。
- Range 非法或超出文件边界时严格返回 416 且不得创建 stream；除非主人在 P0 明确选择备选并先同步 Harness 合同。
- Retry 无论采用哪种 UX，都不得重复“最近播放/播放次数”记账或清空/重排队列。
- 迟到的 fade/load operation 不得覆盖更新的直接 load 或 Retry。
- Media Session 的旧异步结果绝不能覆盖当前 Track。

## P0 推荐合同

数据库兼容、Range 越界、播放失败 UX、重试位置、错误提示覆盖范围、错误页恢复方式、Media Session 更新时机和 Liked 提交时机属于产品/兼容行为。另一个窗口必须先执行 P0；只有主人明确回复“按推荐项执行”或逐项选择后，才能进入受影响阶段。

## 必须由主人决定、Executor 不得猜测的事项

以下两项不属于本执行包的运行时修复。另一个窗口应记录为 blocked product decision，不得顺手实施：

1. Mini 是否永久依赖 tray。当前入口依赖 `playback && miniMode && tray`；若要解耦，必须另定 tray 关闭时的 Mini/关闭行为。
2. Feature Flag 关闭后 Settings 控件应隐藏、禁用并解释，还是继续可编辑但效果被拦截。应按 flag 分组做产品决策，不做一次性猜测。

P7 若无依赖改动方案不能消除 Vite 警告，也必须先获得主人对 `package.json`/lockfile 调整的明确授权。

## 每阶段统一工作流

1. 记录 `git status --short`，列出本阶段允许修改/新增的文件。
2. 先运行本阶段定向测试，确认新增测试在旧实现上失败且失败原因正确。
3. 实施最小修复；不处理阶段文件“非目标”中的邻接问题。
4. 运行：

   ~~~powershell
   npx tsc --noEmit
   node harness/checks.js
   npx vitest run <本阶段测试文件>
   npm test -- --reporter=dot
   npm run build
   git diff --check
   ~~~

5. 只在相关阶段做真实 Electron smoke；明确区分自动验证、真实桌面验证和未执行项。
6. 更新 `SPEC.md` 当前事实、Harness 决策/约束和一个新 devlog。不要改 README 或历史计划。
7. 交给未参与实现的 Reviewer。P1–P4 的阻断问题清零前不得进入下一阶段。

## 全局完成定义

- 七个阶段各自验收通过，没有跨阶段半迁移。
- 旧 `qinplayer://...?path=` 在可发布代码和测试 mock 中均消失。
- scanner 的删除决策对不完整快照为 fail-closed，snapshot 后崩溃/缺 done/非零 exit 均删除 0 条。
- 导入在每个可注入失败点都能保持或恢复可用连接，并能依靠不可变 phase markers 从进程中断遗留物恢复。
- invoke/send/push 三方向类型、白名单、注册与发送点可由编译器和 Harness 校验。
- 音频错误可见可重试，pending seek 只应用到正确歌曲一次，Media Session 不被旧请求覆盖。
- Renderer render 崩溃有恢复页；Liked 取消收藏成功后即时移除。
- protocol/database/scanner/tray 都有直接测试。
- 全量测试 0 失败，输出中无 React act、Vite CJS、react-babel esbuild/oxc 警告。
- 没有新增依赖、schema 或 Feature Flag，除非主人单独批准 P7 的依赖分支。

## Executor 最终报告模板

- 本阶段结果：完成 / 阻断。
- 实际修改文件：逐项列出。
- 行为变化：只列本阶段合同。
- 自动验证：命令与实际通过数字。
- Electron 验证：场景与结果。
- 未执行/手工项：明确写出。
- 剩余风险：不把非目标宣称为已修。
- Reviewer 结论：阻断项数量和处理结果。
- Git：未 commit、未 push、未 package/release。
