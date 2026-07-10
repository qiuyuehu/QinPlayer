# Codex 任务包：Harness 补全（checks.js + npm run verify）

## 背景
- QinPlayer 的 harness/ 只有规范文档，没有可执行的约束检查脚本
- 当前"Harness 约束检查"只能人工核对，无法自动化阻断违规
- 方案已经过 3 轮审查，文档状态已就绪

## 目标
- 新建 `harness/checks.js`，自动检查明确的永久约束违规
- 新建 `harness/checks-whitelist.json`，标记历史遗留问题
- 新增 `npm run verify` 脚本（约束检查 + 构建 + 测试）
- 新增 `pretest` hook，防止直接 `npm test` 绕过检查
- 新建 `tests/harnessChecks.test.ts`，确保检查器本身正确工作
- 更新 CONSTRAINTS.md、SPEC.md、DECISIONS.md、harness/SPEC.md

## 非目标
- 不引入新依赖（使用 TypeScript Compiler API）
- 不新建 runner.js（npm test 已由 Vitest 充当统一测试入口）
- 不实现 CI/pre-commit hook（本方案暂不涉及）

## 相关文件
- `docs/plans/PLAN-harness-checks.md`（已确认方案）
- `harness/CONSTRAINTS.md`
- `harness/DECISIONS.md`
- `harness/SPEC.md`
- `harness/TEST_CONVENTIONS.md`
- `SPEC.md`
- `tsconfig.node.json`
- `tsconfig.web.json`
- `package.json`
- `electron/main.ts`
- `electron/ipc/window.ts`
- `electron/workers/scanner.ts`
- `src/utils/AudioEngine.ts`

## 约束
- 不引入新依赖
- 不修改 `tsconfig.json`、`tsconfig.node.json`、`tsconfig.web.json`
- 不删除现有测试用例
- 遵守 harness 约束（中文注释、禁止 any、测试独立）

## 当前代码检查结果

| 检查项 | 现状 | 处理方式 |
|--------|------|----------|
| 主进程同步 I/O | 5 处同步调用 | 白名单标记 |
| Worker 写 SQLite | 无违规 | 检查项保留 |
| currentTime 放 Zustand | 无违规 | 检查项保留 |
| 裸字符串 IPC | 本轮未检查 | P2 后续实现 |
| any 类型 | 2 处 `as any` | P2 后续实现 |

## 需要 Codex 做什么

### Task 1: 新建 harness/checks.js

**文件格式：** JavaScript（Node.js 脚本，直接 `node harness/checks.js` 运行）

**架构：**
- 导出 `runChecks()` 函数（供测试调用），接口定义：
  ```typescript
  interface CheckResult {
    passed: boolean
    violations: Array<{ rule: string; file: string; line: number; message: string }>
    scannedFiles: { electron: number; workers: number; src: number }
    unusedWhitelistEntries: Array<{ rule: string; file: string; pattern: string }>
  }

  function runChecks(options: {
    projectRoot: string
    configPaths: string[]  // tsconfig.node.json, tsconfig.web.json
    whitelistPath: string
  }): CheckResult
  ```
- CLI 入口只设置 `process.exitCode`
- 扫描文件数按作用域检查：electron/、electron/workers/、src/ 分别必须命中，不是合计大于零
- 合并两个 tsconfig 时按绝对路径去重

**tsconfig 处理：**
- 根 `tsconfig.json` 是 `files: []` 加项目引用，不能直接解析
- 必须读取 `tsconfig.node.json` 和 `tsconfig.web.json`，合并扫描
- 扫描文件数为 0 时退出码 1（防止假绿）

**检查项（AST 级别，P0 必须实现）：**

1. **主进程禁止同步 I/O** — 追踪来自 `fs`/`node:fs` 的所有 `*Sync` 调用（包括 `readdirSync`、`statSync`、`readFileSync`、`writeFileSync`、`existsSync`、`unlinkSync`、`renameSync` 等），支持命名导入、别名导入、namespace import 和 `require('fs')`
2. **Worker 禁止导入数据库模块** — 检查 `electron/workers/` 目录下是否导入 `better-sqlite3`、`electron/db/database` 等数据库模块（比检测调用更可靠）

**白名单机制：**

白名单按 `rule + file + AST 表达式/规范化源码` 匹配，不按行号（行号会漂移）。

