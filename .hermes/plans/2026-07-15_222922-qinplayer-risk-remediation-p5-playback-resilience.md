# P5 — 播放失败、pending seek 与 Media Session latest-wins

> 前置：P4 已通过 Reviewer；P0 第 3、4、5、7 项已由主人确认。
> 目标：播放错误成为可见、可重试的低频状态；恢复 seek 不丢失/串曲；旧封面请求不能覆盖新歌。

## 现状证据

- `src/utils/AudioEngine.ts` 的 media `error` 事件只打印日志，没有公开回调。
- `src/hooks/useAudioSync.ts` 的 play rejection 只把 `isPlaying=false`；metadata 自动播放和 loop 重播失败也没有统一状态。
- `pendingSeekRef` 只在引擎不存在时写入，`onLoadedMetadata` 从不消费；引擎已创建但 metadata 未 ready 时也可能过早 seek。
- `updateMediaSession` 等封面 fetch 完成后才写 metadata；A→B 快切时 A 后完成可覆盖 B。
- `clearMediaSession` 不取消/失效 in-flight 请求，也不完整释放当前 Blob URL。

## 经 P0 确认后固定的行为

- 错误后停在当前歌曲，不自动跳过或无限重试。
- 用户看到通用中文错误，不显示异常堆栈或本地绝对路径。
- Retry 重新加载同一 Track，不调用 `playTrack`，不重复最近播放/播放次数，不清队列。
- Retry 恢复该 Track 最后一个有限、非负的 `currentTimeRef`；加载前从未成功播放时自然为 0。
- pending seek 与 track key 绑定，同一首多次 seek 只保留最后一个，metadata 后只消费一次。
- Media Session 文字 metadata 先更新，封面随后补齐；最终只允许最新 generation 提交。

## 范围

### 新增

- `src/components/PlaybackErrorBanner.tsx`
- `src/styles/playback-error.css`
- `tests/PlaybackErrorBanner.test.tsx`
- `tests/mediaSession.test.ts`

### 修改

- `src/utils/AudioEngine.ts`
- `src/stores/playerStore.ts`
- `src/hooks/useAudioSync.ts`
- `src/utils/mediaSession.ts`
- `src/App.tsx`
- `src/styles/global.css`
- `tests/AudioEngine.test.ts`
- `tests/playerStore.test.ts`
- `tests/useAudioSync.test.tsx`
- 受新低频 store 字段影响的组件测试 setup。
- `SPEC.md`、`harness/DECISIONS.md`、`harness/TEST_CONVENTIONS.md`
- 新建 `docs/devlog/devlog-YYYYMMDD-playback-resilience.md`

### 非目标

- 不自动识别/跳过坏歌，不删除曲库记录。
- 不新增持久化字段、IPC、数据库 schema 或依赖。
- 不重写播放队列、fade/EQ/audio graph。
- 不把高频 currentTime 放进 Zustand。
- 不做全局 Renderer Error Boundary；P6 处理。

## Task 1：先写播放错误状态测试

在 `tests/playerStore.test.ts` 先定义低频状态：

~~~ts
type PlaybackFailure = {
  kind: 'load' | 'play'
  trackKey: string
  code: 'media-error' | 'play-rejected'
} | null
~~~

Store 至少增加：

- `playbackFailure`。
- `playbackRetryVersion`。
- `setPlaybackFailure`、`clearPlaybackFailure`。
- `retryCurrentTrack`。

测试：

1. 只有当前 track key 可设置/清除错误。
2. 切歌清除旧错误。
3. Retry 清错、设播放意图、递增 version。
4. Retry 不改变 playlist、priorityQueue、resume anchor、detached cursor。
5. Retry 不触发 `songs:recordPlay` 或 `songs:updatePlayCount`。
6. playback flag 关闭时 retry 无副作用。

## Task 2：给 AudioEngine 增加结构化错误边界

先扩展 `tests/AudioEngine.test.ts`：

