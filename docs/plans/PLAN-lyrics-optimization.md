# QinPlayer 歌词界面优化方案

## 前置条件
- 身份：work profile 衾衾，负责写方案+审查
- 执行者：Codex（写代码），衾衾（审查）
- 项目路径：C:\Users\秋月\Desktop\QinPlayer\
- WSL路径：/mnt/c/Users/秋月/Desktop/QinPlayer/
- 技术栈：Electron + React + TypeScript + Zustand + electron-vite
- CSS注释语言：中文
- 开工前必读：SPEC.md → harness/CONSTRAINTS.md → harness/DECISIONS.md

## 背景

QinPlayer 歌词界面存在两个bug和一个体验问题需要修复。

## Bug 1：英文字体粗细异常

**现象**：中文歌词只有当前行加粗，英文歌词所有行都加粗。

**根因**：`.lyrics-panel__line` 的 `font-weight: 500`。HarmonyOS Sans SC 的 500 在英文下视觉接近粗体（英文字母笔画简单，500 就显得很粗），中文因为笔画复杂，500 看起来正常。

**修复**：将 `.lyrics-panel__line` 的 `font-weight` 从 500 改为 400。

**文件**：`src/styles/lyrics.css:159`

**改动**：
```css
/* 改前 */
.lyrics-panel__line {
  font-weight: 500;
}

/* 改后 */
.lyrics-panel__line {
  font-weight: 400;
}
```

**完成标准**：
- [ ] 非当前行歌词 font-weight 为 400
- [ ] 当前行仍为 700（`.lyrics-panel__line--active` 不变）
- [ ] 英文歌词只有当前行加粗
- [ ] 中文歌词只有当前行加粗

## Bug 2：切歌歌词闪跳（在需求2的scrollTop方案中一并修复）

**现象**：播放新歌曲时，歌词有概率先闪出中间位置的歌词，然后跳到第一行。

**根因**：`LyricsPanel.tsx` 用 `container.style.transform = translateY()` 做滚动。切歌时 `currentIndex` 变成 0，但 `transform` 还停在上一首歌的中间位置，新歌词先在旧位置渲染再跳转。

**修复方式**：本bug在需求2的scrollTop方案中一并解决——切歌时 `container.scrollTo({ top: targetScroll })` 不加 `behavior: 'smooth'` 就是直接跳转，不会闪跳。正常播放时加 `behavior: 'smooth'` 保持平滑。详见需求2的TSX改动。

**完成标准**：
- [ ] 切歌时歌词直接跳到第一行，无闪跳
- [ ] 正常播放时歌词滚动动画仍然平滑
- [ ] 快速连续切歌不出现异常

## 需求 1：单语歌词显示更多行

**现象**：单语歌词只显示当前行+后2行（共3行），看起来很单调。双语歌词因为有翻译行，3行够用。

**修复**：将可见范围从「当前行+后2行」改为「前1行+当前行+后4行」（共6行单语 / 约3行双语），让歌词区更丰满。

**文件**：`src/components/LyricsPanel.tsx:70`

**改动**：
```tsx
// 改前
const isVisible = distance >= 0 && distance <= 2
const opacity = isVisible ? (distance === 0 ? 1 : distance === 1 ? 0.5 : 0.25) : 0

// 改后
const isVisible = index >= 0 && distance >= -1 && distance <= 4
const opacity = isVisible ? (
  distance === 0 ? 1 :
  Math.abs(distance) === 1 ? 0.5 :
  Math.abs(distance) === 2 ? 0.3 :
  0.15
) : 0
```

**边界情况**：
- `index >= 0` 保护：当 currentIndex=0 时 distance=-1 对应 index=-1，加 index>=0 防止越界
- 双语歌词：前1行+当前行+后4行 = 最多6个歌词块（含翻译），每块2行 = 12行文字，不会溢出
- 歌曲结尾：distance > 最后一行时正常隐藏

**完成标准**：
- [ ] 单语歌词显示前1行+当前行+后4行
- [ ] 双语歌词显示正常（翻译行跟着主行）
- [ ] 歌曲开头不出现 index 负数问题
- [ ] 透明度梯度平滑，当前行最亮，越远越淡

