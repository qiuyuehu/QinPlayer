# 动画系统统一与交互覆盖实施方案

> **For Hermes:** 严格按任务顺序实施；每项先写失败测试，再写最小实现。不要自动提交 Git，由主人决定何时提交。
>
> 创建：2026-07-11
> 修订：2026-07-11（Codex 对照当前源码重审并重写；完成独立程序员视角自审）
> 状态：待主人确认

## 审查结论

原方案目标合理，但直接实施会引入布局错位、状态归属错误、退出卡顿和无法验收的“全覆盖”承诺。本版先定义可证明的覆盖矩阵，再分阶段实施。

| 原方案问题 | 当前源码事实 / 风险 | 本版修正 |
|---|---|---|
| 把动画 token 复制到深浅两个主题块 | 时长与 easing 不随主题变化，复制会漂移 | token 放在 `themes.css` 的单一 `:root` 中 |
| 全局 `button:active { transform: scale(...) }` | 播放按钮 pulse、歌词按钮、侧栏、队列按钮已经使用 transform；全局规则会覆盖或叠加错误 | 使用独立 `scale` 属性，并把现有 press transform 迁移为统一变量 |
| 给歌曲行 keyframe 增加 `transform: translateY(4px)` | SongList 虚拟行用内联 transform 定位；动画 transform 会覆盖定位，导致可视行重叠到顶部 | 入场使用独立 `translate` 属性，不触碰定位 transform |
| 给专辑卡片动画 transform | 卡片 hover 已使用 transform，两个动画会互相抢属性 | 入场统一用 `translate` + opacity，与 hover transform 组合 |
| reduced motion 放进 playerStore | 它是 UI 偏好，与播放状态无关；playerStore 订阅还会触发无关播放设置保存 | 状态放 `uiStore`，显式持久化，根 Hook 负责 DOM 属性 |
| Settings 和 playerStore 都保存 reducedMotion | 会重复写 SQLite | 只由 Settings 写一次；App 启动只读取并水合 |
| 声称“不跟系统”，同时又要求 `prefers-reduced-motion` | 需求自相矛盾，还会回退现有无障碍行为 | 手动减少动画作为额外覆盖；系统减少动画始终继续生效 |
| 只缩短 CSS duration | `Content.tsx` 的歌词退出仍固定等待 300ms；JS 平滑滚动也不受 CSS 控制 | 提供 `isReducedMotionActive()`，所有 JS 动画分支同步使用 |
| 弹窗退场既要求本次做，又写“复杂可跳过” | 无法验收，关闭时组件会立即卸载 | 建立 `useExitTransition` 协议，弹窗和队列面板都必须完成退出再卸载 |
| 页面退场目标含糊 | 普通导航没有 presence 层，强做会扩大状态机 | 普通页面本次只做可靠入场；歌词页保留现有入/退场 |
| Content 用 effect 递增 `fadeKey` | 导航后新页面可能先以旧 wrapper 渲染，再二次 remount | 直接使用稳定的导航 key，删除派生 fadeKey state/effect |
| “所有按钮/所有列表/所有动画”没有边界 | 无法证明完成，也容易给拖拽条、虚拟滚动和高频进度加装饰动画 | 增加覆盖矩阵与明确排除项，每类均有自动或手动验收 |
| “只用 transform + opacity 就等于 GPU” | Chromium 是否合成由浏览器决定，不能保证 | 只承诺不新增 layout 动画，不使用 `will-change`，不做错误性能宣传 |
| 仍使用 `npx tsc --noEmit` | 不能替代 Electron 三段生产构建和 Harness | 定向测试后执行 `npm run verify` |

---

## 前置条件

