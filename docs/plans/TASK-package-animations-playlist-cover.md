# Codex 任务包：QinPlayer 三功能（动画 + 歌单封面 + 播放列表面板）

## 背景
- QinPlayer 纯本地音乐播放器（Electron + React + TypeScript + Zustand）
- 主人要给交互加动画、歌单显示封面、PlayerBar 加播放列表面板
- 方案已经 Codex 两轮审查 + 主人确认，可以开工

## 目标
按顺序实现三个功能，每个单独验收：
1. 交互动画（A+B+C+D）
2. 歌单封面
3. 播放列表面板

## 非目标
- 不做 crossfade（旧页面先淡出再新页面淡入），本轮只做 fade-in
- 不做迷你模式进出过渡
- 不改歌词滚动（已有 transform 方案）

## 相关文件

### 必读
- `SPEC.md` — 项目规格书
- `harness/CONSTRAINTS.md` — 代码约束
- `docs/plans/PLAN-animations-playlist-cover.md` — 完整执行方案（本任务包的详细版）

### 任务一：动画（CSS 为主）
- `src/styles/content.css` — 页面切换过渡（已有基础，调整参数）
- `src/styles/songlist.css` — 列表项 staggered fade-in
- `src/styles/playerbar.css` — 按钮 :active 微动画（已有基础，扩展范围）
- `src/components/PlayerBar.tsx` — 播放按钮图标交叉淡入淡出

### 任务二：歌单封面
- `src/types/index.ts` — Playlist 类型加 coverPath
- `src/types/ipc.ts` — playlists:getAll 返回类型更新
- `electron/ipc/playlists.ts` — SQL 子查询取第一首歌 coverPath
- `src/pages/Playlists.tsx` — 渲染封面 + 无封面占位图

### 任务三：播放列表面板
- `src/components/PlayerBar.tsx` — 删歌词按钮、新增播放列表按钮
- `src/components/PlaylistPanel.tsx`（新建）— 底部弹出面板
- `src/styles/playlist-panel.css`（新建）— 面板样式
- `src/components/SongList.tsx` — forwardRef + useImperativeHandle + containerHeight prop

## 约束
- 不引入新依赖
- 不删除现有测试用例
- 遵守 harness/CONSTRAINTS.md 所有约束
- 禁止 `any` 类型
- 注释用中文，关键决策用 ★ 标记
- `@media (prefers-reduced-motion: reduce)` 关闭非必要动画

## 当前方案摘要

### 任务一：动画
- A. 页面切换 fade-in：content.css 调整参数（已有基础）
- B. 列表项 stagger：只动 opacity，不动 transform（虚拟列表依赖 transform 定位）
- C. 按钮 :active：扩展到工具栏、侧边栏、收藏按钮（playerbar.css 已有基础）
- D. 播放按钮变形：play↔pause 两图标交叉淡入淡出 200ms，复用 playPulse 状态
- **初次动画口径**：只在首次加载当前列表时加动画 class（useRef 记录 tracks 引用，引用变化时重置动画标记），滚动产生的新虚拟行不重新动画

### 任务二：歌单封面
- 扩展 `playlists:getAll` IPC，用子查询取第一首歌 coverPath（不破坏现有 song_count）
- "第一首歌" = sort_order ASC 第一首，无封面就占位图，不向后找
- Playlist 类型加 `coverPath: string | null`

### 任务三：播放列表面板
- 删除 PlayerBar 歌词按钮，新增播放列表按钮
- 保留封面点击进歌词（不动）
- 面板受 `featureFlags.playback` 控制，不受 `playlists` 控制
- SongList 改 forwardRef + useImperativeHandle，暴露 scrollToTrackId
- SongList 加 containerHeight prop 适配半高弹层
- 面板高度：`min(headerHeight + rowCount * 44, window.innerHeight * 0.5)`，空队列 120px
- 关闭：点击面板外 / 再次点击按钮 / Esc
- 自动滚动：virtualizer.scrollToIndex(index, { align: 'center' })

## 需要 Codex 做什么
1. **按任务一→二→三顺序执行，每完成一个任务单独跑验证（tsc + test + build），通过后再进入下一个**
2. 任务一（动画）：CSS 调整 + PlayerBar 播放按钮变形
3. 任务二（歌单封面）：扩展 IPC + 类型 + 渲染
4. 任务三（播放列表面板）：新组件 + SongList 改造 + PlayerBar 改版
5. 全部完成后跑一次全量验证
6. 返回变更摘要（按任务分段）

## 已验证
- 方案已通过 Codex 两轮审查 + 主人确认
- 现有测试通过（以 npm test 实际输出为准）

## 需要特别注意
- **虚拟列表定位依赖 transform**：SongList 行动画只能动 opacity，不能动 transform
- **SongList 高度**：当前是 calc(100vh - 260px)，加 containerHeight prop 后默认值保持现有行为
- **scrollToTrackId**：forwardRef + useImperativeHandle 模式，不是普通函数
- **歌单封面 SQL**：用子查询，不要 JOIN 破坏 song_count
- **播放列表面板只跟 playback 绑定**：不跟 playlists 绑定
- **prefers-reduced-motion**：所有非必要动画加此媒体查询
- **初次动画**：只在首次加载时做 stagger，滚动产生的新行不重新动画
- **歌词入口**：保留封面点击进歌词，只删 PlayerBar 右侧的歌词按钮

## 返回格式
1. 结论（已完成/需要返工/需要主人确认）
2. 变更（改了哪些文件、改了什么行为）
3. 验证（运行了哪些命令、哪些通过）
4. 风险（仍需注意的问题）
5. 给衾衾的记录（devlog 建议、SPEC/DECISIONS 是否需要更新）
