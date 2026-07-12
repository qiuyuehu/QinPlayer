# Devlog — 2026-07-12 均衡器修复

## 实施

- 将 AudioEngine 的稀疏 `_pendingEqGains` 替换为始终为 10 段的 `_currentEqGains`；单段和批量入口均拒绝 NaN、Infinity、越界、错误索引或错误长度。
- `eq:save` 改为严格校验并返回成功/失败结果，非法输入不会写入 SQLite。
- `applyPreset` 改为单次 `setAllEqGains`，不再经过 10 个中间状态。
- Web Audio 信号链拆为 `source → EQ → eqHeadroomGain → fadeGain → volumeGain → destination`；淡入淡出不再覆盖用户音量。
- 新增 256 点对数采样的 EQ headroom 计算；平坦响应保持 1，正增益峰值会平滑降低 `eqHeadroomGain`。

## 验证

- TDD 红灯：完整状态、非法 gains、IPC 严格校验、预设原子提交、增益职责拆分和 headroom 均在实现前失败。
- 定向测试：4 个文件、18 个用例通过。
- `npx tsc --noEmit` 通过。
- 全量 `npm run verify` 通过：Harness、生产构建、48 个测试文件、422 个用例均为 0 failed。

## 待主人验证

- 同音量下比较 EQ 旁路与 10 段 0dB。
- 逐一 A/B 五个预设，检查削波、发闷、发尖和音量跳变。
- fade 切歌后确认用户音量保持；首次播放前调单段、连续拖动、重置和重启恢复均正常。
