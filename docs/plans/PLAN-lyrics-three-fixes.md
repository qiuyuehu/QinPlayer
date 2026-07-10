# 歌词界面三项修复实施方案

> **For Hermes:** 按任务顺序实施；每个任务先写失败测试，再写最小实现。不要自动提交 Git，由主人决定何时提交。
>
> 创建：2026-07-10  
> 修订：2026-07-10（Codex 基于当前源码重新定位根因并重写）  
> 状态：待主人确认

## 前置条件

- 身份：你是 work profile 的 Hermes Agent，负责按本方案修复歌词页面的三个问题。
- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`
- WSL 路径：`/mnt/c/Users/秋月/Desktop/QinPlayer`
- 技术栈：Electron 31、React 18、TypeScript、Zustand、Vitest、Testing Library。
- 开工前必读：`SPEC.md` → `harness/SPEC.md` → `harness/CONSTRAINTS.md` → `harness/DECISIONS.md` → `harness/TEST_CONVENTIONS.md` → `docs/devlog/devlog-20260710-lyrics-scroll-reset.md`。
- 定向测试：`npx vitest run tests/LyricsPanel.test.tsx`、`npx vitest run tests/useAudioSync.test.tsx`。
- 最终验证：`npm run verify`。
- 禁止事项：不新增依赖，不修改 `package.json`/tsconfig，不改 `AudioEngine` 公共 API，不顺手重构其他播放器逻辑，不自动提交 Git。

##  注意事项（必读）

1. 三个问题必须分任务完成；每项测试变绿后再进入下一项。
2. 不采用“切歌时暂停，歌词加载后恢复播放”的方案。它会打断淡出，并可能在用户主动暂停后错误恢复播放。
3. `currentTimeRef` 已由 `playerStore.nextTrack()`、`prevTrack()`、`setCurrentTrack()` 同步归零；真正缺口是旧音频在淡出期间继续触发 `timeupdate`。
4. 保留现有 `lyricsData.trackId`、`key={currentTrack.id}`、`lrcRequestRef` 三层切歌保护，不删除、不合并。
5. 全屏修复只处理 fullscreen 布局切换，不先引入 `ResizeObserver`。避免窗口连续 resize 时反复抢夺歌词滚动位置。
6. CSS `transform` 只作为单行的 4px 微动效，不承担歌词列表滚动；列表定位仍由 `scrollTo()` 完成。
7. 不使用 `will-change`。本次最多只有 6 行参与轻量 transform/opacity 过渡，交给 Chromium 自行提升动画层，避免退出行淡出时动态移除 hint。
8. 保留 `prefers-reduced-motion` 降级：减少动态效果时禁用单行动画，并将歌词滚动改为 `auto`。
9. Promise、RAF、事件监听与测试 mock 都必须清理，不能污染其他测试。

## Goal

在不改变播放意图和现有歌词数据模型的前提下，实现三项修复：歌词逐行切换更流畅、进入/退出全屏后立即重新定位当前歌词、手动切歌时不再被旧音频时间污染。

## Architecture

- `LyricsPanel` 继续用 `scrollTo()` 负责列表级位移；CSS 只给单行叠加方向性微位移、透明度和颜色过渡。
- `Lyrics` 把全屏状态变化作为 `layoutRevision` 传给 `LyricsPanel`，让滚动定位 effect 在布局变化后重新执行一次。
- `useAudioSync` 在曲目切换到新音频 metadata 就绪之前，屏蔽旧音频的 `timeupdate` 和 `ended` 事件；不修改 Zustand 的 `isPlaying`。

## 已确认根因与技术决策

| 问题 | 已确认根因 | 采用方案 | 明确不采用 |
|---|---|---|---|
| 歌词动画生硬 | 列表虽平滑滚动，但单行只有 opacity/color 过渡；激活状态缺少方向性运动 | `scrollTo` + 单行 `translateY(±4px)`/`scale(1.02)` | 用 transform 代替列表滚动 |
| 全屏歌词空白 | `fullscreenchange` 只更新按钮状态；`currentIndex` 和 `lyrics` 不变，因此 `LyricsPanel` 定位 effect 不重跑 | `layoutRevision` 触发一次 `behavior: auto` 的重新定位 | 常驻 `ResizeObserver`、伪造歌词索引变化 |
| 手动切歌闪烁 | Store 已归零时间，但旧歌在 500ms 淡出期间继续用 `timeupdate` 覆盖 `currentTimeRef` | `trackTransitionRef` 屏蔽旧引擎事件，metadata 就绪后解除 | 暂停播放再恢复、等待 LRC 后才播放 |

---

## Task 1：阻止旧音频时间污染新歌词

**Objective:** 手动上一首/下一首时保持播放和淡入淡出逻辑不变，同时保证新歌词只读取新曲目的时间轴。

**Files:**

- Modify: `src/hooks/useAudioSync.ts`
- Test: `tests/useAudioSync.test.tsx`

### Step 1：先写失败回归测试

扩展 AudioEngine mock，保存注册进来的事件回调：

```tsx
let timeUpdateHandler: ((time: number, duration: number) => void) | undefined
let loadedMetadataHandler: ((duration: number) => void) | undefined
let endedHandler: (() => void) | undefined

