# QinPlayer 测量驱动性能优化实施方案

> **For Hermes:** 先建立基线，再按任务顺序实施；每项先写失败测试。禁止以“理论上更快”代替测量结果，不要自动提交 Git。
>
> 创建：2026-07-11
> 修订：2026-07-11（Codex 对照当前源码重写，并完成独立性能工程师视角自审）
> 状态：待主人确认

## 背景

原方案希望通过停止空闲 RAF、减少无效渲染、降低重复 IPC 与合并设置写入来改善 QinPlayer 的资源占用。但性能优化会同时触及播放进度、拖拽、歌词、迷你播放器、持久化与歌曲库一致性；如果没有基线和退出条件，很容易把正确性回归误当成“更快”。

本方案因此采用两类工作：已经能从生命周期和订阅关系证明的问题，按 TDD 修复；缓存、memo、分包等收益不确定的项目，先测量，达到门槛才实施。

## 当前状态

- `PlayerBar`、`MiniPlayer`、`Lyrics` 各自在挂载期间持续运行进度 RAF；App 的三种显示模式互斥，通常只有一个循环处于挂载状态。
- 三处进度/音量拖拽直接注册 document listener，异常卸载前没有统一清理入口。
- `ContextMenu` 延迟注册全局关闭 listener，但 timeout 自身没有在卸载时清理。
- MiniPlayer 在非队列视图仍订阅完整 playlist 数组。
- `playerStore` 的设置保存订阅会被无关状态变化反复重置 debounce；播放进度的 5 秒周期保存仍是异常退出恢复安全网，必须保留。
- `SongList` 已使用 TanStack Virtual；现阶段没有证据支持全列表机械增加 `React.memo`。
- 最新 devlog 记录：动画任务在 270 个测试通过后补了第 271 个 StrictMode 回归测试，但最终全量复跑尚未完成；本任务的 Task 0 必须重新建立当前代码基线，不能沿用旧结果。
- 本次复核时 `git status --short` 仍有用户未提交的 `tests/MiniPlayer.test.tsx`，且本方案文件尚未跟踪。实施者必须以开工时的实际状态为准重新检查，不得覆盖或夹带这些改动。

## 审查结论

原方案混合了真实问题、未经测量的猜测和会损害正确性的“优化”。本版只预批准具有明确因果链的修改，其余项目必须通过门槛后才能进入源码。

| 原方案结论 | 审查发现 | 本版处理 |
|---|---|---|
| 三个页面的 RAF 暂停时一直运行 | 属实，但 App 三种模式互斥，通常只有一个循环挂载，不是三个同时跑 | 实施停止/恢复；按单个活跃循环测量收益 |
| “不能把 isPlaying 放 effect 依赖，否则不会重启” | 结论相反；循环停止后只改 ref 不会重新安排 RAF | effect/Hook 必须由 active 状态驱动，播放恢复时重新注册 |
| Lyrics 没有进度拖拽 | 错误；PlayerBar、MiniPlayer、Lyrics 三处都有进度拖拽 | 三处统一保留暂停拖拽预览 |
| 暂停后在 RAF callback 内不再 request 下一帧 | 停止后恢复播放没有触发点；暂停拖拽也可能不更新 | 提取可启停 RAF Hook，并为暂停状态做一次性同步 |
| “项目零 memo，所以收益高” | `React.memo` 数量不是性能指标；SongList 已虚拟化，只有可视行 | 先用 Profiler 证明热点，再只 memo 真正热点行 |
| 给四类列表全部 memo | style 对象、回调和 Set 变化可能使 memo 失效，比较成本可能更高 | 改为决策门槛，不预先承诺四类提取 |
| `songs:getAll` 做 5/15 秒 TTL 缓存 | 文案和代码 TTL 自相矛盾；扫描、清空、导入和并发请求会产生陈旧数据 | 先量 IPC 成本；达标后才实现带 generation/in-flight 的显式快照仓库 |
| 文件夹变化时 invalidate 即可 | 扫描期间逐首写库，用户可离开 LocalMusic；单一失效点不完整 | 若实施仓库，由 App 全局监听扫描事件失效，scan done 强制刷新 |
| MiniPlayer 默认视图订阅 playlist | 属实；默认/歌词视图不需要整个数组 | 条件挂载 connector，保留 MiniQueueView 为纯展示组件 |
| 所有低频页面 React.lazy | Electron 从本地磁盘加载；现有构建产物仅约 466KB raw / 102KB gzip，分包可能增加路由等待 | 本轮不实施；重建基线显著变大时另立计划 |
| playerStore 任意变化都重置 debounce | 属实；isPlaying、duration、seekTime 会推迟无关设置保存 | 比较 prev state，并按 dirty key 合并写入 |
| 删除 5 秒 currentTime interval | 会丢失播放中异常退出恢复；还可能造成新 trackId 搭配旧 currentTime | 明确保留；本轮只减少无关订阅检查，不改变恢复语义 |
| “无内存泄漏” | 原稿没有审查全局监听；ContextMenu 的延迟注册 timeout 未清理，三播放器拖拽在 unmount 前未 mouseup 会遗留 document listener | 新增 ContextMenu 和统一 document drag cleanup 任务 |
| 7 个 useEffect 本身是性能问题 | effect 数量不是指标，合并可能破坏独立生命周期 | 不实施，除非 profiler/trace 指向具体 effect |
| 验收“无不必要 re-render、无冗余计算” | 无法客观证明 | 改成可计数的 RAF、render commit、IPC、SQLite write 和 listener 指标 |

