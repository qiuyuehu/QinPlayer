# Devlog — 2026-07-12 待播队列与歌曲菜单

## 实施

- 新增会话内 `priorityQueue`、恢复锚点和已消费 ID；手动播放/切换来源清理，自动播放保持 FIFO。
- 自然结束在 loop 重播前优先消费待播或恢复来源。
- SongList 菜单的“添加到接下来播放”写入 priorityQueue，并抽出公共菜单 Hook。
- 主队列与 Mini 队列分为“接下来”和“播放列表”；待播项可单独移除，清空后续调用 store 原子动作。

## 验证

- `npm run verify` 通过：Harness、生产构建、48 个测试文件、442 个用例均为 0 failed。
- 真实 Electron 下的循环、随机、恢复锚点、三处右键菜单和 `400×150` Mini 布局待主人验收。
