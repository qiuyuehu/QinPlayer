# 修复：切歌时歌词滚动位置未归零

## 问题描述

播放歌曲到中间位置，切换下一首歌时，歌词会先出现在上一首歌的滚动偏移位置，再回弹到第一句。

## 根因分析

**React 复用 DOM 节点 + 状态未与曲目绑定，导致 scrollTop 残留。**

切歌时时序：

1. `currentTrack` 变化 → Lyrics 重新渲染，LyricsPanel 拿到新 key
2. 但 `lyrics`/`lyricsCurrentIndex` 仍是旧值（useEffect 还没执行）
3. 新 LyricsPanel 以旧值提交 → useEffect 触发 → 滚到旧位置
4. useEffect 清空状态 → 再次渲染 → 回弹到顶部

**根因**：歌词状态没有与曲目身份绑定，新面板可以拿到旧曲目的歌词。

## 修复方案

核心思路：**歌词状态与 trackId 绑定，同步切断旧歌词传入。**

### 改动 1：`src/pages/Lyrics.tsx`

#### 1a. 歌词状态与 trackId 绑定

将 `lyrics` 状态从 `LyricLine[]` 改为 `{ trackId: number | null, lines: LyricLine[] }`：

```tsx
// --- 歌词状态 ---
const [lyricsData, setLyricsData] = useState<{ trackId: number | null; lines: LyricLine[] }>({
  trackId: null,
  lines: [],
})

// 向面板传入歌词：只有 trackId 匹配时才传真实歌词，否则传空数组
const lyrics = lyricsData.trackId === currentTrack?.id ? lyricsData.lines : []
```

这样即使状态更新有延迟，面板也只会拿到当前曲目的歌词。

#### 1b. 用 request token 替代 trackId 比对（解决 A→B→A 竞态）

在 LRC 加载 effect 中用 `useRef` 记录当前请求序号。进入 effect 后先递增 token，再处理空曲目：

```tsx
const lrcRequestRef = useRef(0)  // ★ 当前 LRC 请求序号

useEffect(() => {
  // ★ 先递增 token，阻止退出播放状态后旧请求继续写状态
  const requestId = ++lrcRequestRef.current

  if (!currentTrack) {
    setLyricsData({ trackId: null, lines: [] })
    setLyricsCurrentIndex(-1)
    return
  }

  // 立即清空旧歌词
  setLyricsData({ trackId: currentTrack.id, lines: [] })
  setLyricsCurrentIndex(-1)

  const audioPath = currentTrack.filePath
  const lrcPath = audioPath.replace(/\.[^.]+$/, '.lrc')

  window.electronAPI.invoke('read-lrc-file', lrcPath)
    .then((content: string | null) => {
      // ★ 竞态保护：请求已过期，丢弃结果
      if (requestId !== lrcRequestRef.current) return
      if (content) {
        const parsed = parseLrc(content)
        setLyricsData({ trackId: currentTrack.id, lines: parsed })
        console.log('[Lyrics] 歌词加载成功，共', parsed.length, '行')
      } else {
        setLyricsData({ trackId: currentTrack.id, lines: [] })
      }
    })
    .catch(() => {
      if (requestId !== lrcRequestRef.current) return
      setLyricsData({ trackId: currentTrack.id, lines: [] })
    })

  // 封面取色也用同一 request token
  if (currentTrack.coverPath) {
    const coverUrl = window.electronAPI.getCoverUrl(currentTrack.coverPath)
    extractMainColor(coverUrl).then((color) => {
      if (requestId !== lrcRequestRef.current) return
      setBgColor(color)
    })
  } else {
    setBgColor('')
  }
}, [currentTrack])
```

**request token 优势**：每次切歌递增序号，旧请求完成时序号不匹配直接丢弃。A→B→A 场景下，第二次切回 A 时序号已更新，旧 A 请求被丢弃。

#### 1c. 同步更新 lyricsRef

```tsx
useEffect(() => { lyricsRef.current = lyrics }, [lyrics])
```

这里 `lyrics` 是从 `lyricsData` 派生的（trackId 匹配时为 lines，否则为 []），所以 ref 自动跟随。

#### 1d. 给 LyricsPanel 加 key

```tsx
<LyricsPanel
  key={currentTrack?.id ?? 'no-track'}
  lyrics={lyrics}
  currentIndex={lyricsCurrentIndex}
  onLineClick={(time) => setSeekTime(time)}
  featureFlags={featureFlags}
/>
```

### 改动 2：`tests/setup.ts`

补充缺失的 mock：

```tsx
// 模拟 window.electronAPI（渲染进程的 Electron 桥接）
window.electronAPI = {
  // ... 现有 mock ...
  setAlwaysOnTop: async () => {},  // ★ 缺失
}

// ★ RAF mock（Lyrics 的 RAF 循环需要）— 固定 ID、不执行回调
if (!globalThis.requestAnimationFrame) {
  let rafId = 0
  globalThis.requestAnimationFrame = (_cb: FrameRequestCallback) => ++rafId
  globalThis.cancelAnimationFrame = (_id: number) => {}
}
```