- 身份：你是 work profile 的 Hermes Agent，负责按本方案实施动画系统统一。
- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`
- WSL 路径：`/mnt/c/Users/秋月/Desktop/QinPlayer`
- 技术栈：Electron 31、React 18、TypeScript、Zustand、Vitest、Testing Library。
- 开工前必读：`SPEC.md` → `harness/SPEC.md` → `harness/CONSTRAINTS.md` → `harness/DECISIONS.md` → `harness/TEST_CONVENTIONS.md` → 最新 devlog。
- 开工前先运行 `git status --short`。当前工作区可能含上一功能的 `SPEC.md`、MiniPlayer 源码和测试改动；不得覆盖、回滚或混入本任务。
- 建议先由主人提交上一功能源码，再实施本方案；若不提交，实施者必须逐文件保留并标注既有 diff。
- 最终验证：`npm run verify`；不能用 `npx tsc --noEmit` 代替。
- 禁止事项：不新增 npm 依赖，不引入动画库，不改音频淡入淡出，不把 motion 状态放入 playerStore，不使用 `will-change`，不为动画修改数据库 schema。

## Goal

建立一个可持续维护的 UI motion 系统，并覆盖以下用户可见路径：

1. 按钮按压反馈。
2. 主页面、迷你播放器三视图和弹出菜单入场。
3. 歌曲初始可见行、专辑卡片、歌单卡片、队列项入场。
4. 通用对话框和播放队列面板入场、退场。
5. 手动“减少动画”设置、持久化和启动恢复。
6. 系统 `prefers-reduced-motion` 与手动设置共同控制 CSS 和 JS 动画。

## Non-goals

- 不给普通主页面实现退场 presence；页面切换仅做入场，歌词页沿用现有专用退出状态机。
- 不做列表重排 FLIP 动画；专辑排序、歌单重命名和队列变化直接更新最终顺序。
- 不让虚拟列表滚动中新出现的批次反复入场；只动画每次数据集首次可见批次。
- 不给进度条、音量拖拽、窗口拖拽、滚动条、range thumb 增加入场或按压缩放。
- 不改变音频 `fadeIn/fadeOut`、歌词时间轴、RAF 更新频率或播放状态。
- 不把所有既有颜色 transition 强行改成同一速度；只统一空间运动、入退场、press 和 popup motion。
- 不持久化系统媒体查询结果；只持久化用户手动开关。

---

## 覆盖矩阵

| 类别 | 本次覆盖 | 明确不做 / 保留行为 |
|---|---|---|
| Button press | 所有原生 `<button>`；保留播放/收藏等不同 press 强度 | range、可拖拽 div 不缩放 |
| Main page | 普通导航内容 fade + 轻微水平进入 | 普通页面不做退出 |
| Lyrics page | 保留现有上下滑入/滑出；reduced motion 跳过 300ms 等待 | 不重写歌词页面状态机 |
| MiniPlayer | 根窗口既有 fade；default/lyrics/queue 视图切换轻微入场 | 不改变窗口尺寸和播放 RAF |
| Collections | SongList 首批行、Albums 卡片、Playlists 卡片、queue panel 项、mini queue 项 | 滚动产生的新虚拟行不重复动画 |
| Popup/menu | AlbumSortMenu、ContextMenu 入场 | 子菜单只沿用同一轻量入场，不做复杂轨迹 |
| Dialog | overlay fade + dialog scale/opacity 入场与退场 | 不改变表单校验和确认语义 |
| Queue panel | 侧栏 slide in / slide out | 不改变清空队列、自动定位和 Escape 语义 |
| Skeleton/switch | 保留现有效果，纳入 reduced motion 总开关 | 不重新设计视觉 |
| Hover/focus | 保留现有颜色/背景反馈 | 不以动画代替 focus-visible |

“全覆盖”的完成定义是：矩阵内每一类都有实现与验收，矩阵外每一类有明确排除理由；不是给每个 DOM 节点添加动画。

---

## Motion 契约

### Token 单一来源

在 `src/styles/themes.css` 的主题块之前新增：

```css
:root {
  --motion-duration-fast: 100ms;
  --motion-duration-standard: 180ms;
  --motion-duration-slow: 250ms;
  --motion-duration-page: 300ms;
  --motion-ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --motion-ease-emphasized: cubic-bezier(0.22, 1, 0.36, 1);
  --motion-distance-sm: 4px;
  --motion-distance-md: 8px;
  --motion-press-scale: 0.96;
  --motion-reduced-duration: 1ms;
}
```

- token 与主题颜色解耦，深浅主题不得复制。
- 新增空间动画只使用 opacity、独立 `translate`、独立 `scale` 或无冲突场景下的 transform。
- 定位所需 transform（虚拟行、居中 thumb、popover）不得被动画覆盖。
- 不新增 width/height/top/left 的装饰性动画；现有进度条直接更新不在本任务改造。

### Reduced motion 优先级

最终是否减少动画：

```text
manual reducedMotion === true OR system prefers-reduced-motion === reduce
```

- 手动开关关闭，只表示“取消手动覆盖”；系统仍为 reduce 时继续减少动画。
- `<html data-reduced-motion="true">` 只代表手动开关。
- CSS 同时覆盖 data 属性和系统媒体查询。
- JS 统一调用 `isReducedMotionActive()`，禁止各组件重新拼一份判断。

### 全局 CSS 降级

新建 `src/styles/motion.css` 并在 `global.css` 最后导入，确保覆盖组件样式：

```css
:root[data-reduced-motion="true"] *,
:root[data-reduced-motion="true"] *::before,
:root[data-reduced-motion="true"] *::after {
  animation-duration: var(--motion-reduced-duration) !important;
  animation-delay: 0ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: var(--motion-reduced-duration) !important;
  transition-delay: 0ms !important;
  scroll-behavior: auto !important;
}
```

在 `@media (prefers-reduced-motion: reduce)` 内提供同等规则。对 press 另行设置 `scale: 1`，防止“瞬间缩放”仍产生跳动。

---

## 状态与退出协议

### UI 状态归属

`src/stores/uiStore.ts` 新增：

```ts
reducedMotion: boolean
setReducedMotion: (value: boolean) => void
```

- 默认 `false`，表示没有手动覆盖。
- uiStore 保持纯状态，不直接访问 document 或 SQLite。
- Settings 负责一次 `settings:set`。
- App 水合负责一次 `settings:get`。
- `useReducedMotion` 根 Hook 用 `useLayoutEffect` 将 store 状态映射到 `<html>`，保证正常内容绘制前应用属性。

### 统一 JS 判断

新增 `src/utils/motionPreference.ts`：

```ts
export function applyReducedMotionAttribute(enabled: boolean): void
export function isReducedMotionActive(): boolean
```

- helper 必须兼容测试环境不存在 `matchMedia` 的情况。
- `isReducedMotionActive()` 同时检查 data 属性和系统媒体查询。
- LyricsPanel、Content 和 exit hook 复用该 helper。

### 退出协议

新增 `src/hooks/useExitTransition.ts`。它负责：

```ts
const {
  isExiting,
  requestExit,
  handleExitAnimationEnd,
} = useExitTransition({ onExited, fallbackMs })
```

- `isExiting` 状态。
- 幂等 `requestExit()`；重复点击、Escape、overlay 点击只能完成一次。
- reduced motion 时不等待 CSS，微任务内调用 `onExited`。
- 正常模式等待根元素 `animationend`；只接受 `event.target === event.currentTarget`。
- 安全 fallback timer，防止 CSS 类名或 animation event 异常时界面永久卡住。
- `fallbackMs` 只是一条略长于 CSS 动画的保险线，不负责正常视觉节奏；dialog 和 panel 分别传入明确值。
- 完成或 unmount 时清理 timer。

对话框和队列面板只负责把 `--exit` class、`onAnimationEnd` 和所有关闭入口接到该 Hook；父组件仍在 `onExited` 后卸载。

---

## 改动范围

| 类型 | 文件 | 改动 |
|---|---|---|
| Create | `src/styles/motion.css` | 手动/系统 reduced motion 最终覆盖 |
| Create | `src/utils/motionPreference.ts` | DOM 属性与 JS reduced motion 判断 |
| Create | `src/hooks/useReducedMotion.ts` | uiStore → html 的根级 layout effect |
| Create | `src/hooks/useExitTransition.ts` | 可测试的退出完成协议 |
| Modify | `src/styles/themes.css` | 增加单一 motion token 集合 |
| Modify | `src/styles/global.css` | 最后导入 motion.css |
| Modify | `src/styles/base.css` | 全局 button scale 基线 |
| Modify | `src/stores/uiStore.ts` | reducedMotion 状态/action |
| Modify | `src/App.tsx` | 调用 Hook，启动读取设置并水合 |
| Modify | `src/pages/Settings.tsx` | 通用设置中增加“减少动画”开关并单次保存 |
| Modify | `src/components/LyricsPanel.tsx` | 使用统一 JS helper |
| Modify | `src/components/Content.tsx` | 稳定页面 key；reduced motion 下立即结束歌词退出 |
| Modify | `src/components/CreatePlaylistDialog.tsx` | 入退场、异步确认后退出、重复提交保护 |
| Modify | `src/components/SongInfoDialog.tsx` | 所有关闭入口走退出协议 |
| Modify | `src/pages/Playlists.tsx` | 创建回调不再提前卸载 dialog |
| Modify | `src/components/PlaylistPanel.tsx` | close/Escape/back 统一走退出协议 |
| Modify | `src/components/SongList.tsx` | stagger index 改用 CSS 变量，不修改定位 transform |
| Modify | `src/styles/content.css` | 页面/歌词 motion token 与组合属性 |
| Modify | `src/styles/songlist.css` | 虚拟行 opacity + 独立 translate 入场 |
| Modify | `src/styles/albums.css` | 卡片与 sort menu 入场 token |
| Modify | `src/styles/playlists.css` | 歌单卡片入场 |
| Modify | `src/styles/playlist-panel.css` | 项目入场、panel 退场、press 归一 |
| Modify | `src/styles/dialog.css` | overlay/dialog 入场和退出 |
| Modify | `src/styles/contextmenu.css` | menu/submenu 轻量入场 |
| Modify | `src/styles/miniplayer.css` | 三视图入场、队列项入场、按钮 press token |
| Modify | `src/styles/playerbar.css` | press 使用 scale，与 play pulse transform 组合 |
| Modify | `src/styles/sidebar.css` | press 迁移为 scale，保留现有强度 |
| Modify | `src/styles/lyrics.css` | press token；保留歌词行专用 motion 时长 |
| Modify | `src/styles/titlebar.css`、`localmusic.css`、`settings.css`、`src/components/Equalizer.css` | 为后置 button transition 补上 scale，不改功能性 slider transform |
| Create | `tests/motionPreference.test.ts` | 手动/系统组合和 DOM 属性测试 |
| Create | `tests/useReducedMotion.test.tsx` | layout effect 映射与 cleanup 测试 |
| Create | `tests/AppMotionHydration.test.tsx` | App 读取设置、首帧属性与缺省值接线测试 |
| Create | `tests/useExitTransition.test.tsx` | 正常、reduced、重复、fallback、cleanup 测试 |
| Create | `tests/ContentMotion.test.tsx` | 导航 key 和歌词 reduced exit 测试 |
| Create | `tests/DialogMotion.test.tsx` | 两类 dialog 的关闭/确认协议 |
| Create | `tests/Settings.test.tsx` | 手动开关状态与单次持久化测试 |
| Modify | `tests/uiStore.test.ts` | reducedMotion 初始值/action |
| Modify | `tests/LyricsPanel.test.tsx` | data 属性和系统设置都使用 auto scroll |
| Modify | `tests/PlaylistPanel.test.tsx` | 退出动画后才 onClose；reduced 时立即关闭 |
| Modify | `tests/SongList.test.tsx`、`PlayerBar.test.tsx` | 保留列表首批/播放 pulse 行为的回归测试 |
| Modify | `SPEC.md` | 动画覆盖和减少动画行为 |
| Modify | `harness/DECISIONS.md` | 记录 motion token、组合属性、状态归属和系统优先级 |
| Create after implementation | `docs/devlog/devlog-20260711-animation-full-coverage.md` | 记录真实实现和验证结果 |

明确不修改：`src/stores/playerStore.ts`、数据库 schema、IPC 类型、feature flag 数量、AudioEngine、`package.json`、tsconfig、歌词解析与播放队列数据模型。

---

## Task 0：基线、dirty worktree 与动画清单

**Objective:** 在广泛修改 CSS 前建立可信基线，并隔离上一功能改动。

### Step 1：记录工作区

Run：

```bash
git status --short
```

- 不允许把已有 MiniPlayer/其他计划改动算进本任务。
- `SPEC.md` 若已有修改，必须逐段合并，不能覆盖整文件。

### Step 2：运行完整基线

Run：

```bash
npm run verify
```

Expected：Harness、生产构建、全量测试通过。若失败，先记录原始失败；不要在动画任务中顺手修无关问题。

### Step 3：保存真实清单

实施前再次运行：

```bash
rg -n "@keyframes|animation:|transition:|transform:|:active" src/styles src/components/Equalizer.css
```

把结果与本方案覆盖矩阵对照。任何新发现的 transform 定位用途必须先分类，禁止机械替换。

---

## Task 1：Motion token、偏好 helper 与 CSS 降级

**Objective:** 先建立所有后续任务共享的时序、手动属性和 reduced motion 判断。

**Files:**

- Modify: `src/styles/themes.css`
- Create: `src/styles/motion.css`
- Modify: `src/styles/global.css`
- Create: `src/utils/motionPreference.ts`
- Create test: `tests/motionPreference.test.ts`

### Step 1：先写 helper 失败测试

覆盖：

1. `applyReducedMotionAttribute(true)` 设置 html data 属性。
2. false 移除属性，不写字符串 `false`。
3. 手动属性 true 时 `isReducedMotionActive()` 为 true。
4. 无手动属性、系统 reduce 时为 true。
5. 两者都关闭时为 false。
6. `window.matchMedia` 不存在时不抛错并按手动属性判断。
7. 测试结束恢复 html 属性和 matchMedia mock。

### Step 2：确认失败

Run：

```bash
npx vitest run tests/motionPreference.test.ts
```

### Step 3：实现 token、helper 和最终 CSS 覆盖

- token 只定义一次。
- motion.css 必须最后导入。
- 手动 selector 和 media query 保持同等规则。
- reduced motion 同时处理 duration、delay、iteration 和 scroll-behavior。
- button press 在 reduced motion 下恢复 `scale: 1`。
- 不删除各组件现有 `@media (prefers-reduced-motion)` 特定降级，除非全局规则已明确等价且有回归验证。

### Step 4：验证

Run：

```bash
npx vitest run tests/motionPreference.test.ts
npm run build
```

---

## Task 2：UI 状态、启动水合与设置开关

**Objective:** 正确保存手动偏好，并在正常内容首次绘制前应用。

**Files:**

- Modify: `src/stores/uiStore.ts`
- Create: `src/hooks/useReducedMotion.ts`
- Modify: `src/App.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `tests/uiStore.test.ts`
- Create test: `tests/useReducedMotion.test.tsx`
- Create test: `tests/AppMotionHydration.test.tsx`
- Create test: `tests/Settings.test.tsx`

