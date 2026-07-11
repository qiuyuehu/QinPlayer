# QinPlayer 性能基线 — 2026-07-11

## 环境

- 机器：`DESKTOP-1VTASEP`
- 系统：Windows NT 10.0.22621.0
- CPU：AMD64 Family 25 Model 68，16 logical processors
- Electron：31；React：18；当前提交：`1ab06fe`
- 歌曲库：42 首；数据库：`%APPDATA%/QinPlayer/qinplayer.db`
- 工作树隔离：仅保留用户已有的 `tests/MiniPlayer.test.tsx` 置顶 API 测试改动；本任务不覆盖该 diff。

## Before 基线

| 指标 | Before | 测量状态 | After |
|---|---:|---|---:|
| 全量质量门 | 30 files / 284 tests | `npm run verify` 全绿 | 34 files / 317 tests，0 failed；生产构建在 313 tests 时通过 |
| Renderer entry raw | 467,024 bytes | clean production build 后文件大小 | 472,481 bytes |
| Renderer entry gzip | 102,630 bytes | 对同一 entry 以 gzip optimal 计算 | 103,552 bytes |
| Paused RAF callbacks | 持续调度；精确计数待 Task 2 可控 RAF 测试 | 三组件源码均无 active gate | 0 个已调度 callback |
| Active RAF loops | App 模式互斥，通常最多 1 条 | 静态调用路径确认 | 最多 1 条；50 次启停后 0 条残留 |
| Document drag listener | 每次拖拽 1 组，共 mousemove/mouseup 各 1；异常卸载无统一 cleanup | 静态生命周期确认 | 20 轮 add/remove 各 20 组，0 残留 |
| ContextMenu delayed listener | timeout 未保存；timeout 前卸载后仍会新增 2 个 listener | 静态生命周期确认 | 50 轮后 0 timer；25 轮实际注册均已清理 |
| MiniPlayer default view playlist commits | 订阅整个 playlist；10 次更新的 Profiler 精确计数待 Task 3 测试 | selector 静态确认 | default 下 50 次更新为 0 commit；queue 实时更新 |
| 无关 player state 的 settings 写入 | debounce 后写 volume/playMode/lastTrackId 各 1 次 | store subscribe 静态确认；Task 4 测试补计数 | 0 次；20 次 volume burst 最终仅写 1 次 |
| `songs:getAll` 场景调用 | 3 次：恢复、LocalMusic、Albums | lastTrackId 存在且三条调用路径成立 | 不优化 |
| `songs:getAll` payload | 18,635 bytes | Electron IPC 返回值 UTF-8 JSON | 未改源码；after 未复测 |
| `songs:getAll` IPC median / p95 | 0.60ms / 0.90ms | 隐藏 Electron，20 个计时样本（5 次 warmup 后） | 未改源码；after 未复测 |
| SQLite query median / p95 | 0.103ms / 0.168ms | Python sqlite3 readonly，20 个计时样本 | 未改源码；after 未复测 |
| 1000+ track row hotspot | 当前仅 42 首，门槛样本不成立 | 不以 JSDOM 用时替代 Profiler | 不优化 |

## 条件任务结论

### Task 5：songs 快照仓库

**跳过源码修改。** 场景确有重复请求，但 IPC 中位仅 0.60ms、payload 仅 18,635 bytes；`median >= 8ms` 与 `payload >= 1MB` 均未达到。缓存的一致性复杂度高于当前收益。

### Task 6：React.memo

**跳过源码修改。** 当前歌曲库只有 42 首，无法满足“1000+ tracks、commit p95 >16ms、row render 为主因”三项联合门槛；不得用 JSDOM 用时或“项目 memo 少”代替证据。

## 测量说明

- Electron IPC 基准走真实 `ipcRenderer.invoke → ipcMain.handle → better-sqlite3 → structured clone`，临时脚本位于 `C:\tmp`，测量后已删除，未进入项目 diff。
- Node 直接加载 `better-sqlite3` 因 Electron ABI 125 与 Node ABI 137 不兼容而失败；未重编译依赖。SQLite 独立查询改用 Python 标准库只读连接，并单独标注，未冒充 IPC 端到端时延。
- RAF、listener、Profiler commit 和 settings write 的 after 数字来自永久 Vitest 回归；JSDOM 只用于生命周期计数，不作为耗时基准。
- after 隐藏 Electron IPC 复测因工具审批额度门禁被拒绝；临时脚本已删除。Task 5 未修改该调用路径，因此报告保留 before 原始样本，不把它伪装成 after 新测量。
- 本轮未改 `React.lazy`、`AudioEngine`、数据库 schema、`currentTimeRef` 方案或 `useAudioSync` effect 边界；播放中每 5 秒保存 `lastCurrentTime` 的安全网保留并有回归测试。

## Lifecycle Smoke

- document drag：连续 20 次重启并取消，`mousemove`/`mouseup` 各注册 20、移除 20。
- ContextMenu：连续挂载卸载 50 次，覆盖 timeout 前后两种路径，最终 timer 为 0。
- MiniPlayer：default/queue 往返并更新 playlist 50 次，default 更新保持 0 commit。
- RAF：连续 active true/false 50 次，每次最多 1 个 callback，最终为 0。

真实 Electron 中的 CPU、视觉拖拽与重启恢复仍需主人按任务包手动步骤确认。
