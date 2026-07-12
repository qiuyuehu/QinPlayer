# 迷你播放器三视图实施方案

> **For Hermes:** 严格按任务顺序实施；每个任务先写失败测试，再写最小实现。不要自动提交 Git，由主人决定何时提交。
>
> 创建：2026-07-10  
> 修订：2026-07-10（Codex 对照当前源码重审并重写）  
> 状态：待主人确认

## 审查结论

原方案方向可行，但不能直接实施。以下问题已在本版中修正：

| 原方案问题 | 当前源码事实 | 本版修正 |
|---|---|---|
| 复用不存在的 `useLyrics` | 歌词加载仍在 `src/pages/Lyrics.tsx` 的局部 effect 中 | 抽出 `useTrackLyrics`，歌词页和迷你播放器共享加载与竞态保护 |
| 建议新增 `songs:getLyrics` | 项目已有强类型 IPC `read-lrc-file` | 继续使用现有 IPC，不新增通道、不改 preload |
| “复用 LyricsPanel / PlaylistPanel” | 两者都是全尺寸页面/侧栏组件，带自身布局、关闭和滚动语义 | 复用数据与业务动作，新增专用紧凑视图，不嵌入完整组件 |
| 在 MiniPlayer 复制 `handlePlayTrack` | `SongList`、`PlaylistPanel` 和 playerStore 已有三份相同播放记账逻辑 | 新增 `playerStore.playTrack(track)`，所有入口共享同一动作 |
| 移除展开按钮 | 展开与关闭语义不同；移除后会造成能力回退 | 始终保留展开按钮和关闭按钮 |
| 只有歌词/队列按钮，却要求三视图当前按钮高亮 | 默认视图没有对应按钮，交互定义矛盾 | 使用“歌曲 / 歌词 / 队列”三段选择器，始终恰好一个选中 |
| 目标高度改为 130px | 130px 无法稳定容纳两行队列、视图内容和底部控制栏 | 基准尺寸定为 `400×150`，三视图切换时不改变窗口尺寸 |
| 要求同步修改 `main.ts` | 迷你尺寸只存在于 `electron/ipc/window.ts` | 只修改真实尺寸入口，并抽成文件内常量 |
| 只检查 `npx tsc --noEmit` | 根 tsconfig 不是项目最终构建门禁 | 定向测试后统一运行 `npm run verify` |
| 未考虑 feature flag、空状态和主题 | `lyrics`、`queuePanel` 可独立关闭，项目支持深浅主题 | 明确定义入口隐藏、视图回退、空状态和主题变量约束 |

---

## 前置条件