1. media error 通过公开 `onError` 回调返回 error code 和发生时的 source/generation。
2. 新 load 递增 source generation。
3. 主动切歌产生的 abort/旧 generation error 可由上层识别，不污染新源。
4. destroy 后不再提交有效错误。
5. 可控 fade 中发起 `loadWithFade(A)`，随后直接 `load(B)`；A 的 timer 完成后不得再写 src、调用 play 或覆盖 B。
6. 两个重叠 `loadWithFade` 只允许最新 operation commit。
7. Retry 的直接 load、destroy 和 playback flag 关闭都会失效旧 fade operation。

实现要求：

- 不把 `MediaError` 实例直接放进 Store。
- 回调载荷只含安全 code/source identity/generation。
- 保留现有 console 诊断，但 UI 文案不使用原始路径。
- 使用单调递增的 `loadOperationGeneration` 管理“谁有权提交 source”：
  1. 每个公开 `load()` 都先开始新 operation、递增 generation，再调用私有 `commitLoad(source, generation)`。
  2. `loadWithFade()` 只在入口开始一次新 operation；等待 fade 后先核对 generation，再调用同一个私有 `commitLoad`。
  3. `loadWithFade()` 禁止在 timer 后调用会再次递增 generation 的公开 `load()`，否则会自我失效或重新打开竞态。
  4. `commitLoad` 在写 `audio.src`、触发 `load/play` 之前都验证 generation；旧 operation 静默退出。
  5. Retry/直接 load 自然以新 generation 失效旧 fade；destroy、清空 Track、playback flag 关闭显式 invalidate。
- source generation/error identity 与 load operation generation 可以共用同一单调 token，也可以分开；无论实现形状，测试必须证明旧 fade 无提交权。
- 除上述竞态收口外，Web Audio、EQ、headroom、fade 时长与音量链行为不变。

## Task 3：先写 useAudioSync 错误/重试测试

在 `tests/useAudioSync.test.tsx` 增加：

1. 当前曲 media load error → `load` failure、`isPlaying=false`、pending autoplay 清空。
2. 直接 play、metadata 后 autoplay、loop replay 的非 Abort rejection → `play` failure。
3. `AbortError` 不显示错误。
4. 快速 A→B 后 A 的迟到 error/rejection 不能覆盖 B。
5. 当前 Track metadata/play 成功后清对应错误。
6. Retry version 变化时重新调用 P3 的同一 ID URL；不重复播放记账。
7. Retry 应用同 Track 最后位置；非法/其他 Track 的位置回到 0。
8. `loadWithFade` 失败后的 fallback 不能无限重复同一失败链。
9. pending `loadWithFade(A)` 后触发 Retry/直接 `load(B)`，推进 timer 后仍只加载 B，且 B 的错误/成功状态不被 A 覆盖。

实现时把所有失败入口汇聚到一个 `failPlayback(kind, identity)`，避免四处分叉语义。

## Task 4：修复 pending seek

先补测试：

1. 引擎不存在时的恢复进度先暂存，metadata 后精确 seek。
2. 引擎存在但 `duration<=0`/transition 未完成时也暂存。
3. 消费时 clamp 到 `[0,duration]`，同步 `currentTimeRef`。
4. 同曲连续 seek 只应用最后一次。
5. A 的 pending seek 不得应用到 B。
6. 第二次 metadata 不重复 seek。
7. playback 关闭、Track 清空或 unmount 清理 pending。
8. pending seek 应在 autoplay 前应用，避免先从 0 播放再跳。

实现：

- ref 改为 `{ trackKey: string; time: number } | null`。
- seek effect 在 engine 尚不可 seek 时保存并清 `seekTime`。
- loadedmetadata 验证 live track key，clamp、应用、清 ref，再处理 pending autoplay。

## Task 5：实现全壳层错误提示

`PlaybackErrorBanner`：

- 根级渲染一次，覆盖普通、歌词和 Mini 壳层。
- `role="alert"`，文案为“无法加载这首歌曲”或“播放失败”。
- 提供“重试”和“下一首”；下一首复用现有 `nextTrack`。
- Mini 采用不改变 `400×150` 窗口的紧凑 overlay；不得调整 BrowserWindow 尺寸。
- 重试中避免重复点击。

