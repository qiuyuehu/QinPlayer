# Hermes → Claude Code 迁移方案

> 创建：2026-07-06
> 状态：待确认

---

## 目标

把 Hermes work profile 的数据迁移到 Claude Code，保留核心能力：
1. 长记忆（MEMORY.md）
2. 工作流约束（AGENTS.md）
3. Skills（可复用工作流）
4. 权限控制（approvals.mode）

---

## 迁移映射

| Hermes | Claude Code | 说明 |
|--------|-------------|------|
| `~/.hermes/profiles/work/AGENTS.md` | `CLAUDE.md` | 项目指令，每次 session 加载 |
| `~/.hermes/profiles/work/MEMORY.md` | `~/.claude/projects/<project>/memory/MEMORY.md` | 长记忆，前 200 行自动加载 |
| `skills/` 目录 | `.claude/rules/*.md` | 按路径触发的规则文件 |
| `approvals.mode: manual` | `settings.json permissions` | 权限控制 |
| `destructive_slash_confirm: true` | `hooks PreToolUse` | 硬拦截危险命令 |

---

## 迁移步骤

### 第一步：创建 CLAUDE.md

从 AGENTS.md 迁移核心约束：

```markdown
# 衾衾 Harness 约束

## 硬约束

- 危险命令必须主人确认
- 破坏性操作二次确认

## 工作流约束

### 1. 破坏性操作必须确认
- `git reset --hard`、`rm -rf`、删除文件前必须问主人
- 不能假设"回滚"就是"回到远程仓库"
- 问清楚回滚到哪个版本

### 2. 写方案前必须先读代码
- 选择器、类名、变量名必须先 grep 确认
- 不能凭记忆写方案
- 读取相关文件后再写方案

### 3. 超过 5 行改动必须写方案
- 不能直接改代码（除非主人说"直接改"）
- 方案写到项目 docs/plans/ 目录
- 等主人确认后再执行

### 4. 不要在主人没确认的情况下执行
- 方案写完等主人确认
- 回滚前问清楚回滚到哪里
- 不要假设主人的意图

## 常用命令

- 测试：`npm test`
- 类型检查：`npx tsc --noEmit`
- 构建：`npm run build`

## 禁止事项

- 不要修改 .env、secrets、lockfiles
- 不要运行 destructive Git 命令 without confirmation
```

### 第二步：迁移 MEMORY.md

把 Hermes 的 MEMORY.md 内容复制到 Claude Code 的 memory 目录：

```bash
# 创建 memory 目录
mkdir -p ~/.claude/projects/<project>/memory/

# 复制 MEMORY.md
cp ~/.hermes/profiles/work/MEMORY.md ~/.claude/projects/<project>/memory/MEMORY.md
```

**注意**：Claude Code 的 MEMORY.md 前 200 行或前 25KB 会在每次对话开始时加载。

### 第三步：迁移 Skills 到 .claude/rules/

把 Hermes 的 skills 转换成 Claude Code 的 rules 文件：

```bash
# 创建 rules 目录
mkdir -p .claude/rules/

# 把常用 skills 转换成 rules
# 例如：writing-plans → .claude/rules/writing-plans.md
# 例如：requesting-code-review → .claude/rules/code-review.md
```

**注意**：Claude Code 的 rules 支持 paths frontmatter，可以按路径触发。

### 第四步：配置权限

编辑 `~/.claude/settings.json`：

```json
{
  "permissions": {
    "defaultMode": "default",
    "allow": [
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(rg *)",
      "Bash(ls *)",
      "Bash(pwd)",
      "Bash(cat *)"
    ],
    "ask": [
      "Bash(git push *)",
      "Bash(git commit *)",
      "Bash(npm install *)",
      "Bash(curl *)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git reset --hard *)",
      "Bash(git clean -fd *)",
      "Read(./.env)",
      "Read(./.env.*)"
    ]
  }
}
```

### 第五步：配置 Hooks（硬拦截）

编辑 `~/.claude/settings.json`，添加 hooks：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(rm -rf *)",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh",
            "args": []
          }
        ]
      }
    ]
  }
}
```

创建 hook 脚本 `.claude/hooks/block-rm.sh`：

```bash
#!/bin/bash
COMMAND=$(jq -r '.tool_input.command')

if echo "$COMMAND" | grep -q 'rm -rf'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Destructive command blocked by hook"
    }
  }'
else
  exit 0
fi
```

---

## 迁移清单

- [ ] 创建 CLAUDE.md（从 AGENTS.md 迁移）
- [ ] 迁移 MEMORY.md 到 Claude Code memory 目录
- [ ] 把常用 skills 转换成 .claude/rules/*.md
- [ ] 配置 settings.json 权限
- [ ] 配置 hooks 硬拦截
- [ ] 测试 Claude Code 是否正常工作

---

## 注意事项

1. **CLAUDE.md 不要超过 200 行** — 超过会占用更多上下文，降低遵守度
2. **MEMORY.md 前 200 行自动加载** — 重要信息放在前面
3. **rules 支持 paths frontmatter** — 可以按路径触发，减少上下文噪音
4. **hooks 是硬约束** — 比 CLAUDE.md 更可靠
5. **settings.json 优先级** — managed > command line > local > project > global

---

*方案就绪，等主人确认后执行。*