## 需求 2：歌词区透明滚动条

**现象**：歌词区没有滚动条，用户无法手动滚动查看未播放的歌词。

**修复**：添加透明滚动条，鼠标 hover 时显示，支持滚动和点击跳转。

**文件**：`src/styles/lyrics.css`

**改动**：

0. 修改 `.lyrics-panel` 基础样式（transform→scrollTop 需要固定高度+overflow）：
```css
/* 改前 */
.lyrics-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  transition: transform 0.3s ease;
  will-change: transform;
}

/* 改后：删除 transition 和 will-change，改用 scrollTop 滚动 */
.lyrics-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: none;  /* 默认隐藏滚动条 */
  -ms-overflow-style: none;
}
.lyrics-panel::-webkit-scrollbar {
  display: none;  /* 默认隐藏滚动条 */
}
```

然后删除原来的隐藏滚动条样式（需求2会用 modifier class 统一控制）：
```css
/* 删除以下代码 */
.lyrics-panel::-webkit-scrollbar {
  display: none;
}
.lyrics-panel {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

**技术方案**：将歌词滚动从 `transform: translateY()` 改为 `scrollTop`。transform 做 GPU 加速滚动的初衷是性能，但歌词滚动量不大（几百px），scrollTop 完全够用，且原生支持滚动条。

**LyricsPanel.tsx 改动**：

1. 删除 transform 滚动逻辑，改用 scrollTop + autoScrollingRef。**切歌优先级高于手动滚动**：
```tsx
const prevIndexRef = useRef(currentIndex)
const prevLyricsRef = useRef(lyrics)

useEffect(() => {
  if (currentIndex < 0 || !containerRef.current) return
  const currentElement = itemRefs.current[currentIndex]
  if (!currentElement) return

  const container = containerRef.current
  const containerHeight = container.clientHeight
  const elementTop = currentElement.offsetTop
  const elementHeight = currentElement.offsetHeight
  const targetScroll = elementTop - containerHeight * 0.35 + elementHeight / 2

  // 判断是否为切歌：歌词数组变化 或 currentIndex 跳变幅度大 或 回到第一行
  const isTrackChange = lyrics !== prevLyricsRef.current
  const isJump = isTrackChange || Math.abs(currentIndex - prevIndexRef.current) > 3 || currentIndex === 0

  if (isJump) {
    // 切歌：清掉手动滚动状态，直接跳转
    userScrollingRef.current = false
    clearTimeout(scrollTimerRef.current)
    autoScrollingRef.current = true
    container.scrollTo({ top: targetScroll, behavior: 'auto' })
    autoScrollingRef.current = false  // auto 无动画，立即清除
  } else if (!userScrollingRef.current) {
    // 非切歌 + 非手动滚动：平滑自动滚动
    autoScrollingRef.current = true
    container.scrollTo({ top: targetScroll, behavior: 'smooth' })
    // smooth 持续多帧，保守等 500ms 后再允许 onScroll 触发用户滚动锁
    const scrollDistance = Math.abs(targetScroll - container.scrollTop)
    const animDuration = Math.max(500, scrollDistance * 0.4)
    clearTimeout(autoScrollTimerRef.current)
    autoScrollTimerRef.current = window.setTimeout(() => {
      autoScrollingRef.current = false
    }, animDuration)
  }
  // 手动滚动期间不自动滚动

  prevIndexRef.current = currentIndex
  prevLyricsRef.current = lyrics
}, [currentIndex, lyrics])
```

2. 添加 ref 和 markUserScrolling 工具函数：
```tsx
const userScrollingRef = useRef(false)
const scrollTimerRef = useRef<number>(0)
const autoScrollingRef = useRef(false)
const autoScrollTimerRef = useRef<number>(0)

// 标记用户手动滚动，暂停自动滚动3秒
const markUserScrolling = useCallback(() => {
  userScrollingRef.current = true
  clearTimeout(scrollTimerRef.current)
  scrollTimerRef.current = window.setTimeout(() => {
    userScrollingRef.current = false
  }, 3000)
}, [])

