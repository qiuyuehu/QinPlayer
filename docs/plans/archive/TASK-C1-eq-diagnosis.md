# 任务包 C1：均衡器诊断

> 来源：PLAN-sort-closebehavior-eq.md 批次 C1
> 约束：只诊断不修复；临时测试收工前必须删除；不改 Q 值、不改预设

## 入场条件

- 任务包 B 已完成并验证
- `npm run verify` 基线全绿
- 读完 `docs/plans/PLAN-sort-closebehavior-eq.md` 第 9 节（批次 C）

## 任务

### C1.1 临时诊断测试

创建 `tests/eqDiagnosis.temp.test.ts`，验证以下结构性假设：

1. **sparse pending**：首次播放前只调 `setEqGain(3, 5)`，检查 `_pendingEqGains` 是否出现 sparse/undefined
2. **IPC 校验**：`eq:save` 是否接受 NaN、Infinity、越界值、错误长度数组
3. **applyPreset 原子性**：`applyPreset('rock')` 是否逐段制造 10 个中间状态
4. **flat bypass**：EQ 开启但全 0dB 时，信号链与 EQ 关闭时的图连接是否一致
5. **fade/volume 耦合**：`fadeIn()` 默认回到 1 时，是否覆盖用户设置的音量
6. **预设峰值**：计算各预设的理论峰值增益（考虑 Q=1.4 的频段叠加）

### C1.2 诊断报告

创建 `docs/diagnostics/EQ-20260712.md`，记录：

- 每个假设的测试结果（已证实 / 已排除 / 需要实机验证）
- 相关源码位置（文件:行号）
- 建议的修复方向（但不实施）

### C1.3 收尾

- 删除 `tests/eqDiagnosis.temp.test.ts`
- 确认 `npm run verify` 仍然全绿
- 确认 `git status` 没有临时文件残留
- 把诊断报告交给主人，等待 C2 确认

## 不做的事

- 不改 Q 值
- 不改预设增益值
- 不改 AudioEngine 信号链
- 不改 eqStore
- 不创建正式测试（留给 C2）

## 验收

- 诊断报告存在且覆盖全部 6 个假设
- 每个假设有明确的"已证实/已排除/需实机"标记
- 临时测试已删除
- `npm run verify` 全绿
- 等主人确认后才进入 C2
