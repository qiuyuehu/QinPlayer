# Codex 任务包：QinPlayer 歌词界面优化

## 背景
QinPlayer 歌词界面有两个 bug（英文字体全粗、切歌闪跳）和两个体验问题（单语歌词只显示3行、无滚动条）需要修复。

## 目标
修复 bug + 增加歌词行数 + 添加滚动条，所有新功能加 feature flag。

## 非目标
- 不改歌词页面整体布局（左右分屏不变）
- 不改歌词解析逻辑（lrcParser.ts 不动）
- 不改播放控制逻辑（播放/暂停/切歌 不动）
- 不引入新依赖

## 相关文件
- `SPEC.md`
- `harness/CONSTRAINTS.md`
- `harness/DECISIONS.md`
- `src/styles/lyrics.css`（Bug1 + 滚动条样式）
- `src/components/LyricsPanel.tsx`（Bug2 + 行数 + 滚动条逻辑）
- `src/pages/Lyrics.tsx`（切歌清空歌词 + 传 featureFlags）
- `src/types/ipc.ts`（新增 FeatureFlagKey + FeatureFlags 字段）
- `src/utils/featureFlags.ts`（新增 flag 默认值和 key）
- `tests/featureFlags.test.ts`（测试同步更新）
- `tests/setup.ts`（mock 对象同步更新）

## 约束
- 不引入新依赖
- 不改歌词解析逻辑
- 不改播放控制逻辑
- CSS 注释用中文
- 遵守 harness 约束

## 完整方案
见 `docs/plans/PLAN-lyrics-optimization.md`，本任务包是执行摘要。

---

## 执行步骤（按顺序）

### 步骤 1：Feature Flags 新增（4 个文件）

**1.1 `src/types/ipc.ts`**
- FeatureFlagKey 联合类型末尾加 `| 'lyricsMoreLines'` 和 `| 'lyricsScrollbar'`
- FeatureFlags interface 末尾加 `lyricsMoreLines: boolean` 和 `lyricsScrollbar: boolean`

**1.2 `src/utils/featureFlags.ts`**
- FEATURE_FLAG_KEYS 数组末尾加 `'lyricsMoreLines'` 和 `'lyricsScrollbar'`
- DEFAULT_FEATURE_FLAGS 对象末尾加 `lyricsMoreLines: true` 和 `lyricsScrollbar: true`

**1.3 `tests/featureFlags.test.ts`**
- 完整 FeatureFlags mock 对象加 `lyricsMoreLines: true` 和 `lyricsScrollbar: true`

**1.4 `tests/setup.ts`**
- mock FeatureFlags 对象同步更新

验证：`npx tsc --noEmit` 通过

---

### 步骤 2：Bug 1 — 英文字体粗细异常

**`src/styles/lyrics.css` 第 159 行**
```css
/* 改前 */
font-weight: 500;
/* 改后 */
font-weight: 400;
```

验证：grep 确认 `.lyrics-panel__line` 的 font-weight 为 400，`.lyrics-panel__line--active` 仍为 700

---

### 步骤 3：切歌清空旧歌词

**`src/pages/Lyrics.tsx` 第 148 行的 useEffect**

在 effect 开头加清空逻辑：
```tsx
useEffect(() => {
  if (!currentTrack) {
    setLyrics([])
    setLyricsCurrentIndex(-1)   // 新增：无歌时也重置索引
    return
  }

  // 新增：立即清空旧歌词，避免闪显上一首
  setLyrics([])
  setLyricsCurrentIndex(-1)

  // 以下保留现有逻辑（audioPath、lrcPath、invoke read-lrc-file）
  ...
}, [currentTrack])
```

---

### 步骤 4：Lyrics.tsx 传 featureFlags 给 LyricsPanel

**`src/pages/Lyrics.tsx`**
```tsx
// 新增 import
import { useUIStore } from '../stores/uiStore'

// 组件内读取
const featureFlags = useUIStore((s) => s.featureFlags)

// JSX 传入
<LyricsPanel
  lyrics={lyrics}
  currentIndex={lyricsCurrentIndex}
  onLineClick={(time) => setSeekTime(time)}   // 保留现有写法
  featureFlags={featureFlags}                   // 新增
/>
```

---

### 步骤 5：LyricsPanel.tsx 重构（核心改动）

**5.1 新增 import**
```tsx
import type { FeatureFlags } from '../types/ipc'
```

**5.2 Props 扩展**
```tsx
interface LyricsPanelProps {
  lyrics: LyricLine[]
  currentIndex: number
  onLineClick?: (time: number) => void
  featureFlags?: FeatureFlags
}
```