// onWheel：滚轮滚动时标记
const handleUserScroll = markUserScrolling

// onScroll：拖动/点击滚动条时标记（过滤自动滚动触发的 scroll）
const handleScroll = useCallback(() => {
  if (autoScrollingRef.current) return
  markUserScrolling()
}, [markUserScrolling])
```

3. JSX 绑定事件
```tsx
const scrollbarEnabled = featureFlags?.lyricsScrollbar !== false

// flag 关闭时阻止所有手动滚动（滚轮 + 拖动滚动条）
const handleWheel = scrollbarEnabled ? handleUserScroll : (e: React.WheelEvent) => e.preventDefault()

<div
  className={`lyrics-panel ${scrollbarEnabled ? 'lyrics-panel--scrollbar' : ''}`}
  ref={containerRef}
  onWheel={handleWheel}
  onScroll={scrollbarEnabled ? handleScroll : undefined}
  style={!scrollbarEnabled ? { overflow: 'hidden' } : undefined}
>
```

**边界情况**：
- 用户滚轮滚动后3秒恢复自动滚动
- 快速切歌时清除滚动定时器，避免旧定时器干扰
- 暗色主题下滚动条颜色：rgba(255,255,255,0.3) 半透明白色

**完成标准**：
- [ ] 鼠标 hover 歌词区时显示细滚动条
- [ ] 鼠标离开后滚动条渐隐
- [ ] 滚轮滚动可以浏览歌词
- [ ] 点击滚动条可以跳转到对应位置
- [ ] 自动播放时歌词仍然平滑滚动（scrollTop + smooth）
- [ ] 手动滚动后3秒恢复自动滚动
- [ ] 快速切歌时自动滚动不被手动滚动定时器干扰

## 功能开关

Bug修复不需要开关。需求1和需求2是行为变更，需要功能开关。

新增两个 feature flag：
- `lyricsMoreLines`：歌词显示更多行（默认 true）
- `lyricsScrollbar`：歌词区滚动条（默认 true）

### 改动文件（6处）

**1. `src/types/ipc.ts` — 类型定义**
```typescript
// FeatureFlagKey 联合类型加两行
export type FeatureFlagKey =
  | 'playback'
  // ... 现有 flag ...
  | 'queuePanel'
  | 'lyricsMoreLines'   // 新增
  | 'lyricsScrollbar'   // 新增

// FeatureFlags interface 加两行
export interface FeatureFlags {
  // ... 现有字段 ...
  queuePanel: boolean
  lyricsMoreLines: boolean   // 新增
  lyricsScrollbar: boolean   // 新增
}
```

**2. `src/utils/featureFlags.ts` — 默认值和 key 列表**
```typescript
// FEATURE_FLAG_KEYS 数组加两行
export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = [
  // ... 现有 ...
  'queuePanel',
  'lyricsMoreLines',   // 新增
  'lyricsScrollbar',   // 新增
]

// DEFAULT_FEATURE_FLAGS 对象加两行
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  // ... 现有 ...
  queuePanel: true,
  lyricsMoreLines: true,   // 新增
  lyricsScrollbar: true,   // 新增
}
```

**3. `src/pages/Lyrics.tsx` — 父组件传入 featureFlags**
```tsx
// Lyrics.tsx 中读取 featureFlags 并传给 LyricsPanel
import { useUIStore } from '../stores/uiStore'

// 在组件内
const featureFlags = useUIStore((s) => s.featureFlags)

// JSX 中传入
<LyricsPanel
  lyrics={lyrics}
  currentIndex={lyricsCurrentIndex}
  onLineClick={(time) => setSeekTime(time)}   // 保留现有写法
  featureFlags={featureFlags}                   // 新增
/>
```

**4. `src/components/LyricsPanel.tsx` — 歌词行数守卫**
```tsx
import type { FeatureFlags } from '../types/ipc'   // 新增 import