const pauseMock = vi.fn()
const onTimeUpdateMock = vi.fn((callback: (time: number, duration: number) => void) => {
  timeUpdateHandler = callback
})
const onLoadedMetadataMock = vi.fn((callback: (duration: number) => void) => {
  loadedMetadataHandler = callback
})
const onEndedMock = vi.fn((callback: () => void) => {
  endedHandler = callback
})
```

把 mock engine 中对应方法替换为上述 mock，并在 `beforeEach` 中把三个 handler 设回 `undefined`，同时执行 `currentTimeRef.current = 0`。

新增第二、第三首测试歌曲。测试内显式开启 `fadeEffect` 和 `fadeEnabled`，补充以下回归用例：

1. 渲染 `useAudioSync`，触发第一首的 `loadedMetadataHandler`。
2. 触发 `timeUpdateHandler(75, 180)`，确认 `currentTimeRef.current === 75`。
3. 调用 store 的 `nextTrack()`，等待第二首进入加载流程；此时 store 应已把时间归零。
4. 模拟旧音频迟到的 `timeUpdateHandler(76, 180)`，断言时间仍为 `0`。
5. 模拟第二首 `loadedMetadataHandler(200)`，再触发 `timeUpdateHandler(0.2, 200)`，断言时间更新为 `0.2`。
6. 断言第二首调用了 `loadWithFadeMock`，没有降级成普通 `loadMock`。
7. 断言 `isPlaying` 始终为 `true`，且 `pauseMock` 没有被调用。

测试名称使用：`手动切歌淡出期间应该忽略旧音频的 timeupdate`。

再增加两条 `ended` 回归测试：

1. 第一首 metadata 就绪后手动 `nextTrack()`，在第二首 metadata 就绪前调用旧歌的 `endedHandler()`，断言 `currentTrack` 仍是第二首，没有再次跳歌。
2. 第一首 metadata 就绪、且没有手动切歌时调用 `endedHandler()`，断言仍会正常进入第二首。

测试名称分别为：

- `手动切歌淡出期间应该忽略旧歌曲的 ended`
- `非切换状态的 ended 应该正常进入下一首`

再增加快速切歌测试 `快速 A→B→C 时应该持续忽略旧 timeupdate`：

1. 第一首 metadata 就绪后触发时间更新到 `75`。
2. 连续调用两次 `nextTrack()`，等待当前歌曲变成 C，确认 `currentTimeRef.current === 0`。
3. 在 B、C 加载切换期间连续触发旧回调 `timeUpdateHandler(76, 180)` 和 `timeUpdateHandler(77, 180)`，时间必须仍为 `0`。
4. 只在最终歌曲 C 的 metadata 回调后触发 `timeUpdateHandler(0.2, 200)`，时间才允许更新为 `0.2`。
5. 断言 B、C 都走 `loadWithFadeMock`，`pauseMock` 始终未调用，最终 `isPlaying === true`。

### Step 2：运行测试并确认失败

Run：

```bash
npx vitest run tests/useAudioSync.test.tsx
```

Expected：新增用例失败，旧 `timeupdate` 会把 `currentTimeRef.current` 从 `0` 改成 `76`。

### Step 3：实现最小修复

在 `useAudioSync()` 的其他 ref 附近新增：

```tsx
// 曲目切换期间旧音频仍可能在淡出并发送 timeupdate；新 metadata 就绪前忽略这些事件。
const trackTransitionRef = useRef(false)
```

修改 AudioEngine 事件注册：

```tsx
engine.onTimeUpdate((time, dur) => {
  if (trackTransitionRef.current) return
  currentTimeRef.current = time
  if (dur > 0) setDuration(dur)
})

