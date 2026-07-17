# 2026-07-17 播放韧性

## 目标

- 将媒体加载/播放失败变为可见、可重试的低频状态。
- 收口 AudioEngine source、pending seek 和 Media Session 的迟到异步提交。
- 保持队列、播放记账、数据库、IPC、Mini 窗口尺寸和高频时间状态不变。

## 实现

- `playerStore` 增加结构化 `playbackFailure` 和 Retry version；Retry 只重载当前 Track。
- `AudioEngine` 用单调 operation generation 管理直接 load、fade load、Retry、invalidate 和 destroy；公开安全的 source/error identity。
- `useAudioSync` 汇聚 load/play 失败，按 active Track 隔离迟到事件，并把 pending seek 在 metadata 后、autoplay 前按 Track 消费。
- 根级 `PlaybackErrorBanner` 覆盖普通、歌词和 Mini 壳层，提供“重试”和“下一首”，不改变 Mini 窗口几何。
- Media Session 先提交文字，再按 generation 补封面；旧请求只 revoke 自己创建的 Blob，关闭功能或卸载时清 metadata 与 action handlers。

## 定向验证

- P5 目标测试：5 files / 156 tests passed。
- `npx tsc --noEmit`：通过。

## 完整自动门禁

- Harness：`electron=24, workers=2, src=60`，通过。
- 全量：69 files / 826 tests passed。首次全量运行出现 1 个 `MiniPlayer` 5 秒超时；定向复跑 21/21 通过，随后完整复跑 826/826 通过。
- `npm run build`：main、两个 preload 和 Renderer bundle 均构建成功。
- `git diff --check`：无空白错误，仅有工作树既有 LF/CRLF 转换提示。

## 首轮独立 Review

- 结论：Blocker 0、Important 4、Suggestion 1，gate 未通过。
- 修复 Banner 本地 `retrying` 状态未随失败生命周期复位的问题，重复失败后可再次 Retry。
- 为 `AudioEngine` 增加 pending source identity，只有取得 generation 权限的 `loadstart` 才激活 identity，隔离切源窗口中的旧 metadata/error。
- `useAudioSync` 的 play 成功/失败、metadata autoplay、循环与 fade 完成均校验完整 load owner；切换 Track 同时清除旧 pending seek。
- Media Session action handler 改为逐项容错注册，单个系统不支持的 action 不再阻断其余 handler 和 cleanup。
- 以上问题先由 8 个失败回归测试复现，再修复为全绿。

## 独立复审

- 同一 Reviewer 定向复跑 P5 目标测试：5 files / 156 tests passed。
- 结论：Blocker 0、Important 0、Suggestion 0；首轮全部问题关闭，Review gate PASS。

## 隔离 Electron smoke

- 使用工作区内临时 `userData` 和真实 Electron ABI SQLite，注入一条不存在的音频并恢复到 37 秒；结束后一次性入口和 profile 已删除。
- 普通、歌词、Mini 三个壳层均显示 `role="alert"` 的“无法加载这首歌曲”，且 Retry 后 Renderer 保持存活。
- Retry 后 `play_count=0`、`recently_played=0`，证明未重复播放记账。
- Mini 生产代码请求 `400×150`；125% DPI 下 Electron `getBounds()` 返回 `400×151`，为原生 1 px 取整，错误 overlay 未修改 BrowserWindow 几何。

## 未自动化覆盖

- Windows 原生媒体面板快速 A→B 的最终视觉/系统显示未自动操作，Media Session generation 与 Blob 所有权由 deferred 单元测试覆盖。
