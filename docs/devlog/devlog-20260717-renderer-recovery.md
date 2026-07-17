# 2026-07-17 Renderer 恢复与 Liked 即时刷新

## 目标

- Renderer render/lifecycle 异常显示可恢复页面，不再只留下空白窗口。
- 收藏数据库写入成功后，Liked 页面立即反映取消收藏结果。
- 不扩大到异步错误、远程上报、全局收藏状态或播放队列变更。

## 实现

- 新增根级 `AppErrorBoundary`，放在 `React.StrictMode` 外层；fallback 使用固定中文文案和完整 reload，不渲染原始 error、stack 或本地路径。
- `SongList` 增加 `onLikedChange` 通知；like/unlike IPC 成功后才更新内部星标并通知，IPC 失败保持原状态。
- `Liked` 只在收到当前 Track 的 `liked=false` 后过滤页面内 `tracks`，不重新查询、不访问或修改 player Store。
- 新增深浅主题共用的恢复页样式，按钮自动获得键盘 focus。

## TDD 与自动门禁

- 红灯：新 Boundary 模块不存在；SongList 的 4 个成功/失败通知契约和 Liked 的 2 个即时刷新契约失败。
- 目标测试：3 files / 31 tests passed。
- `npx tsc --noEmit`：通过。
- Harness：`electron=24, workers=2, src=61`，通过。
- 全量：70 files / 839 tests passed。
- `npm run build`：main、两个 preload 和 Renderer bundle 均构建成功。
- `git diff --check`：无空白错误，仅有工作树既有 LF/CRLF 转换提示。

## 首轮独立 Review

- 结论：Blocker 0、Important 2、Suggestion 0，gate 未通过。
- 为每首歌曲增加 ref 级进行中锁和 disabled/`aria-busy` 状态，阻止 IPC resolve 前的重复 like/unlike 与重复通知。
- 恢复按钮改用 `text-primary` 搭配 `bg-secondary`，hover 使用 `bg-tertiary`，避免深浅主题下 accent 按钮文字对比度不足。
- 两项问题均先由失败回归测试复现，再修复为全绿。

## 独立复审

- 同一 Reviewer 定向复跑 P6 目标测试：3 files / 31 tests passed。
- 结论：Blocker 0、Important 0、Suggestion 0；首轮全部问题关闭，Review gate PASS。

## 未自动化覆盖

- 真实 Electron 中的恢复页深浅主题、缩放与 reload，以及取消普通/最后一首/当前播放曲的人工 UI 验收。
