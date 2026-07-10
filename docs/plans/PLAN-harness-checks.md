# Harness 补全方案（checks.js + npm verify）

> 创建：2026-07-10
> 状态：待确认

---

## 背景

QinPlayer 的 `harness/` 只有四份规范文档（CONSTRAINTS.md、DECISIONS.md、TEST_CONVENTIONS.md、SPEC.md），没有可执行的约束检查脚本。当前"Harness 约束检查"只能人工核对，无法自动化阻断违规。

## 问题

1. **缺少自动约束检查** — 约束文档定义了永久性规则，但没有代码强制执行
2. **历史矛盾** — CONSTRAINTS.md 要求歌词滚动用 `transform: translateY()`，但实际调用 `scrollTo()`（主人决定：更新文档，保留当前实现）
3. **runner.js 不必要** — `npm test` 已由 Vitest 充当统一测试入口，不需要重复造 runner

## 方案

新增 `harness/checks.js`，在测试之前自动检查明确的永久约束违规。使用 TypeScript Compiler API 做 AST 检查，不增加依赖。

---

## 当前代码检查结果

| 检查项 | 现状 | 处理方式 |
|--------|------|----------|
| 主进程同步 I/O | 3 处 `existsSync`（main.ts 调试用，window.ts 清理 WAL 文件） | 白名单标记 |
| Worker 写 SQLite | 无违规 | 检查项保留，预防未来误用 |
| currentTime 放 Zustand | 无违规（用 ref + RAF） | 检查项保留，预防未来误用 |
| 裸字符串 IPC | 无违规 | 检查项保留，预防未来误用 |
| any 类型 | 2 处 `as any`（AudioEngine.ts 的 setSinkId，合理使用） | 白名单标记 |

---

## 改动范围

| 文件 | 改动 |
|------|------|
| `harness/checks.js` | **新建**，约束检查脚本 |
| `harness/checks-whitelist.json` | **新建**，历史遗留问题白名单 |
| `package.json` | 新增 `verify` 脚本（`checks.js && npm test`） |
| `harness/CONSTRAINTS.md` | 更新歌词滚动方式（删除 scrollTo 禁令） |

---

## Task 1: 新建 harness/checks.js

**目标：** 自动检查明确的永久约束违规

**文件格式：** JavaScript（Node.js 脚本，不需要编译，直接 `node harness/checks.js` 运行）

**检查项（AST 级别，P0 必须实现）：**

1. **主进程禁止同步 I/O** — 检查 `electron/` 目录下是否有 `readdirSync`、`statSync`、`readFileSync`、`writeFileSync`、`existsSync` 调用
2. **Worker 禁止写 SQLite** — 检查 `electron/workers/` 目录下是否有 `database.exec`、`database.run`、`database.prepare().run` 调用

**检查项（AST 级别，P1 后续补充）：**

3. **currentTime 不放 Zustand** — 检查 `src/stores/` 目录下是否有 `currentTime` 字段定义

**检查项（文本级别，P2 后续补充）：**

4. **禁止裸字符串 IPC** — 检查 `src/` 下是否有 `ipcRenderer.invoke('` 但不在 `src/types/ipc.ts` 定义的通道名
5. **禁止 any 类型** — 检查 `src/` 和 `electron/` 下是否有 `: any` 或 `as any`（排除注释和测试）

**白名单机制：**

对历史遗留问题提供 `harness/checks-whitelist.json`（不需要 gitignore，提交到仓库），格式：
```json
{
  "no-sync-io": [
    { "file": "electron/main.ts", "line": 159, "reason": "开发调试用，检查图标路径" },
    { "file": "electron/ipc/window.ts", "line": 132, "reason": "清理 WAL 文件，数据库异常保护" },
    { "file": "electron/ipc/window.ts", "line": 133, "reason": "清理 WAL 文件，数据库异常保护" }
  ],
  "no-any": [
    { "file": "src/utils/AudioEngine.ts", "line": 277, "reason": "setSinkId 扩展方法，类型定义不完整" },
    { "file": "src/utils/AudioEngine.ts", "line": 281, "reason": "setSinkId 扩展方法，类型定义不完整" }
  ]
}
```

白名单规则：
- 每条必须附带 `reason` 说明"为什么暂时不修"
- 新代码不允许加入白名单（必须修复）
- 白名单变更需要主人确认

**实现要点：**
- 使用 `ts.createProgram()` 读取项目 tsconfig，获取 AST
- 遍历源文件，按检查规则逐项扫描
- 违规输出：文件路径、行号、违规内容、违反的约束条目
- 退出码：0 表示全部通过，1 表示有违规
- 白名单检查：跳过白名单中标记的文件:行号

**完成标准：**
- [ ] `node harness/checks.js` 运行无报错
- [ ] 当前代码通过（白名单标记已知违规）

---

## Task 2: npm verify 脚本

**目标：** 统一验证入口，先检查约束再跑测试

**package.json 新增脚本：**
```json
{
  "scripts": {
    "verify": "node harness/checks.js && npm test"
  }
}
```

**完成标准：**
- [ ] `npm verify` 运行无报错
- [ ] 约束检查失败时阻断测试（退出码非 0）

---

## Task 3: 更新约束文档

**主人决定：选项 B（更新文档，保留当前实现）**

CONSTRAINTS.md 第 71 行：
```
- 歌词滚动禁止 `top`/`scrollTop`，必须用 `transform: translateY()` + `will-change: transform`
```

改为：
```
- 歌词滚动使用 `scrollTo()` + `behavior: 'smooth'`，隐藏原生滚动条
```

---

## 验收标准

1. `node harness/checks.js` 运行无报错
2. `npm verify` 运行无报错（约束检查 + 测试）
3. 约束检查失败时阻断测试
4. 白名单机制可用
5. CONSTRAINTS.md 歌词滚动方式已更新

## 风险

- AST 检查可能误报（如注释中的代码示例）— 通过白名单机制解决
- 白名单可能被滥用 — 规则限制：新代码不允许加入白名单，白名单变更需主人确认

---

## 需要主人确认

1. ~~歌词滚动方式~~ — 已决定：选项 B（更新文档）
2. ~~检查项优先级~~ — 已决定：P0 现在实现，P1/P2 后续补充
3. ~~白名单机制~~ — 已决定：可以用，必须附带注释
