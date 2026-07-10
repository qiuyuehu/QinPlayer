# QinPlayer Harness 工程规范

> 创建：2026-07-01

---

## 目录结构

```
harness/
├── CONSTRAINTS.md        ← 代码约束（怎么写）
├── DECISIONS.md          ← 决策记录（为什么这么写）
├── TEST_CONVENTIONS.md   ← 测试规范（怎么测）
├── SPEC.md               ← 本文件（Harness 工程规范）
├── checks.js             ← 自动约束检查脚本
└── checks-whitelist.json ← 历史违规精确白名单
```

---

## 自动门禁

- `node harness/checks.js`：单独运行 AST 约束检查
- `npm test`：通过 `pretest` 自动先运行约束检查，再执行 Vitest
- `npm run verify`：依次运行约束检查、生产构建和全量测试

---

## 约束先行

写代码前先写约束。约束必须：
- 永久性 — 不针对特定 bug
- 可执行 — 每条都能被检查或测试
- 精简 — 只写真正重要的

---

## 决策留痕

必须记录的决策：
- 技术选型变更
- 架构调整
- UI 规范变更
- 性能优化方案
- Bug 修复的多方案选择

---

## 测试驱动

- 先写测试，再写代码
- 每个 bug 修复对应一个测试
- 工具函数必须有单元测试
- UI 组件主人手动验证

---

## 参考

- 项目 SPEC：`../SPEC.md`
- 约束文档：`CONSTRAINTS.md`
- 决策记录：`DECISIONS.md`
- 测试规范：`TEST_CONVENTIONS.md`

---

*Harness 的目标：让 AI agent 不只是"写代码"，而是"写好代码"。*