### Step 1：先写失败测试

`uiStore.test.ts`：

- 默认 `reducedMotion=false`。
- `setReducedMotion(true/false)` 只更新 UI 状态。

`useReducedMotion.test.tsx`：

- store true/false 后在 layout effect 中设置/移除 html 属性。
- unmount 不需要删除用户当前属性；属性代表全局偏好，不属于单个页面生命周期。

`Settings.test.tsx`：

- mock Equalizer、AudioEngine 和无关设备/文件夹 IPC，避免测试被设置页其他功能干扰。
- 开关位于“通用”，显示名称“减少动画”，说明“减少界面位移和过渡；系统已开启减少动画时始终生效”，checkbox 具备可访问名称。
- 点击开启只调用一次 `settings:set { key: 'reducedMotion', value: 'true' }`，并更新 store。
- 点击关闭只调用一次 false。
- DOM 属性由根 Hook 测试负责，Settings 不直接操作 document。

`AppMotionHydration.test.tsx`：

- mock `useAudioSync`、主题和重型子组件，保留真实 uiStore、App hydrate 与 `useReducedMotion`。
- `settings:get reducedMotion` 返回 `'true'` 时，正常内容出现前 store 和 html 属性都为 true。
- 返回 `null` / `'false'` 时按 false 处理并移除旧测试遗留属性。
- 断言 reducedMotion 只读取一次，不影响 feature flag 优先水合顺序。