**5.3 新增 ref**
```tsx
const prevIndexRef = useRef(currentIndex)
const prevLyricsRef = useRef(lyrics)
const userScrollingRef = useRef(false)
const scrollTimerRef = useRef<number>(0)
const autoScrollingRef = useRef(false)
const autoScrollTimerRef = useRef<number>(0)
```

**5.4 markUserScrolling + handleScroll**
```tsx
const markUserScrolling = useCallback(() => {
  userScrollingRef.current = true
  clearTimeout(scrollTimerRef.current)
  scrollTimerRef.current = window.setTimeout(() => {
    userScrollingRef.current = false
  }, 3000)
}, [])

const handleUserScroll = markUserScrolling

const handleScroll = useCallback(() => {
  if (autoScrollingRef.current) return
  markUserScrolling()
}, [markUserScrolling])
```

**5.5 替换原 useEffect（transform→scrollTop + autoScrollingRef）**

删除原来的 `container.style.transform = translateY()` 逻辑，替换为方案里的最终版 scrollTop + autoScrollingRef effect。关键点：
- 切歌时：清掉 userScrollingRef，autoScrollingRef=true，`behavior: 'auto'`
- 非切歌：autoScrollingRef=true，`behavior: 'smooth'`，保守等 500ms 后清除
- 手动滚动期间跳过自动滚动

**5.6 unmount cleanup**
```tsx
useEffect(() => {
  return () => {
    clearTimeout(scrollTimerRef.current)
    clearTimeout(autoScrollTimerRef.current)
  }
}, [])
```

**5.7 行数守卫（lyricsMoreLines flag）**
```tsx
const moreLines = featureFlags?.lyricsMoreLines !== false
// 改 isVisible 和 opacity
const isVisible = index >= 0 && distance >= (moreLines ? -1 : 0) && distance <= (moreLines ? 4 : 2)
const opacity = isVisible ? (
  distance === 0 ? 1 :
  Math.abs(distance) === 1 ? 0.5 :
  Math.abs(distance) === 2 ? 0.3 :
  0.15
) : 0
```

**5.8 JSX 最终版**
```tsx
const scrollbarEnabled = featureFlags?.lyricsScrollbar !== false
const handleWheel = scrollbarEnabled ? handleUserScroll : (e: React.WheelEvent) => e.preventDefault()

<div
  className={`lyrics-panel ${scrollbarEnabled ? 'lyrics-panel--scrollbar' : ''}`}
  ref={containerRef}
  onWheel={handleWheel}
  onScroll={scrollbarEnabled ? handleScroll : undefined}
  style={!scrollbarEnabled ? { overflow: 'hidden' } : undefined}
>
```

**5.9 顶部注释更新**
删除 "GPU 加速：使用 CSS transform: translateY()" 和 "不用 scrollTop（易掉帧）"，改为 "使用 scrollTop 滚动 + 滚动条"

---

### 步骤 6：lyrics.css 滚动条样式

**6.1 删除原隐藏滚动条代码**
```css
/* 删除 */
.lyrics-panel::-webkit-scrollbar { display: none; }
.lyrics-panel { -ms-overflow-style: none; scrollbar-width: none; }
```

**6.2 修改 .lyrics-panel 基础样式**
```css
.lyrics-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 删除 transition: transform 和 will-change: transform */
}
```

**6.3 新增 modifier class**
```css
.lyrics-panel--scrollbar {
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.lyrics-panel--scrollbar:hover {
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
}
.lyrics-panel--scrollbar::-webkit-scrollbar { width: 6px; }
.lyrics-panel--scrollbar::-webkit-scrollbar-track { background: transparent; }
.lyrics-panel--scrollbar::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
  transition: background 0.3s ease;
}
.lyrics-panel--scrollbar:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
}
.lyrics-panel--scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}
```

---

### 步骤 7：验证

1. `npx tsc --noEmit` — 类型检查通过
2. `npx vitest run` — 测试通过
3. grep 验证：
   - `.lyrics-panel__line` font-weight 为 400
   - `.lyrics-panel__line--active` font-weight 为 700
   - 无残留 `transform: translateY` 引用
   - 无残留 `will-change: transform`
   - FeatureFlagKey 包含 lyricsMoreLines 和 lyricsScrollbar

---

## 返回格式
- 修改了哪些文件，每文件改了什么
- tsc 输出
- 测试输出
- grep 验证结果
- 未修改的文件确认