engine.onLoadedMetadata((dur) => {
  trackTransitionRef.current = false
  setDuration(dur)

  if (pendingAutoPlay.current) {
    pendingAutoPlay.current = false
    engine.play().catch((err) => {
      if (err.name !== 'AbortError') setIsPlaying(false)
    })
  }
})

engine.onEnded(() => {
  // 手动切歌的淡出阶段可能收到旧歌曲 ended，不能因此再跳一首。
  if (trackTransitionRef.current) return

  if (!useUIStore.getState().featureFlags.playback) return

  const mode = usePlayerStore.getState().playMode
  if (mode === 'loop') {
    engine.currentTime = 0
    engine.play().catch(() => {})
  } else {
    setIsPlaying(false)
    nextTrack()
  }
})
```

在 `currentTrack` effect 开头建立切换边界：

```tsx
if (!currentTrack) {
  trackTransitionRef.current = false
  currentTimeRef.current = 0
  return
}

trackTransitionRef.current = true
currentTimeRef.current = 0
```

注意：`onLoadedMetadata` 不要再次强制把 `currentTimeRef` 改成 `0`，否则可能覆盖启动恢复或用户 seek 写入的时间。

### Step 4：验证修复

Run：

```bash
npx vitest run tests/useAudioSync.test.tsx tests/playerStore.test.ts
```

Expected：全部通过；手动切歌测试证明旧事件被屏蔽，现有播放和 store 测试无回归。

**完成标准：**

- [ ] 切歌期间旧 `timeupdate` 不再覆盖已归零的时间。
- [ ] 新歌曲 metadata 就绪后正常恢复时间更新。
- [ ] 手动切歌不调用 `setPlaying(false)`，不破坏 fade。
- [ ] fade 开启时后续歌曲仍调用 `loadWithFade`，不意外降级为普通 `load`。
- [ ] A→B→C 快速切换期间，旧 `timeupdate` 始终不能解除时间归零状态。
- [ ] 旧歌曲迟到的 `ended` 不会造成连续跳两首。
- [ ] 非切换状态的自然 `ended` 仍按现有播放模式工作。
- [ ] `useAudioSync` 与 `playerStore` 定向测试通过。

---

## Task 2：全屏切换后立即重新定位当前歌词

**Objective:** 进入和退出 Fullscreen 后，不等待下一句歌词，当前行立即回到正确可视位置。

**Files:**

- Modify: `src/components/LyricsPanel.tsx`
- Modify: `src/pages/Lyrics.tsx`
- Test: `tests/LyricsPanel.test.tsx`
- Create test: `tests/LyricsFullscreen.test.tsx`

### Step 1：先写失败测试

为 `LyricsPanel` 增加测试场景：

1. 用 10 行歌词和 `currentIndex={4}` 渲染，初始 `layoutRevision={0}`。
2. 清空 `HTMLElement.prototype.scrollTo` mock 的调用记录。
3. `rerender` 相同歌词和索引，但把 `layoutRevision` 改为 `1`。
4. 断言 `scrollTo` 被再次调用，最后一次参数包含 `behavior: 'auto'`。

测试名称：`布局版本变化时应该立即重新定位当前歌词`。

再新建 `tests/LyricsFullscreen.test.tsx`，锁住父组件 wiring：

1. 用 `vi.mock('../src/components/LyricsPanel', ...)` 把真实面板替换为一个输出 `data-layout-revision={layoutRevision}` 的轻量组件。
2. 初始化 store，使 `Lyrics` 有当前歌曲并能正常渲染；`read-lrc-file` 可以返回 `null`，本测试不验证歌词内容。
3. 用可配置 getter mock `document.fullscreenElement`，初始返回 `null`，断言 mock 面板收到 `0`。
4. 把 getter 背后的变量改成 `document.documentElement`，派发 `fullscreenchange`，等待 mock 面板收到 `1`。
5. 再改回 `null` 并派发事件，等待 mock 面板重新收到 `0`。
6. `afterEach` 删除实例上的 `fullscreenElement` mock，并恢复 Electron API/store，防止污染其他测试。

mock 必须写在导入 `Lyrics` 之前：

```tsx
vi.mock('../src/components/LyricsPanel', () => ({
  default: ({ layoutRevision = 0 }: { layoutRevision?: number }) => (
    <div
      data-testid="lyrics-panel-mock"
      data-layout-revision={layoutRevision}
    />
  ),
}))
```

fullscreen 状态使用测试变量驱动，不能直接给只读属性赋值：

```tsx
let fullscreenElement: Element | null = null