### Step 2：实现状态和根 Hook

- App 顶层与 `useTheme()` 并列调用 `useReducedMotion()`。
- App hydrate 的 Promise.all 增加 `settings:get reducedMotion`。
- 在 `setIsHydrated(true)` 前调用 uiStore action；Hook 的 layout effect 在正常内容绘制前应用。
- 非 `true` 字符串一律按 false 处理。
- Settings handler 先更新 store，再显式写 SQLite；不要加入 playerStore 自动保存数组。

### Step 3：验证

Run：

```bash
npx vitest run tests/uiStore.test.ts tests/useReducedMotion.test.tsx tests/AppMotionHydration.test.tsx tests/Settings.test.tsx
```

**完成标准：**

- [ ] 状态归 uiStore。
- [ ] 每次切换只有一次 settings 写入。
- [ ] 启动恢复后正常页面首帧使用正确属性。
- [ ] 关闭手动开关不会绕过系统 reduce。

---

## Task 3：按钮 press 归一且不破坏现有 transform

**Objective:** 所有 button 获得一致基础反馈，同时保留播放 pulse 和各控件原有强度。

**Files:**

- Modify: `src/styles/base.css`
- Modify: `src/styles/playerbar.css`
- Modify: `src/styles/sidebar.css`
- Modify: `src/styles/songlist.css`
- Modify: `src/styles/playlist-panel.css`
- Modify: `src/styles/lyrics.css`
- Modify: `src/styles/miniplayer.css`
- Modify: `src/styles/titlebar.css`
- Modify: `src/styles/localmusic.css`
- Modify: `src/styles/albums.css`
- Modify: `src/styles/playlists.css`
- Modify: `src/styles/dialog.css`
- Modify: `src/styles/settings.css`
- Modify: `src/components/Equalizer.css`
- Regression: `tests/PlayerBar.test.tsx`
- Regression: `tests/SongList.test.tsx`