### 改动 3：`tests/LyricsPanel.test.tsx`

新增切歌滚动归零回归测试组。使用真实的 Lyrics 页面渲染，通过可控的 deferred IPC Promise 验证完整流程。用 `waitFor()` 等待异步状态更新，不依赖 fake timers。

```tsx
import { act, waitFor } from '@testing-library/react'
import Lyrics from '../src/pages/Lyrics'
import { usePlayerStore } from '../src/stores/playerStore'

// Track fixture（包含所有必填字段）
function createTrack(id: number, title: string) {
  return {
    id,
    filePath: `/test/song${id}.mp3`,
    fileName: `song${id}.mp3`,
    title,
    artist: '歌手',
    album: '专辑',
    duration: 180,
    coverPath: null,
    mtime: 0,
    playCount: 0,
    createdAt: '2026-07-10',
  }
}

// 创建可控的 deferred Promise
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// scrollTo mock：同步修改 scrollTop
function installScrollToMock() {
  const original = HTMLElement.prototype.scrollTo
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    value(options: { top?: number }) {
      if (options?.top !== undefined) {
        (this as HTMLElement).scrollTop = options.top
      }
    },
    writable: true,
  })
  return () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: original, writable: true })
  }
}

describe('LyricsPanel 切歌滚动归零', () => {
  beforeEach(() => {
    // 重置 store
    usePlayerStore.setState({ currentTrack: null, duration: 0 })
  })

  it('切歌时旧歌词应该立即消失', async () => {
    const restoreScrollTo = installScrollToMock()
    try {
      const lrcDeferredA = createDeferred<string | null>()
      window.electronAPI.invoke = vi.fn().mockImplementation((channel: string) => {
        if (channel === 'read-lrc-file') return lrcDeferredA.promise
        return Promise.resolve(null)
      })

      act(() => {
        usePlayerStore.setState({ currentTrack: createTrack(1, '歌曲A'), duration: 180 })
      })
      const { container } = render(<Lyrics />)

      // A 的歌词加载完成
      await act(async () => {
        lrcDeferredA.resolve('[00:05.00]A第一句\n[00:10.00]A第二句')
      })

      // 确认 A 的歌词已渲染
      await waitFor(() => {
        expect(container.querySelector('.lyrics-panel__line')).toBeTruthy()
      })

      // 切到歌曲 B（B 的 IPC 返回 deferred，暂不完成）
      const lrcDeferredB = createDeferred<string | null>()
      window.electronAPI.invoke = vi.fn().mockImplementation((channel: string) => {
        if (channel === 'read-lrc-file') return lrcDeferredB.promise
        return Promise.resolve(null)
      })

      act(() => {
        usePlayerStore.setState({ currentTrack: createTrack(2, '歌曲B'), duration: 200 })
      })

      // 切歌提交后，旧歌词应该立即消失
      const lines = container.querySelectorAll('.lyrics-panel__line')
      const hasOldLyrics = Array.from(lines).some(el => el.textContent?.includes('A第一句'))
      expect(hasOldLyrics).toBe(false)

      restoreScrollTo()
    } catch (e) {
      restoreScrollTo()
      throw e
    }
  })

  it('切歌时 DOM 节点应该被替换且 scrollTop 归零', async () => {
    const restoreScrollTo = installScrollToMock()
    try {
      const lrcDeferredA = createDeferred<string | null>()
      window.electronAPI.invoke = vi.fn().mockImplementation((channel: string) => {
        if (channel === 'read-lrc-file') return lrcDeferredA.promise
        return Promise.resolve(null)
      })

      act(() => {
        usePlayerStore.setState({ currentTrack: createTrack(1, '歌曲A'), duration: 180 })
      })
      const { container } = render(<Lyrics />)

      // A 的歌词加载完成
      await act(async () => {
        lrcDeferredA.resolve('[00:05.00]A歌词\n[00:10.00]A第二句')
      })

      await waitFor(() => {
        expect(container.querySelector('.lyrics-panel__line')).toBeTruthy()
      })

      // ★ 先把旧面板设为非零滚动位置
      const oldPanel = container.querySelector('.lyrics-panel') as HTMLElement
      expect(oldPanel).toBeTruthy()
      oldPanel.scrollTop = 240

      // 切到 B
      const lrcDeferredB = createDeferred<string | null>()
      window.electronAPI.invoke = vi.fn().mockImplementation((channel: string) => {
        if (channel === 'read-lrc-file') return lrcDeferredB.promise
        return Promise.resolve(null)
      })

      act(() => {
        usePlayerStore.setState({ currentTrack: createTrack(2, '歌曲B'), duration: 200 })
      })

      // ★ DOM 节点应该被替换（key 生效）
      const newPanel = container.querySelector('.lyrics-panel') as HTMLElement
      expect(newPanel).toBeTruthy()  // 不能跳过，必须存在
      expect(newPanel).not.toBe(oldPanel)

      // ★ 新节点 scrollTop 必须是 0
      expect(newPanel.scrollTop).toBe(0)

      restoreScrollTo()
    } catch (e) {
      restoreScrollTo()
      throw e
    }
  })

  it('快速 A→B→A 切歌最终只显示第二次 A 的歌词', async () => {
    const restoreScrollTo = installScrollToMock()
    try {
      // 初始 A 的 IPC（deferred A1，暂不完成）
      const lrcDeferredA1 = createDeferred<string | null>()
      window.electronAPI.invoke = vi.fn().mockImplementation((channel: string) => {
        if (channel === 'read-lrc-file') return lrcDeferredA1.promise
        return Promise.resolve(null)
      })

      act(() => {
        usePlayerStore.setState({ currentTrack: createTrack(1, '歌曲A'), duration: 180 })
      })
      const { container } = render(<Lyrics />)

      // 快速切到 B（IPC 返回 deferred B）
      const lrcDeferredB = createDeferred<string | null>()
      window.electronAPI.invoke = vi.fn().mockImplementation((channel: string) => {
        if (channel === 'read-lrc-file') return lrcDeferredB.promise
        return Promise.resolve(null)
      })

      act(() => {
        usePlayerStore.setState({ currentTrack: createTrack(2, '歌曲B'), duration: 200 })
      })

      // 快速切回 A（IPC 返回 deferred A2）
      const lrcDeferredA2 = createDeferred<string | null>()
      window.electronAPI.invoke = vi.fn().mockImplementation((channel: string) => {
        if (channel === 'read-lrc-file') return lrcDeferredA2.promise
        return Promise.resolve(null)
      })

      act(() => {
        usePlayerStore.setState({ currentTrack: createTrack(1, '歌曲A'), duration: 180 })
      })

      // ★ A2 先完成（当前请求，应该生效）
      await act(async () => {
        lrcDeferredA2.resolve('[00:05.00]第二次A的歌词')
      })

      // 过期的 B 后完成（应该被丢弃）
      await act(async () => {
        lrcDeferredB.resolve('[00:05.00]B歌词')
      })

      // 过期的 A1 最后完成（应该被丢弃）
      await act(async () => {
        lrcDeferredA1.resolve('[00:05.00]第一次A的歌词')
      })

      // ★ 最终只显示第二次 A 的独特歌词
      await waitFor(() => {
        const lines = container.querySelectorAll('.lyrics-panel__line')
        const texts = Array.from(lines).map(el => el.textContent).join(' ')
        expect(texts).toContain('第二次A的歌词')
        expect(texts).not.toContain('B歌词')
        expect(texts).not.toContain('第一次A的歌词')
      })

      restoreScrollTo()
    } catch (e) {
      restoreScrollTo()
      throw e
    }
  })

  it('无 LRC 文件时切歌不崩溃', async () => {
    const restoreScrollTo = installScrollToMock()
    try {
      const lrcDeferredA = createDeferred<string | null>()
      window.electronAPI.invoke = vi.fn().mockImplementation((channel: string) => {
        if (channel === 'read-lrc-file') return lrcDeferredA.promise
        return Promise.resolve(null)
      })

      act(() => {
        usePlayerStore.setState({ currentTrack: createTrack(1, '歌曲A'), duration: 180 })
      })
      const { container } = render(<Lyrics />)

      // A 无歌词
      await act(async () => {
        lrcDeferredA.resolve(null)
      })

      // 切到 B（也无歌词）
      const lrcDeferredB = createDeferred<string | null>()
      window.electronAPI.invoke = vi.fn().mockImplementation((channel: string) => {
        if (channel === 'read-lrc-file') return lrcDeferredB.promise
        return Promise.resolve(null)
      })

      act(() => {
        usePlayerStore.setState({ currentTrack: createTrack(2, '歌曲B'), duration: 200 })
      })

      await act(async () => {
        lrcDeferredB.resolve(null)
      })

      // 不崩溃，显示空面板
      await waitFor(() => {
        expect(container.querySelector('.lyrics-panel--empty')).toBeInTheDocument()
      })

      restoreScrollTo()
    } catch (e) {
      restoreScrollTo()
      throw e
    }
  })
})
```

## Harness 约束检查

- 不涉及主进程、Worker、同步 I/O
- 不修改 `package.json`、`tsconfig.json`
- 不删除现有测试用例
- 通过

## 验证步骤

1. `npx tsc --noEmit` — 类型检查
2. `npm test` — 全量测试（含 harness 约束检查）
3. 主人手动测试：
   - 播放到中间 → 切下一首 → 歌词不闪烁
   - 快速连切 3 首 → 不崩溃、歌词最终正确
   - 歌曲自然结束自动切下一首 → 歌词不闪烁
   - 无 LRC 的歌曲 → 切歌不崩溃

## 方案总结

| 层 | 防线 | 作用 |
|----|------|------|
| 状态绑定 | `lyricsData.trackId` 与 `currentTrack.id` 匹配 | 面板只拿当前曲目的歌词 |
| key 重建 | `key={currentTrack?.id}` | DOM 节点卸载重建，scrollTop 天然归零 |
| request token | `lrcRequestRef` 递增序号 | A→B→A 竞态保护 |