- 身份：你是 work profile 的 Hermes Agent，负责按本方案实现迷你播放器三视图。
- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`
- WSL 路径：`/mnt/c/Users/秋月/Desktop/QinPlayer`
- 技术栈：Electron 31、React 18、TypeScript、Zustand、Vitest、Testing Library。
- 开工前必读：`SPEC.md` → `harness/SPEC.md` → `harness/CONSTRAINTS.md` → `harness/DECISIONS.md` → `harness/TEST_CONVENTIONS.md` → `docs/devlog/devlog-20260710.md`。
- 最终验证：`npm run verify`，不要用单独的 `npx tsc --noEmit` 代替生产构建。
- Git 约束：先执行 `git status --short`；不得覆盖或回滚主人已有改动；不要自动提交。
- 禁止事项：不新增依赖，不新增 IPC，不修改 preload，不把歌词放进 Zustand，不动态改变三种视图的窗口尺寸，不顺手重做主播放器 UI。

## Goal

在保留现有播放控制、展开/关闭行为和窗口恢复逻辑的前提下，为迷你播放器增加三种可切换视图：

1. **歌曲视图**：封面、歌曲信息、进度条。
2. **歌词视图**：当前歌词与下一句，跟随播放时间更新。
3. **队列视图**：紧凑播放队列，可定位当前歌曲并点击切歌。

底部始终保留播放控制和三段视图选择；所有视图使用同一 `400×150` 基准窗口，不因切换发生跳动。

## Non-goals

- 不把全尺寸 `LyricsPanel` 压缩后嵌入迷你窗口。
- 不把侧栏 `PlaylistPanel` 直接挂进迷你窗口。
- 不新增歌词缓存、歌词联网搜索、队列拖拽排序或删除能力。
- 不改变播放模式、淡入淡出、窗口 bounds 持久化和托盘行为。
- 不新增 feature flag；继续使用现有 `miniMode`、`lyrics`、`queuePanel`、`playback`。
- 不在本任务中统一改造主界面的所有布局与图标。

---

## Architecture

### 1. 共享歌词加载，不共享页面布局

新增 `src/hooks/useTrackLyrics.ts`：

```ts
export function useTrackLyrics(track: Track | null): LyricLine[]
```

- 继续通过 `window.electronAPI.invoke('read-lrc-file', lrcPath)` 读取同名 `.lrc`。
- 内部调用现有 `parseLrc()`。
- Hook 持有局部 `{ trackId, lines }` 和递增 request token，保证 A→B→A 快速切歌时迟到结果不能覆盖当前歌曲。
- 加载 effect 以 `track?.id` 和 `track?.filePath` 为依赖；同一 Track 对象引用变化时不重复读取，路径变化时必须重新读取。
- `track === null`、文件不存在、空内容、IPC reject 都返回空数组。
- 返回值必须与当前 `track.id` 绑定，旧歌歌词不能在新歌加载期间闪现。
- `Lyrics.tsx` 和 `MiniPlayer.tsx` 分别调用该 Hook；数据仍是组件局部状态，不进入 playerStore。
- `Lyrics.tsx` 中封面主色提取保留为独立 effect，并使用独立 token 防止颜色竞态；不能因抽取歌词 Hook 丢掉现有保护。

歌词索引继续从高频 `currentTimeRef` 读取，并调用现有 `findCurrentLyricIndex(lyrics, currentTime + lyricOffset)`；不要再复制一份二分查找。

### 2. 共享“开始播放某首歌”业务动作

在 `playerStore` 新增：

```ts
playTrack: (track: Track) => void
```

该动作是“用户要求立即播放这首歌”的统一入口，必须原子完成：

- `playback=false` 时直接返回。
- 重置 `currentTimeRef`。
- 设置 `currentTrack`、`duration`、`isPlaying: true`。
- `recent=true` 时调用 `songs:recordPlay`。
- 始终调用 `songs:updatePlayCount`。

`SongList` 仍先设置其来源列表为 playlist，再调用 `playTrack(track)`；`PlaylistPanel`、迷你队列和 `nextTrack`/`prevTrack` 也使用该动作。低层 setter `setCurrentTrack` 保留，语义仍是“只换状态，不记一次播放”。

### 3. MiniPlayer 只负责壳层和编排

- `MiniPlayer.tsx` 持有 `miniView: 'default' | 'lyrics' | 'queue'`。
- 新建 `MiniLyricsView.tsx` 和 `MiniQueueView.tsx`，避免继续把 263 行的 MiniPlayer 膨胀成一个大组件。
- 两个子组件使用 props，不直接创建第二套全局状态：

```ts
interface MiniLyricsViewProps {
  currentTrack: Track | null
  lyrics: LyricLine[]
  currentIndex: number
}