### Step 1：实现组合属性基线

```css
button {
  --button-press-scale: var(--motion-press-scale);
  scale: 1;
  transition: scale var(--motion-duration-fast) var(--motion-ease-standard);
}

button:active:not(:disabled) {
  scale: var(--button-press-scale);
}
```

### Step 2：迁移现有 press 规则

- `.player-bar__btn`、play button、`.sidebar__item`、`.song-list__like`、`.queue-panel__close`、歌词控制按钮等，把 `:active { transform: scale(...) }` 改为对应 `--button-press-scale`。
- 保留原强度或在视觉验收后仅做小幅收敛，不允许全都强制 0.95。
- 播放 pulse 继续使用 transform keyframe；button press 使用独立 scale，两者可以组合。
- range thumb 的 transform 不属于 button，保持原样。

### Step 3：补齐 transition cascade

组件 CSS 在 base.css 后加载，任何 button class 若用 `transition:` shorthand，都会覆盖全局 scale transition。逐个审计并在该 shorthand 中加入：

```css
scale var(--motion-duration-fast) var(--motion-ease-standard)
```

不得用 `!important`，不得用最终全局 shorthand 覆盖已有 color/background transition。

审计至少覆盖 titlebar、sidebar、LocalMusic、Albums sort menu、Playlists、dialog、SongList、PlayerBar、QueuePanel、Settings、Lyrics、MiniPlayer 和 Equalizer 中的原生 button。ContextMenu item 和 range thumb 不是 button，不能机械套用。

### Step 4：验证

- 生产构建通过。
- PlayerBar 测试证明 pulse class 状态逻辑未变。
- SongList 收藏按钮和禁用按钮行为未变。
- UI 手动检查 titlebar、侧栏、设置、dialog、主播放条、迷你播放器和歌词页按钮。

---

## Task 4：页面、列表、卡片、菜单和迷你视图入场