新建 `harness/checks-whitelist.json`，格式：
```json
{
  "no-sync-io": [
    { "file": "electron/main.ts", "pattern": "require('fs').existsSync(iconPath)", "reason": "开发调试用，检查图标路径" },
    { "file": "electron/ipc/window.ts", "pattern": "fs.existsSync(walPath)", "reason": "清理 WAL 文件，数据库异常保护" },
    { "file": "electron/ipc/window.ts", "pattern": "fs.unlinkSync(walPath)", "reason": "清理 WAL 文件，数据库异常保护" },
    { "file": "electron/ipc/window.ts", "pattern": "fs.existsSync(shmPath)", "reason": "清理 SHM 文件，数据库异常保护" },
    { "file": "electron/ipc/window.ts", "pattern": "fs.unlinkSync(shmPath)", "reason": "清理 SHM 文件，数据库异常保护" }
  ]
}
```

白名单规则：
- 每条必须附带 `pattern`（AST 表达式或规范化源码）和 `reason`
- 新代码不允许加入白名单（必须修复）
- 白名单变更需要主人确认
- 每个白名单条目必须实际消费一个违规；失效或多余白名单也要报错

### Task 2: npm 脚本

**package.json 脚本：**
```json
{
  "scripts": {
    "pretest": "node harness/checks.js",
    "verify": "node harness/checks.js && npm run build && npm test"
  }
}
```

- `pretest`：`npm test` 前自动运行，约束检查失败则阻断测试
- `verify`：完整验证（约束检查 + 构建 + 测试），用 `npm run verify` 执行

**门禁范围说明：**
- `pretest` 只保护 `npm test`，不保护 `npm run test:watch` 和 `npx vitest run`

### Task 3: 更新约束文档

**3.1 CONSTRAINTS.md 第 71 行：**
```
- 歌词滚动禁止 `top`/`scrollTop`，必须用 `transform: translateY()` + `will-change: transform`
```

改为：
```
- 歌词滚动使用 `scrollTo()` + `behavior: 'smooth'`（普通滚动）或 `behavior: 'auto'`（切歌跳转），隐藏原生滚动条
```

**3.2 SPEC.md 第 318 行：**

当前写法与 CONSTRAINTS.md 冲突，需同步更新为 `scrollTo()` 方案。

**3.3 harness/DECISIONS.md：**

在顶部（最新记录位置）插入：
```markdown
## 2026-07-10 歌词滚动改用 scrollTo

- **背景**：原决策（2026-06-10）使用 `transform: translateY()` 实现歌词滚动
- **决策**：改用 `scrollTo()` + `behavior: 'smooth'`（普通滚动）或 `behavior: 'auto'`（切歌跳转）
- **原因**：`scrollTo()` 更简单，浏览器原生支持平滑滚动，无需手动计算 transform 偏移
- **权衡**：失去 GPU 硬件加速，但现代浏览器对 scrollTo 优化足够
- **状态**：已验证
- **替代**：原 2026-06-10 决策（transform 方案）已被此决策替代
```

同时更新原 2026-06-10 决策状态为"已被 2026-07-10 决策替代"。

**3.4 harness/SPEC.md：**

补上新增脚本结构：
```markdown
harness/
├── CONSTRAINTS.md
├── DECISIONS.md
├── TEST_CONVENTIONS.md
├── SPEC.md
├── checks.js              ← 新增：约束检查脚本
└── checks-whitelist.json  ← 新增：白名单
```

### Task 4: 检查器测试

**文件：** 新建 `tests/harnessChecks.test.ts`

**测试用例：**
1. 合法代码 → 无违规
2. 四种 fs 导入形式（命名导入、别名导入、namespace import、require）→ 检测到违规
3. Worker 数据库导入 → 检测到违规
4. 精确白名单匹配 → 跳过已知违规
5. 过期白名单 → 报错
6. 零文件扫描 → 退出码 1

**实现：**
- 测试中使用临时目录与临时 tsconfig，不依赖 cwd 或扫描真实项目
- 按作用域检查扫描文件数：electron/、electron/workers/、src/ 分别必须命中

## 已验证
- 方案已通过 Claude Code 自审 + Codex 三审
- 白名单示例已补全 5 处同步调用
- runChecks() 接口已明确定义

## 验收标准
1. `node harness/checks.js` 运行无报错
2. `npm run verify` 运行无报错（约束检查 + 构建 + 测试）
3. `npm test` 前自动运行约束检查（pretest hook）
4. 约束检查失败时阻断测试
5. 白名单机制可用，失效白名单报错
6. 扫描文件数为 0 时退出码 1
7. CONSTRAINTS.md、SPEC.md、DECISIONS.md、harness/SPEC.md 已同步更新
8. 检查器测试通过（6 个用例）

## 返回格式
- 结论：已完成 / 需要返工
- 变更：改了哪些文件、改了什么行为
- 验证：运行了哪些命令、哪些通过、哪些失败
- 风险：仍需注意的问题
- 需要主人确认：UI/体验取舍
- 给 Claude Code 的记录：devlog 建议、SPEC/DECISIONS 是否需要更新
