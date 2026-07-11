# Devlog — 2026-07-11 性能优化

## 目标

- 以固定基线消除暂停 RAF、全局 listener 泄漏风险、MiniPlayer 无关提交和播放器设置写放大。
- 仅在真实门槛成立时引入歌曲快照或 React.memo。
- 保留播放、拖拽、歌词点击、队列、状态恢复和 5 秒进度安全网。

## 实现

1. 新增 `useDocumentMouseDrag`，统一 PlayerBar、Lyrics、MiniPlayer 的 document listener 注册、重启、取消和卸载清理；ContextMenu 保存并清理延迟注册 timer。
2. 新增 `useRafLoop`，三个播放器仅在可见且播放或拖拽时运行；暂停状态通过一次性同步更新 duration、seek 和歌词索引。
3. 歌词行点击与暂停拖拽立即更新进度 DOM 和 active 行，再提交 seek。
4. 新增 `MiniQueueViewContainer`，只有 queue 视图订阅 playlist；`MiniQueueView` 保持纯 props 组件。
5. playerStore 比较 previous state，只把变化的 `volume`、`playMode`、`lastTrackId` 放入 dirty map；首项创建 500ms timer，后续更新不延后截止时间。
6. restore 使用同步 suppress guard；单键写失败输出包含键名的中文错误；5 秒 `lastCurrentTime` interval 仅响应 isPlaying 边沿。

## 条件任务

- songs snapshot：跳过。42 首歌曲的真实 IPC median/p95 为 0.60/0.90ms，payload 18,635 bytes，未达到 8ms 或 1MB 门槛。
- React.memo：跳过。没有 1000+ tracks、commit p95 >16ms 和 row hotspot 三项联合证据。
- React.lazy、AudioEngine、数据库 schema、currentTimeRef 与 useAudioSync effect 边界均未修改。

## 测量结果

- 暂停空闲 RAF：持续调度降为 0；50 次启停后 0 callback 残留。
- document drag：20 轮 mousemove/mouseup add/remove 各 20 组。
- ContextMenu：50 轮 timeout 前后卸载，最终 0 timer。
- MiniPlayer：default 下 50 次 playlist 更新为 0 commit；queue 内容实时更新。
- settings：无关状态 0 写；20 次 volume burst 只写最终值 1 次；restore 0 回写。
- Renderer：raw 467,024 → 472,481 bytes；gzip 102,630 → 103,552 bytes。增加来自生命周期 Hook、connector 与错误处理，未以包体积换取缓存或 memo 试验。
- after 隐藏 Electron IPC 复测因工具审批额度门禁被拒绝；临时脚本已删除，未伪造 after 数据。

## 修改文件

- 生产代码：`ContextMenu`、`PlayerBar`、`Lyrics`、`MiniPlayer`、`playerStore`。
- 新增：`useDocumentMouseDrag`、`useRafLoop`、`MiniQueueViewContainer`。
- 测试：新增 Hook、ContextMenu、Lyrics 性能测试；扩展 PlayerBar、MiniPlayer、playerStore 回归与压力 smoke。
- 文档：性能报告、SPEC、DECISIONS、本 devlog。

## 验证

- Task 1：5 files / 37 tests；TypeScript 通过。
- Task 2：4 files / 39 tests；TypeScript 通过。
- Task 3：2 files / 26 tests。
- Task 4：2 files / 40 tests。
- Lifecycle smoke：4 files / 36 tests。
- 完整 `npm run verify` 在压力测试加入前通过：Harness、main/preload/renderer 生产构建、34 files / 313 tests，0 failed。
- 压力与失败隔离回归加入后：Harness、TypeScript、34 files / 317 tests 通过；第二次生产构建因工具审批额度门禁未能重跑。
- `git diff --check`：通过，仅存在仓库既有行尾转换提示。

## 审查

- App 的普通、歌词、迷你壳层互斥，任意时刻最多挂载一个播放器进度 RAF。
- dirty map 在 flush 前复制并清空，单键失败不阻塞其他键；后续真实变化可再次入队。
- 未覆盖用户原有的 `tests/MiniPlayer.test.tsx` 置顶 API 改动。
- 未自动 commit。

## 待主人确认

- 真实 Electron 中播放 10 秒后暂停的 CPU/scripting 降幅。
- 三界面暂停拖拽、恢复播放、拖拽中切页的视觉与控制台行为。
- 连续调音量、切模式后重启持久化，以及播放超过 10 秒后直接退出的进度恢复。