**Objective:** 完成覆盖矩阵中的入场动画，同时保护虚拟定位和已有 hover transform。

**Files:**

- Modify: `src/components/Content.tsx`
- Modify: `src/components/SongList.tsx`
- Modify: `src/styles/content.css`
- Modify: `src/styles/songlist.css`
- Modify: `src/styles/albums.css`
- Modify: `src/styles/playlists.css`
- Modify: `src/styles/playlist-panel.css`
- Modify: `src/styles/contextmenu.css`
- Modify: `src/styles/miniplayer.css`
- Create test: `tests/ContentMotion.test.tsx`
- Regression: `tests/SongList.test.tsx`

### Step 1：修正 Content 入场触发

- 删除 `fadeKey` state 和仅用于递增 key 的 effect。
- 普通页面先计算 `resolvedNav = isNavAllowed(...) ? activeNav : 'local'`，wrapper 使用 `key={resolvedNav}`；导航一次只 remount 一次。
- contentFadeIn 使用 opacity + 独立 `translate`，不使用 left/margin。
- 保留歌词 layer 的现有 enter/active/exit 状态。

测试：切换 local → albums → settings 时，每次只出现目标页面；不出现中间重复挂载。feature flag fallback 仍显示 LocalMusic。

### Step 2：保护虚拟歌曲行

- SongList inline `transform: translateY(${virtualRow.start}px)` 原样保留。
- keyframe 只动画 opacity 和独立 `translate: 0 var(--motion-distance-sm)` → `0 0`。
- 把裸 `28` 提取为 `ROW_ENTER_STAGGER_MS = 28`，继续在 TypeScript 中计算 `animationDelay`。不要为了跨 JS/CSS 共享而使用兼容性不明确的 CSS 乘法表达式，也不要在运行时读取 computed style。
- 仅 `animateInitialRows` 的首批可见行带 enter class；滚动新行不重新动画。

测试至少断言虚拟行仍保留定位 transform，首批有 enter class/CSS index，后续滚动批次没有 enter class。不要在 JSDOM 断言动画帧。

### Step 3：其他集合入场

- `.albums__card`：opacity + 独立 translate；与 hover transform 共存。
- `.playlists__card`：opacity + 独立 translate。
- `.queue-panel__item`：opacity + 独立 translate；打开 panel 时执行一次。
- `.mini-queue-view__item`：视图挂载时轻量入场，不延迟到影响操作。
- 不对数十项做长 stagger；总可见入场不得超过 `--motion-duration-slow`。

### Step 4：popup 与迷你视图

- AlbumSortMenu 既有 entry 改用 token。
- ContextMenu/submenu 增加短 opacity + translate entry；不改坐标修正逻辑。
- `.mini-player__default-view`、`.mini-lyrics-view`、`.mini-queue-view` 挂载时使用同一 view entry keyframe。
- MiniPlayer 根 `miniFadeIn` 改用 token，不叠加第二个根动画。

### Step 5：reduced motion JS 修复

- LyricsPanel 改用 `isReducedMotionActive()` 决定 smooth/auto。
- Content 离开歌词时：reduced active 立即完成，不等待 300ms timer；普通模式仍保留 300ms。
- `ContentMotion.test.tsx` 使用 fake timers覆盖正常等待与 reduced 立即完成，并清理 html/matchMedia。

### Step 6：验证

Run：

```bash
npx vitest run tests/ContentMotion.test.tsx tests/SongList.test.tsx tests/LyricsPanel.test.tsx tests/Albums.test.tsx tests/Playlists.test.tsx tests/PlaylistPanel.test.tsx tests/MiniPlayer.test.tsx
npm run build
```

---

## Task 5：Dialog 与 Queue Panel 可靠退场

**Objective:** 所有声明支持退出动画的 overlay/panel 在卸载前完成动画，reduced motion 不等待。

**Files:**

- Create: `src/hooks/useExitTransition.ts`
- Modify: `src/components/CreatePlaylistDialog.tsx`
- Modify: `src/components/SongInfoDialog.tsx`
- Modify: `src/pages/Playlists.tsx`
- Modify: `src/components/PlaylistPanel.tsx`
- Modify: `src/styles/dialog.css`
- Modify: `src/styles/playlist-panel.css`
- Create test: `tests/useExitTransition.test.tsx`
- Create test: `tests/DialogMotion.test.tsx`
- Modify: `tests/PlaylistPanel.test.tsx`

### Step 1：先写 Hook 失败测试

覆盖：

1. 普通模式 `requestExit()` 只设置 exiting，不立即调用 onExited。
2. 根 animationend 后调用一次。
3. 子元素冒泡 animationend 不完成退出。
4. 连续 requestExit/animationend 仍只完成一次。
5. reduced motion 在微任务内完成，不创建可见等待。
6. animationend 丢失时 fallback 完成。
7. unmount 清理 fallback，不在卸载后调用 callback。