测试：

1. 无错误不渲染。
2. 两类错误文案正确且不含 path。
3. Retry/Next 各调用一次。
4. playback flag 关闭时不展示/不执行。
5. 当前歌曲切换后旧 banner 消失。

## Task 6：先写 Media Session deferred 测试

在 `tests/mediaSession.test.ts` 用可控 Promise 覆盖：

1. A 后请求、B 先完成，最终 metadata 只能是 B。
2. A 创建的过期 Blob 被 revoke，B 的有效 Blob 不被 A revoke。
3. pending A 后调用 clear，再完成 A，metadata 仍为 null。
4. 最新歌曲无封面时文字 metadata 正确、artwork 为空、旧 Blob 被 revoke。
5. fetch 失败仍保留最新歌曲文字 metadata。
6. `AbortError` 不记普通 warning。
7. mediaSession flag 关闭/unmount 时 actions 清理、generation 失效。

实现：

- 模块级 generation 和当前 AbortController。
- artwork loader 只返回新 Blob URL，不负责全局替换/revoke。
- update 开始时立即提交最新文字 metadata；封面完成后再次确认 generation。
- 过期请求只 revoke 自己创建的 URL。
- 最新请求接管 Blob 后再 revoke 前一有效 Blob。
- `clearMediaSession` 递增 generation、abort、metadata=null、revoke 并清引用。
- action handler 提供对称 unregister，flag 关闭时执行。

## 自动验收

~~~powershell
npx vitest run tests/AudioEngine.test.ts tests/playerStore.test.ts tests/useAudioSync.test.tsx tests/PlaybackErrorBanner.test.tsx tests/mediaSession.test.ts
npx tsc --noEmit
node harness/checks.js
npm test -- --reporter=dot
npm run build
git diff --check
~~~

## 真实 Electron 验收

1. 用隔离曲库播放后移走当前文件：显示错误、不崩溃、不自动跳歌。
2. 恢复文件后 Retry：同曲从最后有效位置恢复，队列和记账不重复。
3. 模拟不可播放/损坏音频，Retry 可再次失败但不会循环。
4. 启动恢复到非 0 进度；快速切 A→B，A 的 seek 不落到 B。
5. 快速 A→B，Windows 媒体面板最终只有 B；清空/关闭 mediaSession 后旧封面不回来。
6. 普通、歌词、Mini 都能看到并操作错误提示，Mini 尺寸不变。

## 文档闭环

- `SPEC.md`：记录播放失败可见/可重试、pending seek 与 Media Session latest-wins 的当前行为。
- `harness/DECISIONS.md`：记录不自动跳过、Retry 不记账、seek 顺序和 metadata 两阶段更新。
- `harness/TEST_CONVENTIONS.md`：异步竞态必须用 deferred Promise 覆盖 latest-wins/stale result。
- devlog：自动和 Windows 媒体面板验证分开报告。

## Reviewer 阻断清单

- 错误仍只 console.log。
- Retry 调 `playTrack` 导致重复记账/清队列。
- `loadWithFade` 的迟到 timer 可以覆盖更新的直接 load/Retry。
- `loadWithFade` 在 fade 后调用公开 `load`，导致 generation 自我失效或再次递增。
- 旧 Track 错误或 seek 可污染新 Track。
- pending seek 在 autoplay 后才消费。
- Media Session 只 abort 但没有 generation，或过期请求 revoke 当前有效 Blob。
- 原始 path/exception 暴露到 UI。
- 错误 UI 改变 Mini 窗口几何。

## 回滚

- AudioEngine callback、Store 字段、useAudioSync、Banner 和测试作为同一垂直切片回滚。
- Media Session generation 可独立回滚，但不得留下 update/clear 接口半迁移。
- 无数据库/IPC/schema 数据回滚。
- 回滚后回到 P4 已审状态，不进入 P6。
