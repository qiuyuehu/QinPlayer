# Codex 任务包：修复切歌时歌词滚动位置未归零

## 背景

播放歌曲到中间位置，切换下一首歌时，歌词会先出现在上一首歌的滚动偏移位置，再回弹到第一句。根因是 React 复用 DOM 节点 + 歌词状态未与曲目身份绑定，导致 scrollTop 残留。

方案经三审通过，测试方案也已修订通过。

## 目标

1. 实现歌词状态与 trackId 绑定，面板只拿当前曲目的歌词
2. 给 LyricsPanel 加 key，切歌时 DOM 节点卸载重建
3. 用 request token 解决 A→B→A 异步竞态
4. 补充 setup.ts 缺失的 mock
5. 写 4 个回归测试并通过

## 非目标

- 不改 LyricsPanel 组件内部逻辑
- 不改歌词解析器
- 不改播放器 store
- 不引入新依赖

## 相关文件

- `SPEC.md` — 项目规格书
- `harness/CONSTRAINTS.md` — 代码约束
- `harness/TEST_CONVENTIONS.md` — 测试规范
- `src/pages/Lyrics.tsx` — 歌词页面（主要改动）
- `src/components/LyricsPanel.tsx` — 歌词面板（只加 key，不改内部）
- `src/types/index.ts` — Track 类型（含 createdAt 必填字段）
- `tests/setup.ts` — 测试环境初始化（补充 mock）
- `tests/LyricsPanel.test.tsx` — 歌词面板测试（新增回归测试）
- `docs/plans/PLAN-fix-lyrics-scroll-reset.md` — 完整方案（三审通过）

## 约束

- 不引入新依赖
- 不修改 `package.json`、`tsconfig.json`
- 不删除现有测试用例
- 不改 LyricsPanel 组件内部逻辑（只在 Lyrics.tsx 侧加 key）
- 遵守 harness 约束（主进程禁止同步 I/O、currentTime 不放 Zustand 等）
- 测试用中文描述、动词开头
- 注释用中文

## 当前方案（三审通过）

### 核心改动：`src/pages/Lyrics.tsx`

**1. 歌词状态与 trackId 绑定**

将 `lyrics` 状态从 `LyricLine[]` 改为 `{ trackId: number | null, lines: LyricLine[] }`：

```tsx
const [lyricsData, setLyricsData] = useState<{ trackId: number | null; lines: LyricLine[] }>({
  trackId: null,
  lines: [],
})

// 只有 trackId 匹配时才传真实歌词，否则传空数组
const lyrics = lyricsData.trackId === currentTrack?.id ? lyricsData.lines : []
```

**2. request token（解决 A→B→A 竞态）**

```tsx
const lrcRequestRef = useRef(0)

useEffect(() => {
  const requestId = ++lrcRequestRef.current  // 先递增 token

  if (!currentTrack) {
    setLyricsData({ trackId: null, lines: [] })
    setLyricsCurrentIndex(-1)
    return
  }

  setLyricsData({ trackId: currentTrack.id, lines: [] })
  setLyricsCurrentIndex(-1)

  const audioPath = currentTrack.filePath
  const lrcPath = audioPath.replace(/\.[^.]+$/, '.lrc')

  window.electronAPI.invoke('read-lrc-file', lrcPath)
    .then((content: string | null) => {
      if (requestId !== lrcRequestRef.current) return  // 竞态保护
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

**3. 同步更新 lyricsRef**

```tsx
useEffect(() => { lyricsRef.current = lyrics }, [lyrics])
```

**4. 给 LyricsPanel 加 key**

```tsx
<LyricsPanel
  key={currentTrack?.id ?? 'no-track'}
  lyrics={lyrics}
  currentIndex={lyricsCurrentIndex}
  onLineClick={(time) => setSeekTime(time)}
  featureFlags={featureFlags}
/>
```

### setup.ts 补充

```tsx
// 补充缺失的 mock
setAlwaysOnTop: async () => {},

// RAF mock — 固定 ID、不执行回调
if (!globalThis.requestAnimationFrame) {
  let rafId = 0
  globalThis.requestAnimationFrame = (_cb: FrameRequestCallback) => ++rafId
  globalThis.cancelAnimationFrame = (_id: number) => {}
}
```

### 测试方案（4 个用例）

详见 `docs/plans/PLAN-fix-lyrics-scroll-reset.md` 的改动 3 部分。关键点：

1. **切歌时旧歌词应该立即消失** — 渲染 Lyrics，A 加载完成，切 B，断言旧歌词不在 DOM 中
2. **切歌时 DOM 节点应该被替换且 scrollTop 归零** — 先设 oldPanel.scrollTop = 240，切歌后断言 newPanel !== oldPanel 且 scrollTop === 0
3. **快速 A→B→A 切歌最终只显示第二次 A 的歌词** — A2 先完成（生效），过期 B 和 A1 后完成（被丢弃），断言只显示 `第二次A的歌词`
4. **无 LRC 文件时切歌不崩溃** — A 无歌词，切 B 也无歌词，断言显示空面板

测试用 `waitFor()` 等待异步状态更新，不用 fake timers。scrollTo mock 同步修改 scrollTop。

## 需要 Codex 做什么

1. 按方案实现 `src/pages/Lyrics.tsx` 改动
2. 补充 `tests/setup.ts` mock
3. 在 `tests/LyricsPanel.test.tsx` 新增 4 个回归测试
4. 运行 `npx tsc --noEmit` 类型检查
5. 运行 `npm test` 全量测试（含 harness 约束检查）
6. 全部通过后返回结果

## 已验证

- 方案经三审通过
- 根因分析、onLineClick 修正、手动验收项已合格
- 测试方案经三审修订通过

## 需要特别注意

- **不要改 LyricsPanel.tsx 内部逻辑**，只在 Lyrics.tsx 侧加 key
- **不要用 fake timers**，用 `waitFor()` 等待异步状态
- **scrollTo mock 必须同步修改 scrollTop**，不能只是 vi.fn()
- **Track fixture 必须包含 createdAt 字段**（类型定义中有）
- **act() 包裹所有状态更新**（usePlayerStore.setState）
- **A→B→A 测试中 A2 必须先完成**，过期的 B 和 A1 后完成，验证 request token 生效
- **scrollTop 测试必须先设 oldPanel.scrollTop = 240**，不能跳过断言

## 返回格式

- 结论：已完成 / 需要返工
- 变更：改了哪些文件、改了什么行为
- 验证：运行了哪些命令、哪些通过
- 风险：仍需注意的问题
- 需要主人确认：UI/体验/产品取舍