interface LyricsPanelProps {
  lyrics: LyricLine[]
  currentIndex: number
  onLineClick?: (time: number) => void
  featureFlags?: FeatureFlags   // 新增
}

// 使用时判断
const moreLines = featureFlags?.lyricsMoreLines !== false
const isVisible = index >= 0 && distance >= (moreLines ? -1 : 0) && distance <= (moreLines ? 4 : 2)
```

**5. `src/components/LyricsPanel.tsx` — 滚动条守卫**

见上方「需求 2」的 JSX 绑定部分（handleWheel + onScroll + style overflow:hidden），此处不重复。

```css
/* 滚动条样式只在启用时生效 */
.lyrics-panel--scrollbar {
  scrollbar-width: thin;  /* Firefox */
  scrollbar-color: transparent transparent;
}
.lyrics-panel--scrollbar::-webkit-scrollbar {
  display: block;  /* 覆盖基础样式的隐藏 */
  width: 6px;
}

.lyrics-panel--scrollbar:hover {
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
}

.lyrics-panel--scrollbar::-webkit-scrollbar {
  width: 6px;
}

.lyrics-panel--scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

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

## 切歌时清空旧歌词

**问题**：当前 Lyrics.tsx 在 currentTrack 改变后不会立刻清空 lyrics，而是等新 .lrc 读完。期间可能显示上一首歌词。

**修复**：在 currentTrack effect 开头先清空歌词和索引，再异步加载新歌词。

**文件**：`src/pages/Lyrics.tsx`

**改动**（基于 Lyrics.tsx 第148行的实际代码）：
```tsx
useEffect(() => {
  if (!currentTrack) {
    setLyrics([])
    setLyricsCurrentIndex(-1)   // 补上：无歌时也重置索引
    return
  }

  // 立即清空旧歌词，避免闪显上一首
  setLyrics([])
  setLyricsCurrentIndex(-1)

  // 以下保留现有逻辑不变
  const audioPath = currentTrack.filePath
  const lrcPath = audioPath.replace(/\.[^.]+$/, '.lrc')

  window.electronAPI.invoke('read-lrc-file', lrcPath)
    .then((content: string | null) => {
      if (content) {
        const parsed = parseLrc(content)
        setLyrics(parsed)
      } else {
        setLyrics([])
      }
    })
    .catch(() => {
      setLyrics([])
    })
}, [currentTrack])
```

## 补充事项

**1. 测试同步更新**
- `tests/featureFlags.test.ts`：完整 FeatureFlags 对象需加 `lyricsMoreLines: true` 和 `lyricsScrollbar: true`
- `tests/setup.ts`：mock FeatureFlags 对象同步更新

**2. 注释更新**
- `LyricsPanel.tsx` 顶部注释：删除"GPU 加速：使用 CSS transform: translateY() + will-change: transform"、"不用 scrollTop（易掉帧）"，改为"使用 scrollTop 滚动 + 滚动条"

**3. scrollTimerRef + autoScrollTimerRef cleanup**
```tsx
useEffect(() => {
  return () => {
    clearTimeout(scrollTimerRef.current)
    clearTimeout(autoScrollTimerRef.current)
  }
}, [])
```

## 验收标准

1. 英文歌词只有当前行加粗，其他行正常
2. 切歌时歌词直接跳到第一行，无闪跳
3. 单语歌词显示6行（前1+当前+后4），透明度梯度平滑
4. 歌词区 hover 时显示透明滚动条，支持手动滚动
5. lyricsMoreLines=false 时歌词回到3行显示
6. lyricsScrollbar=false 时滚动条隐藏，手动滚动不生效
7. 所有改动不影响现有播放功能
8. 测试通过

## 手动测试（主人执行）

1. 播放英文歌，确认只有当前行加粗
2. 播放中文歌，确认只有当前行加粗
3. 快速切换歌曲，确认歌词不闪跳
4. 播放单语歌词，确认显示6行
5. 播放双语歌词，确认显示正常
6. hover 歌词区，确认滚动条出现
7. 滚轮滚动歌词区，确认可以浏览
8. 停止滚动3秒后，确认自动滚动恢复