Object.defineProperty(document, 'fullscreenElement', {
  configurable: true,
  get: () => fullscreenElement,
})

// 测试结束后执行：delete (document as { fullscreenElement?: Element | null }).fullscreenElement
```

测试名称：`fullscreenchange 应该把布局版本传给歌词面板`。

这两层测试缺一不可：`LyricsFullscreen.test.tsx` 证明 `fullscreenchange → Lyrics → layoutRevision`，`LyricsPanel.test.tsx` 证明 `layoutRevision → scrollTo(auto)`。

### Step 2：运行测试并确认失败

Run：

```bash
npx vitest run tests/LyricsPanel.test.tsx tests/LyricsFullscreen.test.tsx
```

Expected：至少一个新增用例失败；面板尚不响应 `layoutRevision`，父组件也尚未传递该值。

### Step 3：实现 layoutRevision 定位契约

修改 props 和 import：

```tsx
import { useLayoutEffect, useRef, useCallback } from 'react'

interface LyricsPanelProps {
  lyrics: LyricLine[]
  currentIndex: number
  onLineClick?: (time: number) => void
  featureFlags?: FeatureFlags
  layoutRevision?: number
}
```

组件参数给 `layoutRevision` 默认值 `0`，并新增：

```tsx
const prevLayoutRevisionRef = useRef(layoutRevision)
```

把当前滚动 `useEffect` 改为 `useLayoutEffect`，并把布局变化纳入行为判断：

```tsx
const isTrackChange = lyrics !== prevLyricsRef.current
const isLayoutChange = layoutRevision !== prevLayoutRevisionRef.current
const isJump = isTrackChange
  || isLayoutChange
  || Math.abs(currentIndex - prevIndexRef.current) > 3
  || currentIndex === 0
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

container.scrollTo({
  top: targetScroll,
  behavior: isJump || prefersReducedMotion ? 'auto' : 'smooth',
})

prevIndexRef.current = currentIndex
prevLyricsRef.current = lyrics
prevLayoutRevisionRef.current = layoutRevision
```

effect 依赖改为：

```tsx
[currentIndex, lyrics, layoutRevision]
```

在 `Lyrics.tsx` 传入全屏布局版本：

```tsx
<LyricsPanel
  key={currentTrack?.id ?? 'no-track'}
  lyrics={lyrics}
  currentIndex={lyricsCurrentIndex}
  onLineClick={(time) => setSeekTime(time)}
  featureFlags={featureFlags}
  layoutRevision={isFullscreen ? 1 : 0}
