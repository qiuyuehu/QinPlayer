# 任务包 C2：均衡器修复

> 来源：C1 诊断报告 `docs/diagnostics/EQ-20260712.md`
> 约束：每个修复方向独立验证，先写失败测试再改源码；不改 Q 值；不改预设曲线（除非 headroom 后仍需调整）

## 入场条件

- C1 诊断报告已完成并确认
- `npm run verify` 基线全绿
- 读完 `docs/diagnostics/EQ-20260712.md`
- 读完 `docs/plans/PLAN-sort-closebehavior-eq.md` 第 9 节

## 修复方向（按优先级排序）

### C2.1 完整 EQ 状态 + IPC 校验

**问题**：`_pendingEqGains` 是稀疏数组，单段 `setEqGain(3, 5)` 创建长度 4 的数组，索引 0-2 是 holes（值为 `undefined`）。IPC 不校验 NaN、Infinity、越界值。

**改动**：

1. `src/utils/AudioEngine.ts`：
   - `_pendingEqGains: number[]` 替换为 `_currentEqGains: number[]`，初始长度 10 全 0
   - `setEqGain(index, value)`：校验 index ∈ [0,9]、value 为有限数 ∈ [-12,12]，更新 `_currentEqGains[index]`，同步到 filter
   - `setAllEqGains(gains)`：校验长度=10、每个值有限且在范围内，原子替换 `_currentEqGains`，逐段同步到 filter
   - WebAudio 初始化时统一应用完整 `_currentEqGains`，不遍历稀疏数组
   - `_pendingEqGains` 引用全部替换为 `_currentEqGains`

2. `electron/ipc/eq.ts`：
   - `eq:save` handler：校验输入为长度 10 的数组，每个元素为有限数 ∈ [-12,12]，否则拒绝并返回错误

3. `src/stores/eqStore.ts`：
   - `setGain`：校验 value 为有限数且在范围内，非有限值忽略
   - `applyPreset`：改为单次 `setAllEqGains(preset.gains)` 调用（见 C2.2）

**测试**：
- `setEqGain(3, 5)` 后 `_currentEqGains` 长度始终为 10，无 holes
- `setEqGain(3, NaN)` / `setEqGain(3, 99)` / `setEqGain(-1, 5)` / `setEqGain(10, 5)` 均被拒绝
- `setAllEqGains([NaN, ...])` / 长度≠10 均被拒绝
- `eq:save` 接受合法数据，拒绝非法数据

### C2.2 applyPreset 原子提交

**问题**：`applyPreset('rock')` 逐段调用 `setEqGain(0..9)` 共 10 次，产生 10 个中间状态。

**改动**：

`src/stores/eqStore.ts` 的 `applyPreset`：
```ts
applyPreset: (presetName) => {
  const preset = EQ_PRESETS.find(p => p.name === presetName)
  if (!preset) return
  const newGains = [...preset.gains]
  set({ gains: newGains, activePreset: presetName })
  // 单次原子提交
  getAudioEngine().setAllEqGains(newGains)
  debouncedSave(newGains)
}
```

**测试**：
- `applyPreset('rock')` 后 `setAllEqGains` 只被调用 1 次（不是 10 次 `setEqGain`）
- gains 状态一次性更新为预设值

### C2.3 拆分 GainNode（fade/volume 解耦）

**问题**：同一个 `gainNode` 同时承担用户音量和 fade 自动化。`fadeIn()` 默认 ramp 到 1，覆盖用户设置的音量。

**改动**：

`src/utils/AudioEngine.ts` 信号链改为：
```
source → EQ filters → eqHeadroomGain → fadeGain → volumeGain → destination
```

- `volumeGain`：用户音量控制，`setVolume` 只写这个节点
- `fadeGain`：淡入淡出，`fadeIn()`/`fadeOut()` 只写这个节点（0↔1）
- `eqHeadroomGain`：EQ 补偿（C2.4），初始 1
- WebAudio 接入前的音量交接：`volumeGain.gain.setValueAtTime(currentVol, ...)` 替代原来的 `gainNode.gain.setValueAtTime`
- `fadeIn` 默认 ramp 到 1 但只写 `fadeGain`，不碰 `volumeGain`

