# Codex 任务包：歌词界面三项修复

## 背景

歌词界面有三个问题需要修复：
1. 手动切歌时歌词先跳到旧位置再回弹（旧音频淡出期间 timeupdate 污染 currentTimeRef）
2. 全屏切换后歌词完全空白，持续到下一句歌词才出现
3. 歌词行切换动画太生硬，想要 Apple Music 那种流动感

方案经审查通过，详见 `C:\Users\秋月\Desktop\QinPlayer\docs\plans\PLAN-lyrics-three-fixes.md`。

## 目标

按方案的 4 个 Task 顺序实施，每个 Task 先写失败测试再写最小实现，最终 `npm run verify` 全绿。

## 非目标

- 不新增依赖
- 不修改 `package.json`、`tsconfig.json`
- 不改 `AudioEngine` 公共 API
- 不顺手重构其他播放器逻辑
- 不自动提交 Git

## 相关文件

- `docs/plans/PLAN-lyrics-three-fixes.md` — 完整实施方案（必读）
- `SPEC.md`、`harness/SPEC.md`、`harness/CONSTRAINTS.md`、`harness/DECISIONS.md`、`harness/TEST_CONVENTIONS.md` — 项目规范
- `docs/devlog/devlog-20260710-lyrics-scroll-reset.md` — 上次切歌修复记录
- `src/hooks/useAudioSync.ts` — Task 1 改动
- `src/components/LyricsPanel.tsx` — Task 2、Task 3 改动
- `src/pages/Lyrics.tsx` — Task 2 改动
- `src/styles/lyrics.css` — Task 3 改动
- `tests/useAudioSync.test.tsx` — Task 1 测试
- `tests/LyricsPanel.test.tsx` — Task 2、Task 3 测试

## 约束

- 遵守 harness 约束（主进程禁止同步 I/O、currentTime 不放 Zustand 等）
- 不采用"切歌时暂停播放再恢复"方案（会打断淡入淡出）
- 保留已有的 `lyricsData.trackId`、`key={currentTrack.id}`、`lrcRequestRef` 三层保护，不删除、不合并
- 全屏修复只处理 fullscreen 布局切换，不引入 `ResizeObserver`
- CSS `transform` 只做单行 4px 微位移，不承担列表滚动
- `will-change` 只给可见行，不给全部歌词行
- 保留 `prefers-reduced-motion` 降级
- Promise、RAF、事件监听与测试 mock 必须清理，不污染其他测试
- 测试用中文描述、动词开头
- 注释用中文

## 需要 Codex 做什么

按 `PLAN-lyrics-three-fixes.md` 的 Task 1 → Task 2 → Task 3 → Task 4 顺序实施：

1. **Task 1**：在 `useAudioSync.ts` 加 `trackTransitionRef` 屏蔽旧音频事件，写失败测试→实现→验证
2. **Task 2**：给 LyricsPanel 加 `layoutRevision` prop，`useEffect` 改 `useLayoutEffect`，全屏切换后重新定位
3. **Task 3**：给歌词行加方向状态类（--past/--future/--visible），CSS 加 `translateY(±4px)` + `scale(1.02)` 过渡
4. **Task 4**：`npm run verify` 全绿，写 devlog

每个 Task 完成后运行定向测试确认通过再进入下一个。

## 已验证

- 方案经审查通过
- 根因分析、技术决策、验收标准已确认

## 需要特别注意

- **不要暂停播放**：方案明确不采用 `setPlaying(false)` 再恢复的方式
- **`trackTransitionRef` 解除信号是 `onLoadedMetadata`**，不是 LRC 加载完成
- **`useLayoutEffect` 改动会影响所有情况**，确保依赖数组 `[currentIndex, lyrics, layoutRevision]` 正确
- **`prefersReducedMotion` 需要 JS 和 CSS 两侧降级**：JS 侧决定 `behavior: 'auto'` vs `'smooth'`，CSS 侧禁用 `transform` 和 `transition`
- **`will-change` 只给可见行**：歌词可能有上百行，不能给所有行设置
- **Task 1 的 `onEnded` guard**：防止淡出期间旧歌 ended 导致连续跳两首
- **不要删除现有测试用例**
- **不要自动提交 Git**

## 返回格式

- 结论：已完成 / 需要返工
- 变更：改了哪些文件、改了什么行为
- 验证：运行了哪些命令、哪些通过
- 风险：仍需注意的问题
- 需要主人确认：手动测试清单
