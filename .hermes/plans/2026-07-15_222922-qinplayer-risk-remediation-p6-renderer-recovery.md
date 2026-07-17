# P6 — Renderer Error Boundary 与 Liked 即时刷新

> 前置：P5 已通过 Reviewer；P0 第 6、8 项已由主人确认。
> 目标：render/lifecycle 异常不再只留下白屏；取消收藏成功后 Liked 页面立即反映数据库事实。

## 范围

### 新增

- `src/components/AppErrorBoundary.tsx`
- `src/styles/error-boundary.css`
- `tests/AppErrorBoundary.test.tsx`

### 修改

- `src/main.tsx`
- `src/styles/global.css`
- `src/components/SongList.tsx`
- `src/pages/Liked.tsx`
- `tests/SongList.test.tsx`
- `tests/Liked.test.tsx`
- `SPEC.md`、`harness/DECISIONS.md`、`harness/TEST_CONVENTIONS.md`
- 新建 `docs/devlog/devlog-YYYYMMDD-renderer-recovery.md`

### 非目标

- Error Boundary 不捕获 Promise rejection、事件 handler、Electron main 崩溃或音频错误；P5 已处理音频。
- 不引入远程错误上报、账号、网络或新依赖。
- 不建立全局收藏 Store，不修改当前会话 playlist。
- 不做乐观 unlike；只有 IPC 成功才移除。

## Task 1：先写 Error Boundary 测试

`tests/AppErrorBoundary.test.tsx`：

1. 子组件正常时原样渲染。
2. 子组件 render 抛错时显示 `role="alert"` 的中文 fallback，崩溃子树不再显示。
3. fallback 不包含 stack、原始 error message 或本地路径。
4. 点击“重新加载”只调用一次注入的 `onRetry`。
5. 单测局部拦截 React 对预期 render error 的 console 输出；不得全局屏蔽 console.error。

## Task 2：实现最小全局恢复页

`AppErrorBoundary.tsx` 使用 class boundary：

- `getDerivedStateFromError` 切 fallback。
- `componentDidCatch` 只做本地中文诊断日志。
- 默认 retry 是 `window.location.reload()`；可注入 callback 便于测试。
- fallback 使用现有 CSS variables，提供明确“重新加载”按钮和键盘 focus。

`src/main.tsx` 结构：

~~~tsx
<AppErrorBoundary>
  <React.StrictMode>
    <App />
  </React.StrictMode>
</AppErrorBoundary>
~~~

Boundary 放在 StrictMode 外层，确保 App 子树的 render/lifecycle error 被捕获。不得为了测试移除 StrictMode。

## Task 3：先写 SongList 收藏回调测试

给 `SongListProps` 增加：

~~~ts
onLikedChange?: (track: Track, liked: boolean) => void
~~~

测试：

1. 取消收藏 IPC 成功后，内部星标更新并回调一次 `(track, false)`。
2. 收藏成功回调 `(track, true)`。
3. IPC reject 时不改内部状态、不回调，记录中文错误。
4. callback 抛错不能把已经成功的数据库操作误判为失败；组件只负责通知。

实现时 callback 必须位于 IPC 成功之后。不要把当前的 likedIds 先乐观修改再回滚。

## Task 4：先写 Liked 页面刷新测试

`tests/Liked.test.tsx`：

1. 初始加载后显示收藏列表。
2. 从 SongList 收到当前 Track 的 `liked=false` 后，该行立即从页面 state 移除。
3. 最后一首移除后显示现有空状态，排序菜单隐藏。
4. `liked=true` 或其他 ID 不删除。
5. 当前正在播放的歌曲被 unlike 时，`usePlayerStore.playlist/currentTrack/isPlaying` 不变。
6. IPC unlike 失败时行仍存在。

`Liked.tsx` 只做：

~~~ts
setTracks((current) => current.filter((item) => item.id !== track.id))
~~~

不要重新请求全列表，不要触碰来源播放列表。

## 自动验收

~~~powershell
npx vitest run tests/AppErrorBoundary.test.tsx tests/SongList.test.tsx tests/Liked.test.tsx
npx tsc --noEmit
node harness/checks.js
npm test -- --reporter=dot
npm run build
git diff --check
~~~

## 真实 Electron 验收

1. 在隔离开发环境临时让一个测试组件 render throw：出现恢复页，不是空白；点击 reload 后恢复。
2. 深/浅主题检查 fallback 对比度、focus 和窗口缩放。
3. Liked 取消普通歌曲和最后一首，页面即时更新。
4. 取消正在播放的收藏，播放不中断、来源队列不变。

不得把故意 throw 的代码留在最终 diff。

## 文档闭环

- `SPEC.md`：可记录 Renderer render/lifecycle fallback；不要宣称捕获所有异步错误。
- `harness/DECISIONS.md`：记录完整 reload、成功后通知和不引入全局收藏 Store。
- `harness/TEST_CONVENTIONS.md`：Error Boundary 测试只局部屏蔽 React 预期错误日志。
- devlog：记录 UI smoke 与边界。

## Reviewer 阻断清单

- Boundary 放在 App 内部，无法捕获 App 自身 render。
- fallback 泄露 error/stack/path。
- 通过移除 StrictMode 消除测试问题。
- Liked 在 IPC 成功前乐观删除，失败无回滚。
- unlike 修改 player playlist 或中断当前曲。
- 为两个组件引入全局收藏状态。

## 回滚

- Error Boundary 是无持久化的独立切片，可按新组件/main/style/test 整体回滚。
- Liked 回调按 SongList + Liked + 两组测试整体回滚。
- 无数据库、IPC 或用户数据操作。
