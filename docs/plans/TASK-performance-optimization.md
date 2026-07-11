# Codex 任务包：性能优化

## 背景
- QinPlayer 纯本地音乐播放器，Electron + React + TypeScript + Zustand
- 需要优化资源占用，但不能破坏播放、恢复、扫描和导航语义
- 测量驱动——先建立基线，再按收益排序修复，不能"理论上更快"

## 方案文件
`C:\Users\秋月\Desktop\QinPlayer\docs\plans\PLAN-performance-optimization.md` — **必须先完整读取**，本任务包只是摘要

## 约束
- 不新增依赖、不改数据库 schema、不改 AudioEngine/淡入淡出
- 不删除播放中每 5 秒保存 lastCurrentTime 的安全网
- 不改 feature flags、package.json、tsconfig
- 不把测试环境 JSDOM 用时当真实性能数据
- 不通过关闭功能伪造性能收益
- 注释用中文
- 不要自动 git commit

## 执行顺序

严格按 Task 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 顺序执行。

### Task 0：建立基线
- `git status --short` 确认工作区（MiniPlayer 已有用户改动，不要覆盖）
- `npm run verify` 建立当前代码基线
- 创建 `docs/perf/PERF-20260711-performance-optimization.md` 记录 before 数据
- 按方案"性能基线与门槛"表采集：Paused RAF count、listener count、MiniPlayer commits、settings writes、songs:getAll 次数/耗时/payload

### Task 1：修复全局监听生命周期
- 新建 `src/hooks/useDocumentMouseDrag.ts`（统一拖拽 listener cleanup）
- 修复 ContextMenu 延迟注册 timeout 未清理
- PlayerBar/MiniPlayer/Lyrics 三处拖拽改用新 hook
- 功能关闭但组件未卸载时，主动 cancel listener + 清 ref/state
- 新建 tests/useDocumentMouseDrag.test.tsx + tests/ContextMenu.test.tsx

### Task 2：正确停止并恢复 RAF
- 新建 `src/hooks/useRafLoop.ts`（active state 驱动的 RAF 注册/取消）
- 三组件改用 `useRafLoop(rafActive, renderFrame)`
- `rafActive = isVisibleAndEnabled && (isPlaying || isProgressDragging)`
- 暂停且未拖拽时 RAF 停止；恢复播放立即重启
- 保留 paused 一次性同步（duration/seek/lyrics 变化时更新一次）
- 新建 tests/useRafLoop.test.tsx

### Task 3：隔离 MiniPlayer playlist 订阅
- 新建 `src/components/MiniQueueViewContainer.tsx`（仅队列视图挂载时订阅 playlist）
- MiniPlayer 删除 `usePlayerStore((s) => s.playlist)`
- MiniQueueView 保留纯 props 展示组件
- 用 React Profiler 验证 default 视图下 setPlaylist 10 次 commit 为 0

### Task 4：playerStore 持久化只写 dirty keys
- subscribe 用 `(state, previousState)` 比较 volume/playMode/lastTrackId
- 变化的键写入 pending Map，第一项 dirty 创建 500ms timer
- 无关 state 不重置 timer
- restorePlayerState 用 suppress guard 防止回写
- 保留 5 秒 progress interval，只过滤 isPlaying 边沿
- 禁止空 catch，失败必须输出包含键名的错误日志

### Task 5：songs:getAll 快照仓库（条件任务）
- **门槛：** 启动→Local→Albums 存在重复请求，且中位耗时 ≥8ms 或 payload ≥1MB
- 未通过：不改源码，perf 报告写"门槛未通过"
- 通过：实现 songsRepository（generation token + in-flight + invalidation）
- App 全局监听 scan 事件失效；scan done 强制 refresh
- Albums 扫描结束时主动 refresh 并更新页面 state

### Task 6：React.memo（条件任务）
- **门槛：** 1000+ tracks，目标 commit p95 >16ms，row render 占主要耗时
- 三项必须同时满足，否则不改源码
- 只处理 Profiler 指认的一类，不默认全项目 memo
- 传 primitive props，不传 style 对象或整个 Set
- after p95 无改善则撤销

### Task 7：全量验证 + after 基线
- `npm run verify` 全绿
- 复测 before 相同场景，填写 after 数据
- 内存/lifecycle smoke：拖拽切页 20 次、ContextMenu 50 次、playlist 切换 50 次
- 更新 SPEC.md + DECISIONS.md + devlog

## 验证命令
```bash
# 完整验证
npm run verify

# 定向测试
npx vitest run tests/useDocumentMouseDrag.test.tsx tests/ContextMenu.test.tsx tests/useRafLoop.test.tsx tests/MiniPlayer.test.tsx tests/playerStore.test.ts
```

## 需要特别注意
1. **MiniPlayer 已有用户改动** — `tests/MiniPlayer.test.tsx` 有置顶功能测试，不要覆盖
2. **RAF 停止后必须能恢复** — 用 active state 驱动 Hook，不用"只更新 ref"方案
3. **暂停拖拽进度条** — 暂停时用户可能拖拽，dragging 必须临时启用 RAF
4. **功能关闭但组件未卸载** — 必须主动 cancel listener，不只依赖 unmount cleanup
5. **currentTime interval 不能删** — 崩溃恢复需要它
6. **dirty-key 失败禁止空 catch** — 必须输出错误日志
7. **songs repository 是条件任务** — 门槛未通过不进源码
8. **React.memo 是条件任务** — 没有 Profiler 证据不加

## 返回格式
同标准任务包格式：结论、变更、验证、风险、需要主人确认
