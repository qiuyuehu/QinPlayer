# Harness 补全方案（checks.js + npm run verify）

> 创建：2026-07-10
> 修订：2026-07-10（Codex 审核后重写）
> 状态：待确认

---

## 背景

QinPlayer 的 `harness/` 只有四份规范文档（CONSTRAINTS.md、DECISIONS.md、TEST_CONVENTIONS.md、SPEC.md），没有可执行的约束检查脚本。当前"Harness 约束检查"只能人工核对，无法自动化阻断违规。

## 问题

1. **缺少自动约束检查** — 约束文档定义了永久性规则，但没有代码强制执行
2. **历史矛盾** — CONSTRAINTS.md 要求歌词滚动用 `transform: translateY()`，但实际调用 `scrollTo()`（主人决定：更新文档，保留当前实现）
3. **runner.js 不必要** — `npm test` 已由 Vitest 充当统一测试入口，不需要重复造 runner
4. **verify 可被绕过** — 直接 `npm test` 可以跳过约束检查，需要增加 pretest hook

## 方案

新增 `harness/checks.js`，在测试之前自动检查明确的永久约束违规。使用 TypeScript Compiler API 做 AST 检查，不增加依赖。

---

## 当前代码检查结果

| 检查项 | 现状 | 处理方式 |
|--------|------|----------|
| 主进程同步 I/O | 5 处同步调用：`existsSync` 3 处（main.ts 调试用，window.ts 清理 WAL）、`unlinkSync` 2 处（window.ts 清理 WAL） | 白名单标记 |
| Worker 写 SQLite | 无违规 | 检查项保留，预防未来误用 |
| currentTime 放 Zustand | 无违规（用 ref + RAF） | 检查项保留，预防未来误用 |
| 裸字符串 IPC | 本轮未检查，存在历史类型覆盖缺口（preload.ts 有不在 IpcChannels 中的通道） | P2 后续实现，需比较 preload 白名单、ipcMain 注册和 IPC 类型映射 |
| any 类型 | 2 处 `as any`（AudioEngine.ts 的 setSinkId，合理使用） | 白名单标记 |

---

## 改动范围

| 文件 | 改动 |
|------|------|
| `harness/checks.js` | **新建**，约束检查脚本（导出 `runChecks()`，CLI 入口只设置 `process.exitCode`） |
| `harness/checks-whitelist.json` | **新建**，历史遗留问题白名单 |
| `package.json` | 新增 `verify` 脚本（`node harness/checks.js && npm run build && npm test`）、修改 `pretest`（`node harness/checks.js`） |
| `harness/CONSTRAINTS.md` | 更新歌词滚动方式（删除 scrollTo 禁令） |
| `SPEC.md` | 更新歌词滚动方式、同步更新 DECISIONS |
| `harness/DECISIONS.md` | 追加"旧决策已被替代"记录 |
| `harness/SPEC.md` | 补上新增脚本结构 |
| `tests/harnessChecks.test.ts` | **新建**，检查器测试 |

---

## Task 1: 新建 harness/checks.js

**目标：** 自动检查明确的永久约束违规

**文件格式：** JavaScript（Node.js 脚本，不需要编译，直接 `node harness/checks.js` 运行）

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

**检查项（AST 级别，P0 必须实现）：**

1. **主进程禁止同步 I/O** — 追踪来自 `fs`/`node:fs` 的所有 `*Sync` 调用（包括 `readdirSync`、`statSync`、`readFileSync`、`writeFileSync`、`existsSync`、`unlinkSync`、`renameSync` 等），支持命名导入、别名导入、namespace import 和 `require('fs')`
2. **Worker 禁止导入数据库模块** — 检查 `electron/workers/` 目录下是否导入 `better-sqlite3`、`electron/db/database` 等数据库模块（比检测调用更可靠）

**检查项（AST 级别，P1 后续补充）：**

3. **currentTime 不放 Zustand** — 检查 `src/stores/` 目录下是否有 `currentTime` 字段定义

**检查项（文本级别，P2 后续补充）：**

4. **禁止裸字符串 IPC** — 检查 `src/` 下是否有 `ipcRenderer.invoke('` 但不在 `src/types/ipc.ts` 定义的通道名
5. **禁止 any 类型** — 检查 `src/` 和 `electron/` 下是否有 `: any` 或 `as any`（排除注释和测试）

**白名单机制：**

白名单按 `rule + file + AST 表达式/规范化源码` 匹配，不按行号（行号会漂移）。

对历史遗留问题提供 `harness/checks-whitelist.json`（不需要 gitignore，提交到仓库），格式：
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

> no-any 规则是 P2 后续实现，当前版本不加入白名单。等规则实现时再添加豁免。

白名单规则：
- 每条必须附带 `pattern`（AST 表达式或规范化源码）和 `reason`
- 新代码不允许加入白名单（必须修复）
- 白名单变更需要主人确认
- 每个白名单条目必须实际消费一个违规；失效或多余白名单也要报错

**完成标准：**
- [ ] `node harness/checks.js` 运行无报错
- [ ] 当前代码通过（白名单标记已知违规）
- [ ] 扫描文件数为 0 时退出码 1

---

## Task 2: npm 脚本

**目标：** 统一验证入口，先检查约束再跑测试；防止直接 `npm test` 绕过检查

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
- 如需完整门禁，应配置 CI/pre-commit hook（本方案暂不涉及）

**完成标准：**
- [ ] `npm run verify` 运行无报错
- [ ] `npm test` 前自动运行约束检查
- [ ] 约束检查失败时阻断测试（退出码非 0）

---

## Task 3: 更新约束文档

**主人决定：选项 B（更新文档，保留当前实现）**

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

---

## Task 4: 检查器测试

**目标：** 确保检查器本身正确工作，防止假绿

**文件：**
- 新建：`tests/harnessChecks.test.ts`

**测试用例：**
1. 合法代码 → 无违规
2. 四种 fs 导入形式（命名导入、别名导入、namespace import、require）→ 检测到违规
3. Worker 数据库导入 → 检测到违规
4. 精确白名单匹配 → 跳过已知违规
5. 过期白名单 → 报错
6. 零文件扫描 → 退出码 1

**实现：**
- `harness/checks.js` 导出 `runChecks()` 函数
- 测试中使用临时目录与临时 tsconfig，不依赖 cwd 或扫描真实项目
- 按作用域检查扫描文件数：electron/、electron/workers/、src/ 分别必须命中

**完成标准：**
- [ ] `npm test` 通过（含新增测试）

---

## 验收标准

1. `node harness/checks.js` 运行无报错
2. `npm run verify` 运行无报错（约束检查 + 构建 + 测试）
3. `npm test` 前自动运行约束检查（pretest hook）
4. 约束检查失败时阻断测试
5. 白名单机制可用，失效白名单报错
6. 扫描文件数为 0 时退出码 1
7. CONSTRAINTS.md、SPEC.md、DECISIONS.md、harness/SPEC.md 已同步更新
8. 检查器测试通过（6 个用例）

## 风险

- AST 检查可能误报 — 通过白名单机制解决
- 白名单可能被滥用 — 规则限制：新代码不允许加入白名单，白名单变更需主人确认
- tsconfig 项目引用 — 必须读取 tsconfig.node.json 和 tsconfig.web.json，不能只读根 tsconfig

---

## 需要主人确认

1. ~~歌词滚动方式~~ — 已决定：选项 B（更新文档）
2. ~~检查项优先级~~ — 已决定：P0 现在实现，P1/P2 后续补充
3. ~~白名单机制~~ — 已决定：可以用，必须附带 pattern 和 reason