/>
```

不要重置 `lastLyricsIndex`，也不要伪造 `lyricsCurrentIndex`；歌词索引没有失效，失效的是滚动定位所依赖的布局尺寸。

### Step 4：验证修复

Run：

```bash
npx vitest run tests/LyricsPanel.test.tsx tests/LyricsFullscreen.test.tsx
```

Expected：父组件 fullscreen wiring、layoutRevision 定位及现有切歌/行数测试全部通过。

**完成标准：**

- [ ] layoutRevision 改变会用 `behavior: 'auto'` 重新定位。
- [ ] `fullscreenchange` 进入和退出时分别向面板传入 `1` 和 `0`。
- [ ] 普通逐行切换仍使用 `behavior: 'smooth'`。
- [ ] 曲目切换和大跨度跳转仍使用 `auto`。
- [ ] 不引入常驻 `ResizeObserver`。
- [ ] `LyricsPanel` 全量测试通过。

---

## Task 3：增加方向明确的歌词单行动画

**Objective:** 保留现有列表滚动逻辑，通过轻量的单行 transform、opacity、color 过渡形成向上流动感。

**Files:**

- Modify: `src/components/LyricsPanel.tsx`
- Modify: `src/styles/lyrics.css`
- Test: `tests/LyricsPanel.test.tsx`

### Step 1：先写状态类测试

新增测试：渲染 `currentIndex={4}` 后断言：

- 第 4 行以前的可见行带 `lyrics-panel__line--past`。
- 当前行带 `lyrics-panel__line--active`。
- 当前行之后的可见行带 `lyrics-panel__line--future`。

随后 `rerender(currentIndex={5})`，断言旧当前行变成 `--past`，新当前行变成 `--active`。测试只验证状态映射，不在 JSDOM 中断言动画帧。

### Step 2：运行测试并确认失败

Run：

```bash
npx vitest run tests/LyricsPanel.test.tsx
```

Expected：新增状态类断言失败。

### Step 3：添加方向状态类

先同步修正 `LyricsPanel.tsx` 文件头说明：当前实现并没有 `scale(1.1)`；改为说明“列表由 scrollTo 定位，单行用透明度、颜色和轻微 transform 过渡”，避免注释继续误导后续维护者。

在歌词 map 中计算：

```tsx
const directionClass = distance < 0
  ? 'lyrics-panel__line--past'
  : distance > 0
    ? 'lyrics-panel__line--future'
    : ''
```

行 className 改为包含：

```tsx
className={`lyrics-panel__line ${
  isActive ? 'lyrics-panel__line--active' : ''
} ${directionClass}`}
```

### Step 4：实现 CSS 动效

更新 `src/styles/lyrics.css` 的歌词行样式：

```css
.lyrics-panel__line {
  padding: 1.2vh 0;
  font-size: 2.5vw;
  font-weight: 600;
  color: var(--text-secondary);
  text-align: center;
  transform: translateY(4px) scale(1);
  transition:
    transform 420ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 360ms cubic-bezier(0.22, 1, 0.36, 1),
    color 260ms ease;
  cursor: pointer;
}

.lyrics-panel__line--past {
  transform: translateY(-4px) scale(1);
}

.lyrics-panel__line--active {
  transform: translateY(0) scale(1.02);
  font-size: 2.5vw;
  color: var(--text-primary);
}