---

## 前置条件

- 身份：你是 work profile 的 Hermes Agent，负责按本方案实施性能优化。
- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`
- WSL 路径：`/mnt/c/Users/秋月/Desktop/QinPlayer`
- 技术栈：Electron 31、React 18、Zustand 5、TanStack Virtual、Vitest、Testing Library。
- 开工前必读：`SPEC.md` → `harness/SPEC.md` → `harness/CONSTRAINTS.md` → `harness/DECISIONS.md` → `harness/TEST_CONVENTIONS.md` → 最新 devlog。
- 本方案会触及 MiniPlayer 测试；实施前必须先处理或明确隔离已有 `tests/MiniPlayer.test.tsx` diff。若开工时还有其他改动，同样逐项登记归属。
- 最终验证：`npm run verify`。
- 禁止事项：不新增依赖、不改数据库 schema、不改变 AudioEngine/淡入淡出、不删除崩溃恢复进度保存、不通过关闭功能伪造性能收益。

## Goal

在不改变播放、恢复、扫描和导航语义的前提下，实现并证明以下结果：

1. 暂停且未拖拽时不存在持续 RAF callback；恢复播放立即重启。
2. 组件在拖拽中卸载时不会残留 document mousemove/mouseup listener。
3. ContextMenu 在延迟注册前卸载不会遗留全局 click/contextmenu listener。
4. MiniPlayer 默认/歌词视图不订阅 playlist 数组。
5. playerStore 只为真正变化的持久化键安排一次合并写入；无关状态不触发 timer。
6. 任何缓存、memo 或分包只在基线证明值得时实施，并记录“实施/跳过”的证据。

## Non-goals

- 不追求“React.memo 数量”“effect 数量”或“文件数量”等代理指标。
- 不修改音频事件频率、AudioEngine、Web Audio 图或歌词 RAF 算法结果。
- 不移除播放中每 5 秒保存 `lastCurrentTime` 的安全网。
- 不在本任务中引入 renderer 全局歌曲 Zustand store。
- 不默认实施 React.lazy；现有 renderer entry 对本地 Electron 已较小。
- 不新增 SQLite 索引；当前候选查询未先证明是瓶颈。
- 不把测试环境的 JSDOM 用时当作真实渲染性能。
- 不为了降低 commit 次数改变用户可见刷新时机。

---

## 性能基线与门槛

创建 `docs/perf/PERF-20260711-performance-optimization.md`，记录机器、歌曲数量、构建版本和以下 before/after 数据。

| 指标 | 测量方式 | 实施门槛 / 目标 |
|---|---|---|
| Paused RAF callbacks | 可控 RAF 单测 + Electron Performance 10 秒 trace | 稳定暂停后为 0；拖拽/恢复正常 |
| Active RAF loops | App 三种模式分别观察 | 任意时刻最多 1 个播放器进度循环 |
| Global listener cleanup | fake timers + add/remove spy + unmount | unmount 后新增 listener 为 0，已注册 listener 成对移除 |
| MiniPlayer commits | React Profiler，默认视图 setPlaylist 10 次 | playlist 变化导致 0 次额外 commit |
| Player settings writes | fake timers + invoke mock | 无关 state 为 0；同一 dirty key burst 合并为 1 次 |
| `songs:getAll` | 启动恢复→Local→Albums 的调用计数、payload 大小、端到端中位耗时 | 仅当重复调用且中位耗时 ≥8ms 或 payload ≥1MB 时实施快照仓库 |
| Row render hotspot | React DevTools Profiler，1000+ tracks，至少 10 次交互 | 只有目标 commit p95 >16ms 且行渲染占主要耗时才加 memo |
| Renderer bundle | clean build 后记录 entry raw/gzip 与 total JS | 本轮只记录；entry gzip >200KB 且出现 >50ms parse/compile long task 才另立分包计划 |
| Memory stability | 反复打开/关闭菜单、拖拽中切页、进出 MiniPlayer 50 次 | listener/timer 数不持续增长，无 detached component callback |

已有 `out` 产物约 `465,667` bytes raw / `102,279` bytes gzip，只作审查参考；必须重新 build 后才能写入正式基线。

### 测量纪律

- 自动测试证明生命周期与调用次数，不声称能证明动画流畅或 CPU 百分比。
- Electron trace 需使用同一歌曲库、同一窗口尺寸和相同操作脚本。
- 每项至少记录 before/after；收益未达到门槛时保留正确代码，不强行优化。
- 临时 Profiler/console instrumentation 不进入最终提交。

---

## 决策状态

| 项目 | 状态 | 原因 |
|---|---|---|
| RAF active lifecycle | **预批准实施** | 持续 60fps callback 可直接计数，生命周期边界明确 |
| Document drag cleanup | **预批准实施** | 可复现 listener 泄漏路径，属于正确性修复 |
| ContextMenu delayed listener cleanup | **预批准实施** | timeout-unmount 竞态明确 |
| MiniPlayer playlist subscription | **预批准实施** | selector 依赖可静态确认，行为边界清晰 |
| playerStore dirty-key persistence | **预批准实施** | 无关 state 确实重置 debounce，可精确测试 |
| Song snapshot repository | **测量门槛后实施** | 潜在收益与陈旧数据风险并存 |
| Row/card React.memo | **Profiler 门槛后实施** | 虚拟化已降低行数，不能凭“零 memo”判断 |
| React.lazy code splitting | **本轮不实施** | 当前 renderer 约 102KB gzip，本地加载收益不足以覆盖路由 fallback 风险 |
| 删除 currentTime interval | **拒绝** | 破坏异常退出恢复，并引入 track/time 配对风险 |
| 合并 useAudioSync effects | **拒绝** | 没有性能证据，且会耦合独立生命周期 |

---

## 改动范围

### 预批准文件

| 类型 | 文件 | 改动 |
|---|---|---|
| Create | `src/hooks/useRafLoop.ts` | active 驱动的 RAF 注册/取消 |
| Create | `src/hooks/useDocumentMouseDrag.ts` | document 拖拽监听与 unmount cleanup |
| Modify | `src/components/PlayerBar.tsx` | 可启停 RAF、拖拽 active 状态、统一 drag hook |
| Modify | `src/components/MiniPlayer.tsx` | 可启停 RAF、拖拽 active 状态、移除 playlist selector |
| Modify | `src/pages/Lyrics.tsx` | 可启停 RAF、暂停 seek/歌词索引同步、统一 drag hook |
| Modify | `src/components/ContextMenu.tsx` | 保存并清理延迟 listener timeout |
| Create | `src/components/MiniQueueViewContainer.tsx` | 仅队列视图挂载时订阅 playlist |
| No change expected | `src/components/MiniQueueView.tsx` | 作为纯 props 展示组件保留；只有接口确实不足时才修改 |
| Modify | `src/stores/playerStore.ts` | dirty-key debounce、restore 抑制、isPlaying 边沿过滤 |
| Create | `tests/useRafLoop.test.tsx` | stop/restart/callback/unmount 测试 |
| Create | `tests/useDocumentMouseDrag.test.tsx` | listener 配对与 unmount 测试 |
| Create | `tests/ContextMenu.test.tsx` | 延迟注册竞态测试 |
| Modify | `tests/PlayerBar.test.tsx` | paused/play/drag RAF 集成 |
| Modify | `tests/MiniPlayer.test.tsx` | RAF 和 playlist commit 回归 |
| Create | `tests/LyricsPerformance.test.tsx` | paused drag/seek/歌词索引回归 |
| Modify | `tests/playerStore.test.ts` | dirty-key write、restore 与周期进度保护 |
| Modify | `SPEC.md` | 性能生命周期与持久化约束 |
| Modify | `harness/DECISIONS.md` | 记录 RAF、订阅隔离和不删除进度安全网的决策 |
| Create | `docs/perf/PERF-20260711-performance-optimization.md` | before/after 指标与门槛结论 |
| Create after implementation | `docs/devlog/devlog-20260711-performance-optimization.md` | 实际修改和验证结果 |

### 仅门槛通过时增加

| 类型 | 文件 | 条件性改动 |
|---|---|---|
| Create | `src/utils/songsRepository.ts` | 快照、in-flight、generation 与显式 invalidation |
| Modify | `src/App.tsx` | 全局 scan 事件只负责 repository 失效 |
| Modify | `src/pages/LocalMusic.tsx` | load/scan done refresh/scan event invalidation |
| Modify | `src/pages/Albums.tsx` | 使用 repository 获取快照 |
| Modify | `src/pages/Settings.tsx` | deleteAll 成功后 replace empty |
| Modify | `src/stores/playerStore.ts` | restore 使用 repository |
| Create | `tests/songsRepository.test.ts` | 并发、generation、force refresh、clear 测试 |
| Modify conditionally | 由 Profiler 指认的单个列表组件及测试 | 只提取真正热点 row/card，不进行全项目 memo 运动 |

明确不修改：AudioEngine、数据库 schema、IPC 通道类型、feature flags、`package.json`、tsconfig、播放进度保存间隔、普通页面 lazy import。

---

## Task 0：隔离工作区并建立 before 基线

**Objective:** 先证明问题存在，确保后续结果可归因。

### Step 1：检查和隔离已有改动

Run：

```bash
git status --short
```

- MiniPlayer 已有改动与本任务重叠，建议主人先提交。
- `SPEC.md` 必须按段合并，不得覆盖已有内容。
- 不要把其他未跟踪计划、HTML preview 纳入本任务 diff。

### Step 2：运行代码基线

Run：

```bash
npm run verify
```

Expected：Harness、生产构建、全量测试通过。已有失败必须先记录，不能混入优化结果。

### Step 3：采集 before 数据

按“性能基线与门槛”表执行，并写入 perf 报告：

- 播放 10 秒、暂停 10 秒、暂停拖拽 5 次。
- normal / lyrics / mini 三种模式分别记录。
- 默认 MiniPlayer 下连续 setPlaylist 10 次的 Profiler commit。
- 启动恢复后依次进入 LocalMusic、Albums，记录 `songs:getAll` 次数、payload 和耗时。
- 1000+ tracks 下记录 SongList 交互 commit flamegraph。
- clean build 后记录 renderer entry raw/gzip/total JS。

没有达到门槛的条件任务在报告中标记“跳过”，不要为了完成计划而改源码。

---

## Task 1：修复全局监听生命周期

**Objective:** 消除已经确认的 timeout/listener 泄漏路径，再谈 CPU 微优化。

**Files:**

- Create: `src/hooks/useDocumentMouseDrag.ts`
- Modify: `src/components/PlayerBar.tsx`
- Modify: `src/components/MiniPlayer.tsx`
- Modify: `src/pages/Lyrics.tsx`
- Modify: `src/components/ContextMenu.tsx`
- Create test: `tests/useDocumentMouseDrag.test.tsx`
- Create test: `tests/ContextMenu.test.tsx`

### Step 1：先写 drag hook 失败测试

建议接口：

```ts
const { startDocumentMouseDrag, cancelDocumentMouseDrag } = useDocumentMouseDrag()