### Step 2：接入两个 dialog

- overlay 和 dialog 都有 enter/exit class；完成事件只绑定 overlay 根。
- cancel、overlay、Escape 都调用 requestExit。
- SongInfo 的关闭按钮调用 requestExit。
- CreatePlaylistDialog 的 `onConfirm` 类型改为 Promise：先 await 创建成功，再 requestExit；失败时保持弹窗，不提前卸载。
- 增加 submitting guard，防止 exit 前重复创建。
- submitting 期间禁用确认、取消、overlay 和 Escape 关闭；Promise reject 后恢复可操作，避免“后台仍创建但弹窗已消失”的竞态。
- Playlists 的 `handleCreate` 只负责创建和刷新，不再直接 `setShowCreateDialog(false)`；真正卸载由 dialog exit 完成后的 onCancel 负责。

`DialogMotion.test.tsx` 必须覆盖确认 Promise pending 时重复确认/取消均无效、resolve 后只退出一次，以及 reject 后弹窗保持并恢复按钮。

### Step 3：接入 queue panel

- close、back、Escape 全部 requestExit。
- exiting 时禁止重复操作和队列点击。
- 添加 queuePanelSlideOut，方向与入场相反。
- reduced motion 时 onClose 几乎立即执行，不等待 CSS。

### Step 4：验证

Run：

```bash
npx vitest run tests/useExitTransition.test.tsx tests/DialogMotion.test.tsx tests/PlaylistPanel.test.tsx tests/Playlists.test.tsx
```

**完成标准：**

- [ ] 正常模式先动画后卸载。
- [ ] 所有关闭入口只有一条退出路径。
- [ ] reduced motion 无 140/250/300ms 假等待。
- [ ] 创建歌单仍只提交一次，成功后退出，失败不误关。

---

## Task 6：全量回归、视觉验证与项目记忆

**Objective:** 证明覆盖矩阵完整、无定位回归、减少动画一致，并记录最终事实。

**Files:**

- Modify: `SPEC.md`
- Modify: `harness/DECISIONS.md`
- Create: `docs/devlog/devlog-20260711-animation-full-coverage.md`
- Do not modify: `harness/CONSTRAINTS.md`（现有约束不与本方案冲突）

### Step 1：自动验证

Run：

```bash
npm run verify
```

Expected：Harness checks、Electron 生产构建、全量 Vitest 全部通过，0 failed。

### Step 2：静态复核

再次运行动画清单命令，检查：

- 新增 motion 是否使用 token。
- 虚拟行定位 transform 未被 keyframe 改写。
- 旧 `:active { transform: scale(...) }` 是否已迁移；range thumb 除外。
- 没有 `will-change`。
- 没有在 playerStore 中新增 reducedMotion。
- Content 的 300ms 等待在 reduced 分支被跳过。

静态 grep 只用于人工审查，不新增脆弱的“匹配源码字符串”单元测试。

### Step 3：UI smoke 与截图

实现者必须在 Electron 开发环境检查并保存证据：

- 深色/浅色：LocalMusic、Albums、Playlists、Settings。
- 普通/手动 reduce/系统 reduce 三种 motion 状态。
- PlayerBar 与 MiniPlayer 三视图。
- CreatePlaylistDialog、SongInfoDialog、QueuePanel 的入场与退出。
- 至少 1000 首歌曲的虚拟列表首屏与滚动后行定位。

无法自动捕获动画过程时，至少记录开始/结束截图和手动观察结果；主人仍负责最终体感判断。

### Step 4：更新项目记忆

SPEC 记录：

- 覆盖矩阵。
- 手动设置与系统 reduce 的 OR 规则。
- 普通页面只入场、歌词/overlay/panel 支持退场。

DECISIONS 记录：

- token 放 `:root`。
- 使用独立 scale/translate 与定位 transform 组合。
- reducedMotion 归 uiStore。
- JS/CSS 统一使用 reduced motion helper/selector。

Devlog 记录：

- 实际修改文件和最终 token。
- 新增测试名称/数量。
- `npm run verify` 真实摘要。
- UI smoke 已验证项与待主人确认项。

---

## 整体验收标准

1. `npm run verify` 全绿，0 failed。
2. 覆盖矩阵中每类均有实现和验证，排除项没有被暗中扩展。
3. 所有 button 有 press 反馈；禁用按钮、range、拖拽面不缩放。
4. 播放 pulse 与按压可组合，不互相覆盖或产生双重过度缩放。
5. SongList 虚拟行在动画期间仍保持正确 translateY 定位，无重叠、跳顶或滚动后重播。
6. 页面、卡片、菜单、迷你视图入场不改变布局尺寸，不遮挡交互。
7. Dialog 和 QueuePanel 正常模式完成退场后卸载；所有关闭入口幂等。
8. 手动或系统任一 reduce 生效时，CSS motion、歌词 smooth scroll、歌词页退出等待和 overlay 退出都同步降级。
9. 手动设置保存一次，重启恢复；关闭手动开关后仍尊重系统 reduce。
10. reducedMotion 只存在 uiStore，不进入 playerStore、AudioEngine 或 feature flags。
11. 没有新增依赖、`will-change`、layout 型装饰动画或硬编码深色样式。
12. 深浅主题、主窗口最小尺寸和 MiniPlayer 固定尺寸下没有重叠或闪白。