interface MiniQueueViewProps {
  tracks: Track[]
  currentTrackId: number | null
  onPlay: (track: Track) => void
}
```

- `MiniPlayer` 负责从 store 取值、加载歌词、计算当前歌词索引、切换视图和传递 `playTrack`。
- 默认视图可以保留在 `MiniPlayer.tsx` 内，因为它就是现有主体，不额外为一次使用建立组件。

### 4. 固定壳层与交互契约

窗口内容分为两行：

1. 上方 `content`：根据 `miniView` 渲染歌曲、歌词或队列。
2. 下方 `toolbar`：音量、上一首、播放/暂停、下一首、三段视图选择、展开。

关闭按钮固定在右上角，三个视图始终可见；展开按钮固定在底部工具栏。所有按钮和队列行必须声明 `-webkit-app-region: no-drag`，其余空白区域继续可拖动窗口。

三段选择器规则：

- 使用现有 `IconMusic` 表示歌曲视图。
- 新增且只新增 `IconLyrics` 表示歌词视图。
- 使用现有 `IconList` 表示队列视图。
- 选择器使用 `role="group"`、`aria-label="迷你播放器视图"`，按钮使用 `aria-pressed`、`aria-label` 和 `title`。
- 点击按钮直接选择对应视图；再次点击当前按钮保持当前视图，不使用“再点一次回默认”的隐藏规则。
- 任意时刻恰好一个可见视图按钮处于 active 状态。

### 5. Feature flag 与状态矩阵

| 条件 | 行为 |
|---|---|
| `playback=false` 或 `miniMode=false` | 保持 MiniPlayer 现有不渲染行为 |
| `lyrics=false` | 不渲染歌词选择按钮；若当前恰为歌词视图，立即回到歌曲视图 |
| `queuePanel=false` | 不渲染队列选择按钮；若当前恰为队列视图，立即回到歌曲视图 |
| 无当前歌曲 | 歌曲/歌词视图显示“未在播放”；播放按钮仍遵循现有行为 |
| 当前歌曲无 `.lrc` | 歌词内容区保持空白，遵循现有 SPEC，不显示“暂无歌词” |
| 空播放队列 | 队列视图显示“当前播放队列为空” |
| 退出再进入迷你模式 | MiniPlayer 重新挂载，视图回到歌曲视图 |
| 深色/浅色主题 | 只使用现有 theme token，不写只适合深色的白色透明背景 |

---

## 改动范围

| 类型 | 文件 | 改动 |
|---|---|---|
| Create | `src/hooks/useTrackLyrics.ts` | 共享 LRC 加载和竞态保护 |
| Create | `src/components/MiniLyricsView.tsx` | 两行紧凑歌词视图 |
| Create | `src/components/MiniQueueView.tsx` | 两行可滚动紧凑队列 |
| Modify | `src/stores/playerStore.ts` | 新增 `playTrack` 并统一切歌记账路径 |
| Modify | `src/components/SongList.tsx` | 设置 playlist 后改用 `playTrack` |
| Modify | `src/components/PlaylistPanel.tsx` | 改用 `playTrack`，删除局部重复业务逻辑 |
| Modify | `src/pages/Lyrics.tsx` | 使用共享歌词 Hook；保留独立封面颜色竞态保护 |
| Modify | `src/components/Icons.tsx` | 只新增 `IconLyrics`，复用现有 `IconMusic`/`IconList`/`IconExpand` |
| Modify | `src/components/MiniPlayer.tsx` | 三视图编排、选择器、共享 RAF 与 feature flag 回退 |
| Modify | `src/styles/miniplayer.css` | 固定两行壳层、歌词/队列/active/主题/拖拽样式 |
| Modify | `electron/ipc/window.ts` | 迷你基准尺寸调整为 `400×150`，提取尺寸常量 |
| Create | `tests/useTrackLyrics.test.tsx` | Hook 加载、空状态和竞态测试 |
| Create | `tests/MiniLyricsView.test.tsx` | 歌词紧凑渲染契约 |
| Create | `tests/MiniQueueView.test.tsx` | 队列渲染、定位和点击契约 |
| Create | `tests/MiniPlayer.test.tsx` | 三视图、控制保留、flags 和退出语义测试 |
| Modify | `tests/playerStore.test.ts` | `playTrack` 与 next/prev 统一路径测试 |
| Modify | `tests/SongList.test.tsx` | 列表播放改用共享 action 后的回归测试 |
| Modify | `tests/PlaylistPanel.test.tsx` | 队列面板播放与记账回归测试 |
| Modify | `SPEC.md` | 更新迷你模式能力、尺寸和歌词状态负责人 |
| Modify | `harness/CONSTRAINTS.md` | 更新迷你窗口规范 |
| Modify | `harness/DECISIONS.md` | 记录固定壳层和复用边界决策 |
| Create after implementation | `docs/devlog/devlog-20260710-miniplayer-three-views.md` | 记录真实实现与验证结果 |

明确不修改：`src/types/ipc.ts`、`electron/preload.ts`、`electron/main.ts`、`package.json`、feature flag 数量。

---

## Task 0：基线与保护

**Objective:** 确认实施从已知基线开始，避免把已有失败或主人改动误算成本任务结果。

### Step 1：检查工作区

Run：

```bash
git status --short
```

记录已有修改；只处理本方案列出的文件。遇到同文件已有主人改动时，应在其基础上编辑，不得 reset/checkout。

### Step 2：运行定向基线

Run：

```bash
npx vitest run tests/playerStore.test.ts tests/SongList.test.tsx tests/PlaylistPanel.test.tsx tests/LyricsPanel.test.tsx tests/LyricsFullscreen.test.tsx
```

Expected：现有测试通过。若已有失败，先记录并报告，不把无关失败混入实现。

---

## Task 1：统一播放入口

**Objective:** 在制作迷你队列前，先消除会被复制的切歌与播放记账逻辑。

**Files:**

- Modify: `src/stores/playerStore.ts`
- Modify: `src/components/SongList.tsx`
- Modify: `src/components/PlaylistPanel.tsx`
- Test: `tests/playerStore.test.ts`
- Test: `tests/SongList.test.tsx`
- Test: `tests/PlaylistPanel.test.tsx`

### Step 1：先写失败测试

在 `tests/playerStore.test.ts` 增加：

1. `playTrack` 在 playback 开启时把当前歌曲、duration、isPlaying 和 `currentTimeRef` 一次性更新正确。
2. `recent=true` 时各调用一次 `songs:recordPlay`、`songs:updatePlayCount`。
3. `recent=false` 时不记录最近播放，但仍更新播放次数。
4. `playback=false` 时不改状态、不调用两个 IPC。
5. 现有 next/prev 测试继续证明顺序、循环边界和随机模式行为不变。

在组件测试中锁住 wiring：

- `SongList` 点击歌曲仍先把当前页面歌曲设为 playlist，再开始播放。
- `playback=false` 时 `SongList` 保留现有入口 guard，playlist 也不能被改写。
- `PlaylistPanel` 点击歌曲不改变 playlist，只开始播放选中歌曲。
- 两个入口都只产生一组播放记账 IPC，不能因旧逻辑残留而重复调用。

### Step 2：确认测试先失败

Run：

```bash
npx vitest run tests/playerStore.test.ts tests/SongList.test.tsx tests/PlaylistPanel.test.tsx
```

Expected：新增用例因 store 尚无 `playTrack` 失败。

### Step 3：实现最小共享动作

- 在 `PlayerState` 增加 `playTrack`。
- 把状态更新和两个 IPC 集中到该 action。
- `nextTrack`、`prevTrack` 只负责选择目标曲目，随后调用 `get().playTrack(target)`。
- `SongList` 保留最外层 `featureFlags.playback` guard 和 `setPlaylist(tracks)`，删除局部 `setCurrentTrack`、`setPlaying` 和记账 IPC。
- `PlaylistPanel` 删除局部重复逻辑，直接调用 store action。

### Step 4：验证

Run：

```bash
npx vitest run tests/playerStore.test.ts tests/SongList.test.tsx tests/PlaylistPanel.test.tsx
```

**完成标准：**

- [ ] 所有立即播放入口共享一条业务路径。
- [ ] 每次播放只记录一次，不重复计数。
- [ ] `setCurrentTrack` 的低层语义不变。
- [ ] next/prev 与 feature flag 行为无回归。

---

## Task 2：抽取共享歌词加载 Hook

**Objective:** 让全尺寸歌词页和迷你歌词视图共享正确的读取、解析与竞态保护，不共享页面 CSS。

**Files:**

- Create: `src/hooks/useTrackLyrics.ts`
- Modify: `src/pages/Lyrics.tsx`
- Create test: `tests/useTrackLyrics.test.tsx`
- Regression: `tests/LyricsPanel.test.tsx`
- Regression: `tests/LyricsFullscreen.test.tsx`

### Step 1：先写 Hook 失败测试

使用 `renderHook` 和可控 Promise 覆盖：

1. 音频 `C:\music\a.mp3` 应调用 `read-lrc-file` 读取 `C:\music\a.lrc` 并返回 `parseLrc` 后的行。
2. `track=null` 不调用 IPC，并立即返回空数组。
3. IPC 返回 `null`、空字符串或 reject 时返回空数组，不抛出未处理异常。
4. 从 A 切到 B 时，在 B 结果返回前不显示 A 的歌词。
5. 快速 A→B→A 时，第一次 A 和 B 的迟到 Promise 都不能覆盖最后一次 A 的结果。
6. Hook unmount 后迟到 Promise 不触发状态更新警告。

### Step 2：确认测试先失败

Run：

```bash
npx vitest run tests/useTrackLyrics.test.tsx
```

Expected：模块尚不存在，测试失败。

### Step 3：实现 Hook 并迁移 Lyrics

- Hook 内部维护 request token 和 track-bound result。
- effect cleanup 使当前 token 失效。
- `Lyrics.tsx` 删除原 LRC 读取 effect 和 `lrcRequestRef`，改用 `useTrackLyrics(currentTrack)`。
- 曲目变化或歌词清空时把 `lyricsCurrentIndex` 重置为 `-1`。
- 现有 RAF 中用 `findCurrentLyricIndex` 替换内联二分查找，并在空歌词时也能把旧索引重置为 `-1`。
- 把封面主色提取留在 `Lyrics.tsx` 的独立 effect；新增独立 `colorRequestRef`，继续阻止旧封面颜色覆盖新歌。
- 保留 `LyricsPanel key={currentTrack.id}`、全屏、置顶、点击歌词跳转和行数 feature flag 的现有行为。

### Step 4：验证歌词回归

Run：

```bash
npx vitest run tests/useTrackLyrics.test.tsx tests/LyricsPanel.test.tsx tests/LyricsFullscreen.test.tsx
```

**完成标准：**

- [ ] 没有新增 IPC 通道。
- [ ] 切歌期间不闪现旧歌词。
- [ ] A→B→A 竞态测试通过。
- [ ] 全尺寸歌词页外观和交互不回归。
- [ ] 歌词数据仍未进入 Zustand。

---

## Task 3：实现两个紧凑视图与图标

**Objective:** 先以独立、可测试的展示组件定义迷你歌词和迷你队列，再接入 MiniPlayer。

**Files:**

- Modify: `src/components/Icons.tsx`
- Create: `src/components/MiniLyricsView.tsx`
- Create: `src/components/MiniQueueView.tsx`
- Create test: `tests/MiniLyricsView.test.tsx`
- Create test: `tests/MiniQueueView.test.tsx`

### Step 1：先写展示契约测试

`MiniLyricsView`：

1. 无当前歌曲时显示“未在播放”。
2. 有歌曲但无歌词时内容区为空，不显示新增提示文字。
3. `currentIndex >= 0` 时显示当前行和下一行，并给当前行 active 状态。
4. `currentIndex === -1` 时只把第一行作为 upcoming 显示，不错误高亮。
5. 双语行保留 translation；长文本由结构提供可截断容器。
6. 最后一行播放时不访问越界的下一行。

`MiniQueueView`：

1. 空数组显示“当前播放队列为空”。
2. 每行显示封面/占位、歌名、歌手和格式化时长。
3. 当前歌曲带 `aria-current="true"` 和 active 类。
4. 点击非当前歌曲只调用一次 `onPlay(track)`。
5. 当前歌曲变化时调用 `scrollIntoView({ block: 'nearest', behavior: 'auto' })`；测试文件局部 mock 该方法，不污染全局 setup。
6. 封面加载失败后显示占位，不出现破图。

### Step 2：确认测试先失败

Run：

```bash
npx vitest run tests/MiniLyricsView.test.tsx tests/MiniQueueView.test.tsx
```

### Step 3：实现组件和图标

- `IconLyrics` 使用现有图标库统一的 `20×20` viewBox、`strokeWidth={1.5}`、round cap/join。
- 不新增 `IconMore`；默认和队列图标已有可复用实现。
- 迷你歌词只渲染当前和下一条逻辑行，不使用 `LyricsPanel` 的 `35vh` spacer、全页字号和 scrollTo。
- 每条歌词最多两行（原文 + 翻译），超长文本单行省略，不能撑高壳层。
- 队列列表本身可纵向滚动，固定行高，基准高度下至少完整显示两项。
- 队列组件不含关闭、清空队列、Esc 监听或 footer；这些属于全尺寸 `PlaylistPanel`。

### Step 4：验证

Run：

```bash
npx vitest run tests/MiniLyricsView.test.tsx tests/MiniQueueView.test.tsx
```

---

## Task 4：接入 MiniPlayer 三视图

**Objective:** 以固定壳层编排三种视图，同时保留所有现有播放器能力。

**Files:**

- Modify: `src/components/MiniPlayer.tsx`
- Create test: `tests/MiniPlayer.test.tsx`

### Step 1：先写集成失败测试

至少覆盖：

1. 初始选中歌曲视图，三段选择器中恰好一个 `aria-pressed=true`。
2. 点击歌词、队列、歌曲按钮可直接切换对应内容；点击当前按钮不会跳到别的视图。
3. 每个视图都保留音量、上一首、播放/暂停、下一首、展开和关闭。
4. 展开只执行 `setMiniMode(false)`；关闭还执行 `setActiveNav('local')`，两者语义不能合并。
5. `lyrics=false` 时无歌词按钮；`queuePanel=false` 时无队列按钮。
6. active 视图对应的 flag 被关闭时自动回到歌曲视图。
7. unmount 后重新 mount，视图回到歌曲视图。
8. `playback=false` 或 `miniMode=false` 时不渲染。
9. 队列点击通过 store 的 `playTrack`，不在 MiniPlayer 产生第二组 IPC。
10. 使用可控 RAF 推进 `currentTimeRef` 后，歌词视图的 active 行随 `findCurrentLyricIndex` 结果变化；测试结束必须恢复 RAF mock。
11. `lyrics=false`、`playback=false` 或 `miniMode=false` 时不调用 `read-lrc-file`，禁用入口不能在后台继续执行歌词逻辑。

### Step 2：确认测试先失败

Run：

```bash
npx vitest run tests/MiniPlayer.test.tsx
```

### Step 3：实现壳层与 RAF

- 新增 `MiniView` 联合类型和初始 `'default'` 状态。
- 无条件调用 Hook 以遵守调用顺序，但参数使用 `useTrackLyrics(featureFlags.playback && featureFlags.miniMode && featureFlags.lyrics ? currentTrack : null)`；关闭功能时不得发起歌词 IPC。
- 用 refs 同步 `lyrics`、`lyricOffset` 和 `miniView` 给现有 RAF。
- 一个 RAF 同时完成：
  - 默认视图存在对应 DOM ref 时更新进度条与时间文本。
  - 歌词视图激活时调用 `findCurrentLyricIndex`，仅索引变化时 `setState`。
  - 歌词清空或切歌时把索引重置为 `-1`。
- 不要求 `miniView === 'default'` 才运行整个 RAF；其他视图中进度 DOM ref 为 null 时安全跳过即可。
- 右上关闭按钮移到共同壳层，确保歌词和队列视图也能退出。
- 三段选择器按 feature flag 过滤；effect 负责非法 active view 回退。

### Step 4：验证组件集成

Run：

```bash
npx vitest run tests/MiniPlayer.test.tsx tests/MiniLyricsView.test.tsx tests/MiniQueueView.test.tsx tests/useTrackLyrics.test.tsx
```

**完成标准：**

- [ ] 三个视图均可直接选择，active 状态唯一。
- [ ] 播放控制、音量、展开和关闭无回退。
- [ ] RAF 在切换视图后不重复注册、不泄漏。
- [ ] 歌词索引只在行变化时触发 React 更新。
- [ ] feature flag 的入口和行为同时关闭。

---

## Task 5：布局、主题、拖拽与窗口尺寸

**Objective:** 在 `400×150` 基准窗口中稳定容纳三视图，深浅主题一致，交互区域不与窗口拖拽冲突。

**Files:**

- Modify: `src/styles/miniplayer.css`
- Modify: `electron/ipc/window.ts`

### Step 1：建立固定两行布局

- `.mini-player` 使用 `content minmax(0, 1fr) + toolbar 固定高度` 的两行布局。
- 内容区必须有 `min-width: 0`、`min-height: 0`，避免长歌名或队列把窗口撑开。
- 工具栏按钮尺寸稳定；play 按钮可保持现有主次层级，但 hover/active 不能改变布局尺寸。
- 关闭按钮绝对定位在右上角，内容区预留空间，不能覆盖歌词、时长或滚动条。
- 歌词、标题、歌手使用省略号；不按 viewport width 缩放字体。
- 队列行、封面、时长列使用固定约束，滚动时不发生横向抖动。

### Step 2：主题与无障碍样式

- active 使用 `var(--accent)`、`var(--accent-subtle)` 或 `var(--control-active)`。
- hover、边框、文字、背景只使用 `themes.css` 已有 token，例如 `--control-hover`、`--border-subtle`、`--text-*`。
- 不使用 `rgba(255, 255, 255, ...)` 作为跨主题状态色。
- 键盘 focus 使用可见的 `:focus-visible`，不能只靠颜色区分当前视图。
- `prefers-reduced-motion: reduce` 下禁用新增的视图/高亮过渡。
- 所有 button、range、队列行和滚动区显式 `-webkit-app-region: no-drag`；其余壳层保留 drag。

### Step 3：修改真实窗口入口

在 `electron/ipc/window.ts` 迷你模式 handler 附近定义单一来源：

```ts
const MINI_PLAYER_WIDTH = 400
const MINI_PLAYER_HEIGHT = 150
```

进入迷你模式时，`setMinimumSize` 和 `setSize` 都使用这两个常量。退出时继续恢复 `800×600` 最小尺寸和进入前 normal bounds；不修改 `electron/main.ts`，不在视图切换时发送窗口 IPC。

### Step 4：生产构建验证

Run：

```bash
npm run build
```

Expected：renderer、preload、main 三段生产构建通过。

**完成标准：**

- [ ] 400×150 下至少完整显示两项紧凑队列。
- [ ] 三视图切换时窗口尺寸和位置不跳动。
- [ ] 深浅主题均无“白底白 hover”或“深色硬编码”问题。
- [ ] 长歌名、长歌手、双语歌词不覆盖关闭按钮或工具栏。
- [ ] 队列行可点击，空白区仍可拖动窗口。

---

## Task 6：规格同步、全量验证与开发记录

**Objective:** 消除文档中的旧尺寸和旧状态负责人描述，并留下可供 Codex 复审的真实结果。

**Files:**

- Modify: `SPEC.md`
- Modify: `harness/CONSTRAINTS.md`
- Modify: `harness/DECISIONS.md`
- Create: `docs/devlog/devlog-20260710-miniplayer-three-views.md`

### Step 1：同步规格

`SPEC.md` 至少更新：

- 迷你模式从旧 `300×80` 描述改为 `400×150` 三视图。
- 记录歌曲/歌词/队列视图及现有 feature flag 约束。
- 状态负责人从“歌词数据由 Lyrics.tsx 局部 state 管理”改为“歌词数据由 `useTrackLyrics` 的组件局部 state 管理，禁止进入 playerStore”。
- 文件树加入新 Hook 和两个迷你子组件；不要手工维护容易失真的文件行数。

`harness/CONSTRAINTS.md`：

- 把迷你模式规范更新为 `400×150` 基准窗口、固定壳层、交互元素必须 no-drag。

`harness/DECISIONS.md` 新增一条决策：

- 三种迷你视图共用固定窗口尺寸，避免切换抖动。
- 复用歌词数据 Hook 和 store 播放动作，不复用全尺寸页面组件。

### Step 2：运行最终门禁

Run：

```bash
npm run verify
```

Expected：Harness checks、生产构建和全量 Vitest 全部通过，0 failed。

### Step 3：记录真实结果

Devlog 必须记录：

- 最终采用的尺寸和三视图交互。
- 新增/修改文件。
- 新增测试名称和数量。
- `npm run verify` 的真实输出摘要。
- 主人尚未执行的视觉检查写“待主人验证”，不能提前写成已通过。

---

## 整体验收标准

1. `npm run verify` 全绿，0 failed。
2. 迷你播放器有歌曲、歌词、队列三个明确入口，任意时刻恰好一个入口高亮。
3. 三视图切换不改变 BrowserWindow 尺寸或位置。
4. 默认视图的封面、歌名、歌手、进度和时长仍正常。
5. 歌词跟随播放时间更新；切歌、快速 A→B→A、无 LRC 时不显示旧歌词。
6. 队列自动定位当前歌曲，点击其他歌曲只触发一次播放和一次播放次数更新。
7. 音量、上一首、播放/暂停、下一首、展开、关闭在三个视图中都可用。
8. `lyrics` / `queuePanel` 关闭时，入口与对应行为一起消失，并安全回退到歌曲视图。
9. 深色、浅色、减少动态效果模式下均可读且无布局重叠。
10. 退出迷你模式恢复进入前窗口 bounds；重新进入时默认显示歌曲视图。

## 手动视觉与交互测试（主人执行）

1. 在深色和浅色主题各截取歌曲、歌词、队列三张 `400×150` 截图，检查层级与对齐。
2. 播放有单语歌词、双语歌词、无歌词的歌曲，确认内容不会撑高或闪旧歌词。
3. 使用超长歌名、歌手名和 20 首以上队列，确认省略、滚动、时长列和关闭按钮不重叠。
4. 在队列视图连续点选不同歌曲，确认当前行、封面、歌词和声音同步切换，播放次数没有重复增加。
5. 三个视图分别操作音量、上一首、播放/暂停、下一首和展开。
6. 分别点击展开与关闭：展开保留当前主界面导航，关闭返回本地音乐页。
7. 拖动迷你窗口空白处；再点击按钮、进度条和队列行，确认交互不会被 drag 区吞掉。
8. 退出后移动/调整主窗口，再进出迷你模式，确认 normal bounds 正确恢复。
9. 用 feature flag 分别关闭 `lyrics`、`queuePanel`，确认入口和 active 回退行为。
10. 开启 Windows“减少动画效果”后重启，确认没有新增过渡但功能完整。

## 实施后审查交接

实现完成后交给 Codex 独立审查，最小审查包包含：

- 本方案文件。
- `git status --short`。
- 本任务全部源码和测试的 `git diff`。
- `npm run verify` 输出摘要。
- 深浅主题三视图截图，以及主人手动测试中发现的任何偏差。
