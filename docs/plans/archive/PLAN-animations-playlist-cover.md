# QinPlayer 三功能执行方案（v2）

> 创建：2026-07-02
> 审查：Codex（2026-07-02）— 10 项修正已合并
> 状态：待确认

---

## 执行顺序

三个功能拆成独立任务，按顺序执行，每个单独验收：

1. **动画（A+B+C+D）** — CSS 为主，风险最低
2. **歌单封面** — 涉及 IPC + 类型定义，中等风险
3. **播放列表面板** — 新组件 + 虚拟列表适配，最高风险

---

## 任务一：交互动画（A+B+C+D）

### A. 页面切换过渡

`content.css` 已有淡入动画（line 10），本任务是调整参数，不是从零实现。

- 调整 duration 和 easing，使过渡更自然
- ★ 本轮只做新页面 fade-in，不做 crossfade（旧页面保留再淡出需要复杂的状态管理，另做）

### B. 歌曲列表项出现动画

**⚠️ 虚拟列表问题**：SongList 行是绝对定位，逐行 animation-delay = index * 30ms 会导致滚到后面的歌曲延迟几秒才出现。

**方案**：只对当前可见批次做短 stagger（virtualizer.getVirtualItems() 返回的项），或只在初次加载第一页时做。滚动加载的新批次不做 stagger。

**实现口径**：只在首次加载当前列表时加动画 class（用 `useRef` 记录 `tracks` 引用，引用变化时重置动画标记）。每次虚拟行挂载时不重新动画。

**⚠️ 不能动 transform**：虚拟列表定位依赖内联 `transform: translateY(...)`，列表出现动画只能动 opacity，或在行内部包一层 div 做视觉动画，不能直接给 `.song-list__row` 做 transform 动画。

**⚠️ 无障碍**：加 `@media (prefers-reduced-motion: reduce)` 关闭非必要动画。

### C. 按钮点击反馈

`playerbar.css` 已有 :active 缩放（line 74），本任务是扩展到哪些按钮：

- 工具栏所有 `.player-bar__btn` 按钮
- 侧边栏导航按钮
- 歌曲列表的收藏按钮

### D. 播放按钮图标变形

- play↔pause 切换时两图标交叉淡入淡出（200ms）
- 复用现有 `playPulse` 状态
- 实现：两个 SVG 叠加，opacity 交叉过渡

### 文件改动

| 文件 | 改动 |
|------|------|
| `src/styles/content.css` | 调整页面切换过渡参数 |
| `src/styles/songlist.css` | 列表项 staggered fade-in + prefers-reduced-motion |
| `src/styles/playerbar.css` | 扩展 :active 微动画到更多按钮 |
| `src/components/PlayerBar.tsx` | 播放按钮图标交叉淡入淡出 |

---

## 任务二：歌单封面

### "第一首歌"定义

取歌单默认顺序（`playlist_songs.sort_order ASC`）里的第一首。如果第一首没有 coverPath，显示占位图，不向后找第二首。

### 数据流（避免 N+1 查询）

扩展现有 `playlists:getAll` IPC，一次返回 coverPath。不新增 IPC。

**改动链**：
1. `src/types/index.ts` — Playlist 类型加 `coverPath: string | null`
2. `src/types/ipc.ts` — `playlists:getAll` 返回类型更新
3. `electron/ipc/playlists.ts` — `playlists:getAll` SQL JOIN 取第一首歌的 coverPath
4. `src/pages/Playlists.tsx` — 渲染封面图片

### 文件改动

| 文件 | 改动 |
|------|------|
| `src/types/index.ts` | Playlist 加 `coverPath` 字段 |
| `src/types/ipc.ts` | playlists:getAll 返回类型更新 |
| `electron/ipc/playlists.ts` | 用子查询取第一首歌 coverPath（避免 JOIN 破坏现有 song_count 逻辑） |
| `src/pages/Playlists.tsx` | 渲染封面 + 无封面占位图 |