## 手动测试（主人执行）

1. 逐类点击标题栏、侧栏、列表收藏、设置、dialog、PlayerBar、MiniPlayer 和歌词控制按钮，检查 press 强度自然。
2. 快速连点播放按钮，确认 pulse 与按压不抖动、不残留缩放。
3. 打开 1000 首以上歌曲列表：首屏轻微入场，滚动后行位置稳定且新批次不反复动画。
4. 切换 LocalMusic、Albums、Playlists、Settings：每次只有一次入场，无先闪现再淡入。
5. 打开专辑/歌单网格、上下文菜单、排序菜单、MiniPlayer 三视图，检查入场克制且可立即操作。
6. 分别取消/确认 CreatePlaylistDialog，关闭 SongInfoDialog，使用按钮/Escape/back 关闭 QueuePanel，确认退出后才消失且不会重复回调。
7. 设置中打开“减少动画”，立即重复 1-6：不得出现明显位移或 140-300ms 空等。
8. 重启后确认手动开关恢复；关闭开关后，在 Windows 开启系统减少动画并重启，确认仍降级。
9. 深色和浅色各检查一次 popup/dialog 过程，无闪白、透明层残留或内容裁切。
10. 快速切换导航、连续打开关闭弹层，确认无 timer 警告、焦点丢失和无法点击状态。

## 实施后审查交接

实现完成后交给 Codex 独立审查，最小审查包包含：

- 本方案文件。
- `git status --short` 和仅本任务的 diff。
- `npm run verify` 输出摘要。
- 动画静态清单复核结果。
- 深浅主题与三种 motion 状态的 UI smoke 证据。
- 1000 首虚拟列表、dialog confirm/cancel、queue panel Escape 的手动结果。

---

## 独立程序员视角自审记录

以下是在方案重写完成后，以“接手实施但未参与设计的程序员”视角进行的第二轮审查：

| 自审问题 | 处理结果 |
|---|---|
| 我能否仅凭方案判断哪些元素必须动画？ | 已用覆盖矩阵和 Non-goals 限定，不再依赖“所有元素”口号 |
| SongList 的动画是否会覆盖虚拟定位？ | 已强制使用独立 translate，并增加定位回归测试/1000 首手测 |
| Button press 是否会覆盖 play pulse？ | 已拆成 scale 与 transform 两个组合属性，并要求迁移旧 active 规则 |
| reduced motion 是否只影响 CSS？ | helper 同时接入 LyricsPanel、Content 和 exit hook |
| 系统 reduce 与手动开关冲突时谁优先？ | 明确 OR 规则；手动关闭不能强制绕过系统 |
| 状态是否放错 store 或重复持久化？ | uiStore 单一状态；Settings 写一次；App 读一次；根 Hook 应用 DOM |
| 只测 store/Hook 会不会漏掉 App 根本没读取设置？ | 已新增 AppMotionHydration 接线测试，覆盖 true/null/false 和水合顺序 |
| Dialog 退出是否会因立即卸载失效？ | useExitTransition 延迟父卸载，confirm/cancel/Escape 都走同一路径 |
| reduced motion 下退出 Hook 会不会等待 fallback？ | helper 命中时微任务完成，不进入正常动画等待 |
| CSS animationend 丢失会不会卡死？ | 有幂等 fallback timer 和 cleanup |
| CreatePlaylistDialog confirm 是否会重复创建？ | onConfirm 改 Promise + submitting guard，成功后才 requestExit |
| Content 普通页面是否可能动画两次？ | 删除 fadeKey effect，改用稳定路由 key |
| SongList stagger 能否可靠共享 CSS token？ | 不使用兼容性不明确的 CSS 乘法；提取 TypeScript 常量并保留显式 delay |
| token 是否在主题间复制？ | 只在 `:root` 定义 |
| 是否误把音频淡入淡出纳入 CSS motion？ | 明确排除 AudioEngine 与 playerStore |
| 自动测试能否证明动画视觉正确？ | 不虚构 JSDOM 能力；逻辑自动测，视觉/定位由 Electron smoke 验证 |
| dirty worktree 是否可能被覆盖？ | Task 0 明确先隔离/提交旧改动，SPEC 只能合并 |

**自审结论：** 方案已具备可实施性；剩余风险主要是跨文件 CSS transition 审计和退出动画体感，已分别通过静态清单、定向测试与 Electron UI smoke 设定门禁。未经主人确认，不进入源码实施。