startDocumentMouseDrag({
  onMove: (event) => {},
  onEnd: (event) => {},
})
```

覆盖：

1. start 注册一组 mousemove/mouseup。
2. mouseup 先移除监听，再调用一次 onEnd。
3. `cancelDocumentMouseDrag` 只清理监听，不伪造 mouseup，也不调用业务 onEnd。
4. 再次 start 会先清理上一组；组件在 start 前负责重置旧 drag kind/ref/state，不能只移除监听后留下 `isProgressDragging=true`。
5. 组件 unmount 时无论是否收到 mouseup 都清理，且不得在 unmount cleanup 中 setState。
6. unmount 后事件不再调用旧 callback。
7. Hook 不创建 React state，不因每次 mousemove 触发 render。

### Step 2：接入三个组件

- PlayerBar 的进度和音量拖拽共用一个 hook 实例；新拖拽开始前，组件先重置旧业务拖拽状态，再取消旧监听并注册新监听。
- Lyrics 同样覆盖进度和音量。
- MiniPlayer 覆盖进度拖拽。
- 对应 feature flag/视图可见条件变为 false 时，即使组件只是返回 `null` 而没有 unmount，也必须主动 cancel listener、清空 drag ref，并把仍挂载组件的 dragging state 复位。
- 保留现有 ratio、clamp、seekTime 和 volume 行为；只替换 document listener 生命周期。
- mouseup 后的业务 callback 必须在 listener cleanup 之后执行，避免 callback 抛错导致泄漏。

### Step 3：修复 ContextMenu 延迟注册

当前 `setTimeout(0)` 未保存 ID。改为：

- 保存 timeout ID。
- cleanup 先 clearTimeout，再移除可能已经注册的两个 listener。
- 不改变“避免当前右键事件立即关闭”的延迟语义。

测试两条路径：timeout 执行后正常 unmount 成对移除；timeout 执行前 unmount，advance timers 后不得再 addEventListener。

### Step 4：验证

组件集成测试还要覆盖：拖拽期间关闭对应 feature flag/退出可见状态，即使组件没有 unmount，document listener 也会清理，dragging state 不会残留。

Run：

```bash
npx vitest run tests/useDocumentMouseDrag.test.tsx tests/ContextMenu.test.tsx tests/PlayerBar.test.tsx tests/MiniPlayer.test.tsx
```

---

## Task 2：正确停止并恢复播放器 RAF

**Objective:** paused idle 不持续调度，播放和暂停拖拽均保持正确 UI。

**Files:**

- Create: `src/hooks/useRafLoop.ts`
- Modify: `src/components/PlayerBar.tsx`
- Modify: `src/components/MiniPlayer.tsx`
- Modify: `src/pages/Lyrics.tsx`
- Create test: `tests/useRafLoop.test.tsx`
- Modify/Create integration tests listed above

### Step 1：先写 Hook 失败测试

建议接口：

```ts
useRafLoop(active, onFrame)
```

契约：

- active false：不 request RAF。
- false→true：安排一条循环。
- true→false：cancel 当前 ID，旧 callback 即使被测试手动触发也不能继续排下一帧。
- false→true 再次恢复：创建新循环。
- onFrame 引用变化：通过 ref 使用最新 callback，不重建并行循环。
- unmount：cancel 且不能再调度。
- 组件功能开关关闭或对应视图不可见时，传入的 active 必须为 false；不能因为 `isPlaying` 仍为 true 而在返回 `null` 的组件中继续调度。

### Step 2：组件使用 active 状态

三组件都增加低频 `isProgressDragging` state；只在 mousedown/mouseup 各 render 一次。active 还必须包含组件自己的功能开关/可见条件：

```ts
const rafActive = isVisibleAndEnabled && (isPlaying || isProgressDragging)
useRafLoop(rafActive, renderFrame)
```

- `isDraggingRef` 和 `dragTimeRef` 可继续供 frame callback 读取。
- 暂停且未拖拽时不循环。
- paused mousedown 设置 dragging=true，立即恢复预览循环；mouseup 后停止。
- 恢复播放由 isPlaying state 直接重启，不使用“只更新 ref”的死循环方案。

### Step 3：保留 paused 一次性同步

停止循环后仍必须处理低频变化：

- duration/currentTrack/lyrics/lyricOffset/miniView 变化时调用一次 `renderFrame`。
- Lyrics 点击某行 seek 时，立即按目标 time 更新进度和歌词 index，再派发 setSeekTime。
- paused 拖拽结束不能长期显示旧位置。
- renderFrame 只在歌词 index 实际变化时 setState。

### Step 4：集成测试

使用可控 RAF queue，不用真实时间：

1. playing mount 安排循环。
2. pause 后 cancel 且 callback 不重排。
3. resume 后重新安排。
4. paused drag start 临时安排，drag end 停止并保留 seek。
5. paused Lyrics line click 立即更新 active 行。
6. playback/lyrics/miniMode 对应功能开关关闭或视图退出后无 RAF；重新启用且播放中时可恢复。
7. 组件 unmount 无遗留 RAF。

Run：

```bash
npx vitest run tests/useRafLoop.test.tsx tests/PlayerBar.test.tsx tests/MiniPlayer.test.tsx tests/LyricsPerformance.test.tsx
```

---

## Task 3：隔离 MiniPlayer 的 playlist 订阅

**Objective:** 默认/歌词视图不因 playlist 数组变化 commit，同时保持展示组件纯净。

**Files:**

- Create: `src/components/MiniQueueViewContainer.tsx`
- Modify: `src/components/MiniPlayer.tsx`
- Keep pure: `src/components/MiniQueueView.tsx`
- Modify: `tests/MiniPlayer.test.tsx`
- Regression: `tests/MiniQueueView.test.tsx`

### Step 1：先写失败回归

- 用 React Profiler 包住 MiniPlayer，等待初始 Hook/歌词请求稳定后清零 commit 记录。
- 保持 `'default'` 视图，连续 `setPlaylist` 10 次，额外 commit 必须为 0。
- 切到 queue 视图后 setPlaylist，队列内容必须更新。
- 返回 default 后再次 setPlaylist，不应更新 MiniPlayer shell。

不要修改生产组件增加 render counter；Profiler 只存在测试/基线工具中。

### Step 2：实现 connector

- MiniPlayer 删除 `usePlayerStore((s) => s.playlist)`。
- 只有 `miniView === 'queue'` 时挂载 `MiniQueueViewContainer`。
- Container 订阅 playlist，并把 tracks/currentTrackId/onPlay 传给现有 MiniQueueView。
- MiniQueueView 保留受控 props 和现有独立测试，不直接 import store。
- Store action selector 是稳定引用，不是本次主要问题；不要顺手搬走所有 MiniPlayer selector。

### Step 3：验证

Run：

```bash
npx vitest run tests/MiniPlayer.test.tsx tests/MiniQueueView.test.tsx
```

---

## Task 4：playerStore 持久化只写 dirty keys

**Objective:** 无关状态不安排 debounce，相关状态 burst 只写最终变化键，同时保留周期进度安全网。

**Files:**

- Modify: `src/stores/playerStore.ts`
- Modify: `tests/playerStore.test.ts`

### Step 1：先写失败测试

使用 fake timers，并隔离模块级 timer：

1. isPlaying、duration、seekTime、playlist 变化后推进 500ms，不能调用 volume/playMode/lastTrackId 写入。
2. 连续 20 次 setVolume，只写一次最终 volume；不顺带写另外两键。
3. playMode 变化只写 playMode。
4. currentTrack 变化只写 lastTrackId。
5. volume 与 playMode 在同一 debounce 窗口变化，各写一次最终值。
6. restorePlayerState 应用数据库值时不回写相同设置。
7. flush 后 dirty map 清空，下一轮真实变化仍能保存。
8. 现有 lastCurrentTime 周期逻辑仍在播放 5 秒后写入；本任务不得删除。
9. unrelated state 变化不会重启/延迟已有 dirty-key timer 的截止时间。

### Step 2：实现 dirty-key scheduler

- Zustand subscribe 使用 `(state, previousState)` 比较三个持久化字段。
- 变化的键写入 module-level pending Map；同键覆盖为最新值。
- 第一项 dirty 创建 500ms timer；后续同窗口更新 Map，但不因 unrelated state 重置 timer。
- flush 复制并清空 Map，再逐键调用 settings:set；单键失败不阻塞其他键，但禁止空 catch，必须输出包含键名的中文错误上下文。本任务不引入无限自动重试；失败值由后续真实变化再次进入 dirty map。
- restorePlayerState 在同步 `setState` 前短暂开启 `suppressPlayerSettingsPersistence`，订阅回调同步执行后立即恢复。
- 不导入 subscribeWithSelector middleware，不改 store 公共 API。

### Step 3：只过滤 progress interval 的边沿

- 保留 5 秒 interval。
- 负责启动/停止 interval 的 subscribe 先比较 `state.isPlaying === previousState.isPlaying`，无关 state 不重复执行分支。
- pause/unmount/app 生命周期语义保持现状；本任务不设计新的 crash persistence 协议。

### Step 4：验证

Run：

```bash
npx vitest run tests/playerStore.test.ts tests/useAudioSync.test.tsx
```

---

## Task 5：`songs:getAll` 快照仓库决策门槛

**Objective:** 只有数据库读取/IPC 序列化已构成可见成本时，才承担缓存一致性复杂度。

### Step 1：作出门槛决定

使用 Task 0 数据：

- 若启动→Local→Albums 存在重复请求，且中位端到端耗时 ≥8ms 或 payload ≥1MB：进入 Step 2。
- 否则：不改源码，在 perf 报告写“门槛未通过”，本 Task 完成。

### Step 2：先写 repository 失败测试（仅门槛通过）

契约：

```ts
getAllSongs(): Promise<Track[]>
refreshAllSongs(): Promise<Track[]>
invalidateSongsSnapshot(): void
replaceSongsSnapshot(tracks: Track[]): void
```

测试：

1. 并发 getAllSongs 共用一个 in-flight Promise。
2. resolved snapshot 后普通读取不再 invoke。
3. refresh 强制新请求并替换。
4. invalidate 后新请求。
5. 请求 A pending 时 invalidate + 请求 B；A 晚到不能覆盖 B（generation token）。
6. replace empty 后返回空数组，不误把空数组当 cache miss。
7. reject 不缓存失败，也不留下永远 pending 的 Promise。

### Step 3：接入所有一致性入口

- restorePlayerState、LocalMusic mount、Albums 使用 getAllSongs。
- LocalMusic scan done 使用 refreshAllSongs。
- App 在全生命周期监听 `scan:song-found` / `scan:done` 并 invalidate；即使用户扫描中切页也不会让下一次读取复用旧 snapshot。
- Albums 若在扫描结束时仍挂载，必须监听 `scan:done` 并调用 refreshAllSongs 后更新本页 state；单纯 invalidate 不会触发已挂载页面 render。listener 在 unmount 时成对清理。
- Settings deleteAll 成功后 replaceSongsSnapshot([])。
- DB import 成功会重启应用，内存 snapshot 自然清空；无需额外逻辑。
- 不使用 TTL；新鲜度由明确 mutation/invalidation 事件决定。

### Step 4：验证

Run：

```bash
npx vitest run tests/songsRepository.test.ts tests/Albums.test.tsx tests/SongList.test.tsx tests/playerStore.test.ts
```

重新测量 IPC 次数与耗时；若收益不明显或一致性接线无法完整证明，撤销本 Task 自己的改动并在报告记录“试验未采用”。

`tests/Albums.test.tsx` 必须覆盖扫描结束后已挂载页面主动刷新，以及 unmount 后不再响应 scan 事件；repository 单测不能替代这一组件集成测试。

---

## Task 6：React.memo 决策门槛

**Objective:** 只优化 Profiler 指认的 row/card，不进行全项目机械 memo。

### Step 1：判断门槛

- 1000+ tracks 和真实交互下，目标 commit p95 >16ms。
- flamegraph 显示 row/card render 占该 commit 主要耗时。
- 父更新时大部分目标 row props 语义不变。

三项必须同时满足。否则在报告写“虚拟化已足够 / memo 门槛未通过”，不改源码。

### Step 2：仅在通过时提取热点

- 每次只处理 Profiler 指认的一类，不默认处理 Albums、PlaylistPanel、MiniQueueView 全部。
- 不传每 render 新建的 style 对象；传 start/size/index 等 primitive，由 row 内组装 style。
- 传 `isLiked` boolean，不传整个 liked Set。
- 回调若因闭包频繁变化，先修稳定性；禁止用错误 custom comparator 忽略函数变化。
- 使用 React Profiler before/after 证明 commit 数或耗时下降；比较成本不能超过节省。
- 功能测试覆盖 click、context menu、like、active row 和虚拟定位。

### Step 3：回退条件

若 after p95 没有稳定改善、代码显著复杂或功能测试需要忽略真实 props 变化，撤销本 Task 自己的 memo 改动并记录未采用。

---

## Task 7：全量验证、after 基线与项目记忆

**Objective:** 用相同场景证明收益，不用代码数量代替结果。

**Files:**

- Modify: `SPEC.md`
- Modify: `harness/DECISIONS.md`
- Complete: `docs/perf/PERF-20260711-performance-optimization.md`
- Create: `docs/devlog/devlog-20260711-performance-optimization.md`

### Step 1：自动验证

Run：

```bash
npm run verify
```

Expected：Harness、生产构建、全量 Vitest 全部通过，0 failed。

### Step 2：复测相同场景

- 使用 Task 0 相同歌曲库、窗口、操作脚本和采样时长。
- 填写 before/after，不允许只写“明显变快”。
- 条件任务必须写门槛数据、实施/跳过决定和原因。
- React.lazy/currentTime interval/useAudioSync effect 必须明确写“未改”，防止后续误解。

### Step 3：内存与生命周期 smoke

1. 拖动 PlayerBar 后在 mouseup 前切到歌词/迷你模式，重复 20 次。
2. 打开 ContextMenu 后立即选择/切页，重复 50 次。
3. MiniPlayer default/queue 间切换并更新 playlist 50 次。
4. 播放/暂停/拖拽循环 50 次。
5. 检查 listener、timer、RAF 数量不持续增长，无 unmounted callback 警告。

### Step 4：更新项目记忆

SPEC 记录可观察不变量：paused idle 无 RAF、进度周期保存保留、歌曲 snapshot（若实施）的失效边界。

DECISIONS 记录：

- active state 驱动 RAF，暂停拖拽临时恢复。
- document drag listener 使用统一 cleanup hook。
- Mini queue 使用条件 connector 隔离 playlist selector。
- player settings 按 dirty key 保存。
- 不以 memo 数量或 effect 数量作为性能指标。

Devlog 记录实际文件、测试、`npm run verify`、before/after 和所有跳过项。

---

## 整体验收标准

1. `npm run verify` 全绿，0 failed。
2. paused 且未拖拽时 RAF callback 计数稳定为 0；播放恢复和 paused drag 均能重新更新。
3. normal、lyrics、mini 任意时刻最多一个播放器进度 RAF 循环；对应功能关闭或视图不可见时为 0。
4. 三组件拖拽中 unmount 后 document listener 全部清理。
5. ContextMenu 在 timeout 前后 unmount 都不会遗留 listener。
6. MiniPlayer default/lyrics 视图 setPlaylist 不产生额外 commit；queue 视图仍实时更新。
7. playerStore 无关状态产生 0 次设置写；dirty burst 每键只写一次最终值。
8. restore 不回写刚读取的设置；5 秒 progress safety write 保持通过。
9. songs repository 和 memo 均有门槛结论；未通过时没有残留试验代码。
10. React.lazy、AudioEngine、数据库 schema、currentTime interval 和 useAudioSync effect 边界未被改变。
11. perf 报告包含可复现 before/after，而不是主观描述。
12. 原有播放、seek、歌词点击、队列、扫描、恢复和 feature flag 测试无回归。

## 手动测试（主人执行）

1. 播放 10 秒后暂停，观察 CPU/scripting 活动下降；暂停拖动三个界面的进度条仍实时更新。
2. 暂停后恢复播放，三个界面的时间、进度和歌词均立即继续。
3. 拖拽过程中切换主界面/歌词/迷你模式，确认没有后续幽灵拖动或控制台警告。
4. 默认 MiniPlayer 下刷新/改变队列，界面不闪；切到 queue 后内容正确更新。
5. 连续调节音量、切换播放模式、播放/暂停，重启后持久化值正确。
6. 播放超过 10 秒后直接退出并重启，当前时间恢复能力没有因“优化”丢失。
7. 若实施 songs repository：扫描中切到 Albums、扫描完成再返回，数量/专辑立即正确；清空歌曲后各页不显示旧数据。
8. 1000+ tracks 快速滚动、收藏、右键、切歌；若实施 memo，功能与虚拟定位不变。

## 风险

| 风险 | 影响 | 控制措施 |
|---|---|---|
| RAF 停止后没有可靠重启触发点 | 恢复播放后进度和歌词冻结 | active state 驱动 Hook；覆盖 pause/resume/paused drag/line seek 测试 |
| active 未包含 feature flag/可见性 | 功能关闭或组件返回 null 后仍持续调度 | `isVisibleAndEnabled && (playing || dragging)`；覆盖关闭和重新启用测试 |
| 替换拖拽 listener 时只清理事件、不清理业务状态 | 组件永久处于 dragging，RAF 不停或进度错误 | 明确 cancel 与业务 reset 的顺序；测试连续 start 和 unmount |
| dirty-key 保存遗漏 restore 抑制或失败处理 | 启动时无意义回写、设置丢失或错误被吞 | prev-state 对比、同步 suppress guard、失败日志和定向测试 |
| 歌曲快照失效入口不完整 | 扫描、清空或切页后看到旧歌曲 | 缓存为条件任务；generation + App 全局失效 + clear 测试；证明不了就撤销 |
| memo 比较成本或陈旧 props 超过收益 | 交互变慢、点击使用旧闭包 | 三项 Profiler 门槛、禁止错误 comparator、after 无改善即撤销 |
| 性能测量受脏工作区或不同场景污染 | before/after 不可比较 | Task 0 固定版本、歌曲库、窗口与操作；隔离既有 MiniPlayer diff |
| 生命周期修复与最新动画退出逻辑交叉 | 切页/退场时产生 callback 或测试回归 | 读取最新动画 devlog，执行拖拽中切页和 ContextMenu 立即卸载 smoke |

## 回滚方式

1. 不做整仓回滚。按 Task 保持独立 diff，失败时只撤销该 Task 自己新增或修改的文件，保留用户既有改动。
2. Task 1-4 任一项若定向测试或行为验收失败，停止后续任务，撤销该 Task 实现并保留失败测试/测量记录供重新设计；不得用放宽断言掩盖失败。
3. Task 5-6 属于条件试验：门槛未通过时不进入源码；实施后收益不稳定或一致性无法证明时，完整撤销该条件 Task，并在 perf 报告记录“试验未采用”。
4. 文档只记录实际落地结果。撤销某项代码时，同步删除尚未成立的 SPEC/DECISIONS 条目，不删除历史 devlog，改为记录尝试、失败原因和回退结果。
5. 若全量 `npm run verify` 出现无法归因于单个 Task 的失败，使用每个 Task 的文件清单和定向测试逐项定位；未经主人确认，不执行 `git reset --hard`、整仓 checkout、commit、push 或打包。

## 实施后审查交接

实现完成后交给 Codex 独立审查，最小审查包包含：

- 本方案文件。
- `git status --short` 与仅本任务 diff。
- `npm run verify` 摘要。
- perf 报告 before/after 表。
- RAF/listener/Profiler/IPC/write 的原始计数。
- songs repository 与 memo 的门槛决定。
- 主人手动测试结果。

---

## 独立性能工程师视角自审记录

| 自审问题 | 处理结果 |
|---|---|
| 是否先测量再决定？ | Task 0 建立统一场景；缓存和 memo 有硬门槛 |
| 是否把组件/effect 数量误当性能？ | 已删除“零 memo=高收益”“7 effects=问题”的假设 |
| RAF 停止后如何恢复？ | active state 直接控制 Hook，false→true 明确重启 |
| paused drag 如何更新？ | dragging 使用低频 state 临时启用 loop，mouseup 后停止 |
| paused 歌词点击会不会不更新？ | 要求目标 time 一次性更新进度/index 后再 seek |
| 三个 RAF 是否同时存在？ | App 模式互斥；指标要求任意时刻最多一个 |
| SongList transform 会不会被优化破坏？ | 本方案不改虚拟定位；memo 条件分支必须测试 start/size |
| memo props 是否真的稳定？ | 禁止新 style 对象、整 Set 和错误 comparator；Profiler after 必须改善 |
| TTL cache 会不会读旧歌？ | 删除 TTL；条件仓库使用显式 invalidation + generation |
| 扫描中离开页面谁负责失效和刷新？ | App 全生命周期负责 snapshot 失效；已挂载 Albums 在 scan done 后主动 refresh 并更新页面 |
| 空数组会不会被当 cache miss？ | repository 测试明确覆盖 replace empty |
| pending 旧请求会不会覆盖 refresh？ | generation token 测试 A/B 乱序 |
| currentTime interval 删除后崩溃恢复怎么办？ | 明确拒绝删除并新增保护性测试 |
| trackId 和 currentTime 是否可能错配？ | 不在性能任务中重写协议；保留现有周期安全网并记录后续正确性风险 |
| playerStore restore 会不会立即回写？ | 增加同步 suppress guard 和测试 |
| debounce 是否被无关 state 延迟？ | dirty timer 首次创建后，无关更新不重置截止时间 |
| ContextMenu timeout-unmount 竞态是否覆盖？ | fake timer 测试注册前/后两条路径 |
| drag listener 是否在异常卸载时清理？ | 统一 Hook + unmount 测试，不依赖 mouseup |
| React.lazy 是否真的值得？ | 当前约 102KB gzip，本轮明确不实施，避免本地路由 loading |
| JSDOM 用时能否当性能数据？ | 明确禁止；单测只锁生命周期和计数，真实耗时用 Electron Profiler |
| dirty worktree 是否会污染结果？ | 前置条件要求以开工时 status 为准，先处理/隔离已有 MiniPlayer 测试及其他用户改动 |
| 功能关闭时 RAF 是否真的停止？ | active 明确包含对应 feature flag/视图可见性，并增加关闭、重启测试 |
| 功能关闭但组件未卸载时 drag listener 呢？ | 可见条件变 false 时主动 cancel、清 ref/state，不只依赖 unmount cleanup |
| 是否满足工作流规定的方案结构？ | 已补充背景、当前状态、目标/非目标、实施步骤、自动与手动验收、风险和回滚方式 |
| 最新项目状态是否被纳入？ | 已记录第 271 个测试尚未最终复跑，并要求 Task 0 重新建立基线 |
| 回滚是否会误伤用户改动？ | 禁止整仓回滚，只允许按 Task 文件清单撤销本任务 diff |

**自审结论：** 本版从“优化清单”改为“可证伪的性能实验 + 低风险生命周期修复”。预批准项均有明确测试和回退边界；高风险项必须达到门槛，未达到即不改源码。未经主人确认，不进入实施。