---

## 任务三：播放列表面板

### 歌词入口明确

- 删除 PlayerBar 右侧的歌词菜单按钮（line 314-323）
- **保留**封面点击进歌词（line 216 不动）
- 新增播放列表按钮替代歌词按钮位置

### SongList 高度适配

SongList 当前内部滚动高度是 `calc(100vh - 260px)`，塞进半高弹层会不匹配。

**方案**：给 SongList 增加 `containerHeight` 可选 prop，允许外部控制滚动容器高度。默认值保持现有行为，播放列表面板传入具体高度。

### 自动滚动

SongList 用虚拟列表，当前歌曲可能没挂载。不能用 scrollIntoView。

**方案**：SongList 改为 `forwardRef` + `useImperativeHandle`，暴露 `scrollToTrackId(trackId)` 方法。导出 `SongListHandle` 类型。PlaylistPanel 用 ref 调用，内部 `tracks.findIndex(t => t.id === trackId)` 后 `virtualizer.scrollToIndex(index, { align: 'center' })`。

### 面板设计

- 位置：固定在 PlayerBar 上方
- 动画：从底部滑入（translateY 100%→0，200ms ease）
- 背景：半透明遮罩（点击关闭）
- 内容：SongList 组件，showIndex=true，showAlbum=false
- 高度：`min(headerHeight + rowCount * 44, window.innerHeight * 0.5)`，空队列留固定高度 120px
- 关闭：点击面板外区域 / 再次点击按钮 / Esc 键
- 自动滚动：打开时 + 切歌时，scrollToTrackId 当前歌曲

### Feature Flags 关系

播放列表面板按钮受 `featureFlags.playback` 控制（它是当前播放队列），不受 `featureFlags.playlists` 控制（歌单管理是独立功能）。

### 文件改动

| 文件 | 改动 |
|------|------|
| `src/components/PlayerBar.tsx` | 删除歌词按钮、新增播放列表按钮 + 面板状态 |
| `src/components/PlaylistPanel.tsx`（新建） | 底部弹出面板组件 |
| `src/styles/playlist-panel.css`（新建） | 面板样式 + 滑入动画 |
| `src/components/SongList.tsx` | 增加 `containerHeight` prop + `scrollToTrackId` 方法 |

---

## 前置条件

1. 读取 `src/styles/content.css` — 现有淡入动画参数
2. 读取 `src/styles/playerbar.css` — 现有 :active 样式
3. 读取 `src/styles/songlist.css` — 列表样式
4. 读取 `src/components/SongList.tsx` — 虚拟列表和滚动逻辑
5. 读取 `electron/ipc/playlists.ts` — 现有 playlists:getAll SQL
6. 读取 `src/types/index.ts` — Playlist 类型定义
7. 读取 `src/types/ipc.ts` — IPC 类型定义

## 验证方法

1. `npx tsc --noEmit` — TypeScript 检查
2. `npm test` — 全量测试通过（以实际输出为准）
3. `npm run build` — 构建检查
4. `npm run dev` — 手动验证：
   - 导航切换有淡入淡出
   - 歌曲列表有逐行淡入（滚动到后面不会延迟）
   - 按钮点击有微动画
   - 播放按钮图标切换有变形效果
   - 歌单页面显示封面（有封面/无封面）
   - 播放列表面板弹出/关闭/自动滚动/遮罩点击/Esc 关闭
   - `@media (prefers-reduced-motion: reduce)` 关闭动画

## 测试计划

| 测试点 | 覆盖方式 |
|--------|----------|
| 歌单封面数据（有封面/无封面/空歌单） | 单元测试 |
| 播放列表面板开关状态 | 组件测试 |
| 面板外点击关闭 | 组件测试 |
| 再次点击按钮关闭 | 组件测试 |
| 当前歌曲变化后滚动 | 组件测试 |
| SongList containerHeight 参数 | 组件测试 |

---

*方案就绪，等主人确认后按顺序执行。*