**测试**：
- `setVolume(0.35)` 后 `fadeIn()` 执行，`volumeGain.gain.value` 仍为 0.35
- `fadeOut()` 后 `fadeGain.gain.value` 接近 0，`volumeGain.gain.value` 不变
- 接入 WebAudio 前后音量无断层

### C2.4 自动 headroom

**问题**：正增益预设理论峰值 > 1（低音增强 4.4 倍），无 headroom 补偿，可能输出削波。

**改动**：

1. 新建 `src/utils/eqResponse.ts`：
   - `calculateEqHeadroom(filters: BiquadFilterNode[], sampleRate: number): number`
   - 用 `getFrequencyResponse()` 在 20Hz ~ sampleRate/2×0.95 间取 256 个对数采样点
   - 计算级联 magnitude 峰值
   - 返回 `Math.min(1, 1 / peakMagnitude)`
   - flat 0dB 时 peak≤1，headroom=1，不无故衰减

2. `src/utils/AudioEngine.ts`：
   - 信号链加 `eqHeadroomGain` 节点（在 EQ filters 之后、fadeGain 之前）
   - 每次 gains 变化后调用 `calculateEqHeadroom` 更新 `eqHeadroomGain.gain`
   - 用短 `setTargetAtTime` 平滑更新，避免爆音

**测试**：
- flat 0dB 时 headroom = 1
- 低音增强预设 headroom < 1
- headroom 更新后 `eqHeadroomGain.gain.value` 为有限数

### C2.5 预设曲线调整（仅在 headroom 后仍需调整时）

**前提**：C2.4 headroom 实施后，实机验证仍发现削波或音色异常。

**改动**（条件性，不在本任务包默认范围内）：
- 把"全正增益"预设改为围绕 0dB 的 boost/cut 曲线
- 每轮只调整一组预设，记录前后数组和主人听感
- 不把"更响"判为"更好"

**本任务包不实施此项**，留给主人实机验证后决定。

## 改动文件

| 文件 | 改动 |
|------|------|
| `src/utils/AudioEngine.ts` | 替换 sparse pending、拆分 GainNode、加 headroom 节点 |
| `src/stores/eqStore.ts` | applyPreset 原子提交、setGain 校验 |
| `electron/ipc/eq.ts` | eq:save 校验 |
| `src/utils/eqResponse.ts` | **新建**：calculateEqHeadroom |
| `tests/AudioEngine.test.ts` | **新建**：完整 gains、fade/volume 解耦、headroom |
| `tests/eqStore.test.ts` | **新建**：applyPreset 原子性、setGain 校验 |
| `tests/eqIPC.test.ts` | **新建**：IPC 校验 |
| `tests/eqResponse.test.ts` | **新建**：headroom 计算 |

## 约束条件

1. 不改 Q 值（保留 1.4）
2. 不改预设增益曲线（除非 C2.5 获批）
3. 每个修复方向独立验证，先写失败测试再改源码
4. flat 0dB 不被无故衰减（headroom=1）
5. 用户音量和 fade 互不覆盖
6. WebAudio 接入前后音量无断层
7. 不新增 npm 依赖

## 验收

```bash
npx vitest run tests/AudioEngine.test.ts tests/eqStore.test.ts tests/eqIPC.test.ts tests/eqResponse.test.ts
npx tsc --noEmit
npm run verify
```

### 手动验证（主人）

1. flat 0dB 与 EQ 关闭旁路同响度同音色
2. 五个预设逐一 A/B，检查削波、发闷、发尖
3. fade 开关切歌后用户音量保持
4. 首次播放前调单段后播放，无报错/失真
5. 连续拖动滑块、重置、重启恢复均正常

## 完成后

- 更新 SPEC.md
- 写 devlog
- 等主人实机验证后 commit