@media (prefers-reduced-motion: reduce) {
  .lyrics-panel__line,
  .lyrics-panel__line--past,
  .lyrics-panel__line--active {
    transform: none;
    transition: none;
  }
}
```

说明：

- `scrollTo` 负责整列从下向上移动；单行 `±4px` 只增强方向感，不影响 `offsetTop` 计算。
- 不使用 `scale(1.1)`，避免文字尺寸跳动过强；`1.02` 只做轻微强调。
- 所有歌词行统一使用 `font-weight: 600`，当前行不再发生 400→700 的瞬时字重跳变。
- 不使用 `will-change`；参与动画的可见行很少，持久层提升得不偿失。
- 不增加 JavaScript 动画库，不使用定时器驱动动画。

### Step 5：验证状态和构建

Run：

```bash
npx vitest run tests/LyricsPanel.test.tsx
npm run build
```

Expected：测试与生产构建通过，无 CSS/TS 编译错误。

**完成标准：**

- [ ] 新当前行从下方 4px 过渡到位，旧当前行向上 4px 退出。
- [ ] 主列表仍由 `scrollTo` 驱动，没有双重滚动或位置漂移。
- [ ] 普通行和当前行字重一致，切换时没有瞬时字形跳变。
- [ ] CSS 中没有新增 `will-change`。
- [ ] `prefers-reduced-motion: reduce` 下关闭 transform/transition，JS 滚动使用 `auto`。
- [ ] 状态类测试与构建通过。

---

## Task 4：完整回归验证与开发记录

**Objective:** 确认三项修复不会破坏自然切歌、淡入淡出、歌词点击跳转和现有 Harness 门禁。

**Files:**

- Create after implementation: `docs/devlog/devlog-20260710-lyrics-three-fixes.md`
- Do not modify: `SPEC.md`、`harness/DECISIONS.md`（本次没有新增产品范围或架构决策）

### Step 1：运行完整自动验证

Run：

```bash
npm run verify
```

Expected：Harness checks、生产构建、全量 Vitest 全部通过，0 failed。

### Step 2：记录真实结果

Devlog 必须记录：

- 三个问题各自的最终根因。
- 实际修改文件。
- 新增测试名称和数量。
- `npm run verify` 的真实输出摘要。
- 主人手动测试结果尚未确认时，明确写“待主人验证”，不能提前写“已验证”。

**完成标准：**

- [ ] `npm run verify` 全绿。
- [ ] 新增测试覆盖旧 timeupdate、快速 A→B→C、fullscreen 事件链、layoutRevision 和动画状态类。
- [ ] Devlog 与实际源码、测试结果一致。
- [ ] 未修改依赖、tsconfig、AudioEngine 公共 API。

---

## 整体验收标准

1. `npm run verify` 全部通过，0 failed。
2. 手动切歌期间旧音频事件不会污染新歌词索引，也不会暂停/恢复用户播放状态。
3. 进入和退出全屏后，当前歌词无需等待下一句便立即可见。
4. 普通歌词逐行切换呈现向上流动感，无明显回弹、重影或文字抖动。
5. 自然播放到歌曲结尾仍只切换一首；单曲循环行为不变。
6. 快速连续切换至少 3 首时，最终曲目、歌词、播放状态一致。
7. 无歌词歌曲、双语歌词、点击歌词跳转均不回归。
8. 减少动态效果模式下没有平滑滚动和 transform 动画。

## 手动测试（主人执行）

1. 播放到歌曲中段，分别点击上一首、下一首：歌词直接从新歌开头开始，不先跳到旧位置；声音淡入淡出保持原样。
2. 连续快速点击下一首 3 次：只显示最终歌曲歌词，不崩溃、不连续多跳一首。
3. 让歌曲自然播放结束：只进入下一首，歌词正常加载。
4. 在歌词中段进入全屏：当前歌词立即出现并保持合理位置；退出全屏重复验证。
5. 全屏状态下连续等待 5 句歌词：滚动方向自然，没有上下回弹。
6. 分别播放单语和双语歌词：可见行数维持现有规则，动画均正常。
7. 打开 Windows“关闭动画效果/减少动态效果”后重启应用：歌词切换立即定位，不播放位移动画。

## 实施后审查交接

实现完成后交给 Codex 独立审查，最小审查包包含：

- 本方案文件。
- `git diff -- src/hooks/useAudioSync.ts src/components/LyricsPanel.tsx src/pages/Lyrics.tsx src/styles/lyrics.css tests/useAudioSync.test.tsx tests/LyricsPanel.test.tsx tests/LyricsFullscreen.test.tsx`
- `npm run verify` 输出摘要。
- 主人手动测试结果，尤其是全屏进入/退出与快速连续切歌。
