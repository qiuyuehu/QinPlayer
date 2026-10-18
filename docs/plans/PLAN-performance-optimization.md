# 性能优化实施方案

## 前置条件
- 身份：衾衾负责方案和审查
- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`（WSL: `/mnt/c/Users/秋月/Desktop/QinPlayer`）
- 测试运行：`npm test`（Vitest + Harness 约束检查）
- 开工前必读：`SPEC.md` → `harness/SPEC.md` → `CONSTRAINTS.md` → `DECISIONS.md` → 最近 devlog
- 禁止事项：不改 package.json、不引入新依赖、不改 CONSTRAINTS.md、不改音频逻辑

## 目标

全面性能优化，验收标准：代码层面无不必要的 re-render、无内存泄漏、无冗余计算。

## 审计结果

| # | 问题 | 收益 | 难度 | 状态 |
|---|------|------|------|------|
| 1 | RAF 暂停时不停 | 高 | 低 | 本次实施 |
| 2 | 零 React.memo | 高 | 中 | 本次实施 |
| 3 | songs:getAll 重复调用 | 中 | 低 | 本次实施 |
| 4 | MiniPlayer 订阅 playlist | 中 | 低 | 本次实施 |
| 5 | 零代码分割 | 中 | 中 | 本次实施 |
| 6 | playerStore subscribe 过频 | 中 | 低 | 本次实施 |
| 7 | setInterval 保存 currentTime | 低 | 低 | 本次实施 |
| 8 | useAudioSync 7 个 useEffect | 低 | 高 | 后续 |
| 9 | songs 表索引 | 低 | 低 | 后续 |
| 10 | 组件拆分 | 低 | 高 | 后续 |

---

## Task 1: RAF 暂停时停止

**目的：** 播放器暂停且未拖拽进度条时，RAF 循环停止运行，减少无意义的 60fps DOM 更新。

**文件：**
- 修改：`src/components/PlayerBar.tsx`
- 修改：`src/components/MiniPlayer.tsx`
- 修改：`src/pages/Lyrics.tsx`

**当前问题：**

PlayerBar：RAF 依赖 `[duration]`，暂停时也跑。已有 `isDraggingRef`。
MiniPlayer：RAF 依赖 `[duration, featureFlags.playback, featureFlags.miniMode, isMiniMode]`，暂停时也跑。已有 `isDraggingRef`。
Lyrics.tsx：RAF 依赖 `[duration]`，暂停时也跑。无拖拽逻辑。

**修复：** 在 RAF update 函数内部用 ref 检查状态，暂停且未拖拽时不继续循环。不能把 isPlaying 加到 useEffect 依赖里（否则暂停→播放时 RAF 不会重启）。

**⚠️ 关键：暂停时用户可能拖拽进度条。** PlayerBar 和 MiniPlayer 有进度条拖拽，需要 RAF 更新预览位置。Lyrics.tsx 没有拖拽逻辑。

```typescript
// === PlayerBar.tsx / MiniPlayer.tsx（有拖拽） ===
const isPlayingRef = useRef(isPlaying)
useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

const update = () => {
  // ... 更新进度条 DOM
  // 播放中 或 拖拽进度条时 继续循环
  if (isPlayingRef.current || isDraggingRef.current) {
    rafId = requestAnimationFrame(update)
  }
}

// === Lyrics.tsx（无拖拽） ===
const isPlayingRef = useRef(isPlaying)
useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

const update = () => {
  // ... 更新歌词索引
  // 只检查播放状态，无拖拽逻辑
  if (isPlayingRef.current) {
    rafId = requestAnimationFrame(update)
  }
}
```

**注意：** Lyrics.tsx 不需要 `isDraggingRef`，不要照抄 PlayerBar 版本。

**单元测试：**

```typescript
it('暂停时 RAF 应该停止循环', () => {
  // 设置 isPlaying = true，render，确认 RAF 被调用
  // 设置 isPlaying = false，等待一帧，确认 RAF 不再被调用
})

it('恢复播放时 RAF 应该重新启动', () => {
  // 暂停 → 播放 → 确认 RAF 重新启动
})
```

**完成标准：**
- [ ] 暂停时 RAF 停止
- [ ] 恢复播放时 RAF 重新启动
- [ ] 进度条拖拽不受影响
- [ ] `npm test` 通过

---

## Task 2: 列表项 React.memo

**目的：** 减少列表滚动和状态切换时的无意义 re-render。

**文件：**
- 修改：`src/components/SongList.tsx`
- 修改：`src/pages/Albums.tsx`
- 修改：`src/components/PlaylistPanel.tsx`
- 修改：`src/components/MiniQueueView.tsx`

**当前问题：** 整个项目没有 React.memo。父组件 re-render 时，所有子行都重新渲染。

**修复：** 给列表行组件加 React.memo。SongList 用的是 @tanstack/react-virtual，行渲染在虚拟列表的 `.map()` 内联 JSX 中（第289-340行），需要提取为独立组件。

**SongList 提取步骤：**

1. 定义 SongRowProps 类型（track、index、isActive、onPlay、onLike 等）
2. 创建 `SongRow = React.memo(function SongRow(props) { ... })` 组件
3. 把 virtualizer `.map()` 内的内联 JSX 改为 `<SongRow {...props} />`
4. 确保虚拟列表的 style（absolute positioning via `virtualRow.start`）正确传递

```typescript
// SongList.tsx — 提取虚拟行为独立组件
interface SongRowProps {
  track: Track
  index: number
  isActive: boolean
  onPlay: (track: Track) => void
  onLike: (e: React.MouseEvent, track: Track) => void
  style: React.CSSProperties  // 虚拟列表定位样式
}

const SongRow = React.memo(function SongRow({ track, index, isActive, onPlay, onLike, style }: SongRowProps) {
  return (
    <div className={`song-list__row ${isActive ? 'song-list__row--active' : ''}`} style={style}>
      {/* 行内容：序号、封面、标题、歌手、时长、操作按钮 */}
    </div>
  )
})

// 在 virtualizer.getVirtualItems().map() 中使用
{virtualizer.getVirtualItems().map((virtualRow) => {
  const track = songs[virtualRow.index]
  return (
    <SongRow
      key={track.id}
      track={track}
      index={virtualRow.index}
      isActive={currentTrack?.id === track.id}
      onPlay={handlePlay}
      onLike={toggleLike}
      style={{
        position: 'absolute',
        top: virtualRow.start,
        height: virtualRow.size,
        width: '100%',
      }}
    />
  )
})}
```

**Albums/PlaylistPanel/MiniQueueView 同理**，但它们不是虚拟列表，提取更简单（直接把 `.map()` 内的 JSX 提取为 memo 组件）。

**注意：** React.memo 只在 props 不变时跳过 re-render。如果父组件每次传入新的回调函数，memo 无效。确保回调用 `useCallback` 包裹。

**已验证：** SongList 的 `handlePlay`、`handleAddToQueue`、`toggleLike`、`handleContextMenu`、`getMenuItems` 全部用 `useCallback` 包裹（SongList.tsx:123-178）。React.memo 有效。

**单元测试：**

```typescript
it('SongRow 在 props 不变时不应该 re-render', () => {
  // render SongList，触发一次 re-render（如切换音量）
  // 断言 SongRow 没有重新渲染（用 spy 或 mock 计数）
})
```

**完成标准：**
- [ ] SongList 行加 React.memo
- [ ] Albums 卡片加 React.memo
- [ ] PlaylistPanel 行加 React.memo
- [ ] MiniQueueView 行加 React.memo
- [ ] `npm test` 通过

---

## Task 3: songs:getAll 缓存

**目的：** 避免多个页面重复请求全量歌曲列表。

**文件：**
- 新建：`src/utils/songsCache.ts`
- 修改：`src/pages/LocalMusic.tsx`
- 修改：`src/pages/Albums.tsx`
- 修改：`src/stores/playerStore.ts`（restorePlayerState）

**当前问题：**

```
LocalMusic.tsx:33  → mount 时调 songs:getAll
LocalMusic.tsx:79  → 文件夹变化时调 songs:getAll
Albums.tsx:37      → mount 时调 songs:getAll
playerStore.ts:263 → 启动恢复时调 songs:getAll
```

**修复：** 创建内存缓存模块，5 秒内复用：

```typescript
// src/utils/songsCache.ts
let cachedSongs: Track[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 15000 // 15秒内复用

export async function getCachedSongs(): Promise<Track[]> {
  const now = Date.now()
  if (cachedSongs && now - cacheTimestamp < CACHE_TTL) return cachedSongs
  cachedSongs = await window.electronAPI.invoke('songs:getAll') as Track[]
  cacheTimestamp = now
  return cachedSongs
}

export function invalidateSongsCache(): void {
  cachedSongs = null
}
```

**单元测试：**

```typescript
it('5 秒内重复调用应该返回缓存', async () => {
  // 调用两次 getCachedSongs，断言 invoke 只被调用一次
})

it('invalidateSongsCache 后应该重新请求', async () => {
  // 调用 → invalidate → 再调用，断言 invoke 被调用两次
})
```

**完成标准：**
- [ ] 3 个调用点改为 getCachedSongs()
- [ ] 文件夹变化时 invalidateSongsCache()
- [ ] `npm test` 通过

---

## Task 4: MiniPlayer playlist 订阅优化

**目的：** MiniPlayer 默认视图不用 playlist，但订阅了整个数组，每次 setPlaylist 都 re-render。

**文件：**
- 修改：`src/components/MiniPlayer.tsx`
- 修改：`src/components/MiniQueueView.tsx`

**当前问题：**

```typescript
// MiniPlayer.tsx 第33行
const playlist = usePlayerStore((s) => s.playlist)  // ← 整个数组引用
```

MiniPlayer 默认视图只显示当前歌曲信息，不用 playlist。只有队列视图（MiniQueueView）才用。

**修复：** 把 playlist 订阅从 MiniPlayer 移到 MiniQueueView 内部。MiniQueueView 去掉 `tracks` prop，改为内部读取 store。

**单元测试：**

```typescript
it('MiniPlayer 默认视图不应该因 playlist 变化 re-render', () => {
  // render MiniPlayer（默认视图），记录 render 次数
  // 改变 playlist，断言没有额外 re-render
})
```

**完成标准：**
- [ ] MiniPlayer 不再订阅 playlist
- [ ] MiniQueueView 内部读取 playlist
- [ ] 队列视图功能不变
- [ ] `npm test` 通过

---

## Task 5: 代码分割（React.lazy）

**目的：** 减少首屏加载的 JS 体积，低频页面按需加载。

**文件：**
- 修改：`src/components/Content.tsx`

**修复：**

```typescript
// Content.tsx — 高频页面保持直接 import，低频页面 lazy
import LocalMusic from '../pages/LocalMusic'
import Lyrics from '../pages/Lyrics'

const Albums = React.lazy(() => import('../pages/Albums'))
const Playlists = React.lazy(() => import('../pages/Playlists'))
const Settings = React.lazy(() => import('../pages/Settings'))
const Search = React.lazy(() => import('../pages/Search'))
const RecentlyPlayed = React.lazy(() => import('../pages/RecentlyPlayed'))
const Liked = React.lazy(() => import('../pages/Liked'))
```

Content 的 JSX 包一层 Suspense：
```tsx
<Suspense fallback={<div className="content__loading">加载中...</div>}>
  <div key={resolvedNav} className="content__fade-wrapper">
    {renderPage()}
  </div>
</Suspense>
```

**单元测试：**

```typescript
it('首屏应该只加载 LocalMusic 和 Lyrics，不加载 Albums', () => {
  // 检查首屏渲染后 Albums 模块是否已加载
})
```

**完成标准：**
- [ ] 低频页面用 React.lazy
- [ ] Suspense fallback 有 loading 状态
- [ ] 首屏 JS 体积减少（对比 `out/renderer/assets/index-*.js` 大小）
- [ ] `npm test` 通过
- [ ] `npm run build` 通过

---

## Task 6: playerStore subscribe 优化

**目的：** 减少 debounced save 的触发频率，只在实际需要保存的字段变化时触发。

**文件：**
- 修改：`src/stores/playerStore.ts`

**当前问题：**

```typescript
// playerStore.ts 第208-210行
usePlayerStore.subscribe((state) => {
  debouncedSave(state)  // 每次任何字段变化都触发
})
```

`debouncedSave` 保存 volume、playMode、lastTrackId。但 subscribe 在每次 ANY field 变化时都触发（包括 isPlaying、duration、seekTime 等不需要持久化的字段）。

**修复：** 在 subscribe 回调中过滤，只在持久化字段变化时才调用 debouncedSave。

```typescript
// 用 ref 追踪上次保存的值
let lastSavedVolume = -1
let lastSavedPlayMode = ''
let lastSavedTrackId = -1

usePlayerStore.subscribe((state) => {
  if (
    state.volume !== lastSavedVolume ||
    state.playMode !== lastSavedPlayMode ||
    state.currentTrack?.id !== lastSavedTrackId
  ) {
    lastSavedVolume = state.volume
    lastSavedPlayMode = state.playMode
    lastSavedTrackId = state.currentTrack?.id ?? -1
    debouncedSave(state)
  }
})
```

**单元测试：**

```typescript
it('isPlaying 变化不应该触发 debouncedSave', () => {
  // 记录 settings:set 调用次数
  // 切换 isPlaying，等待 500ms
  // 断言 settings:set 没有被调用
})

it('volume 变化应该触发 debouncedSave', () => {
  // 改变 volume，等待 500ms
  // 断言 settings:set 被调用
})
```

**完成标准：**
- [ ] isPlaying/duration/seekTime 变化不触发 save
- [ ] volume/playMode/currentTrack 变化正常触发 save
- [ ] `npm test` 通过

---

## Task 7: currentTime 保存改为事件驱动（依赖 Task 6，先完成 Task 6 再做此任务）

**目的：** 播放中每 5 秒的 setInterval 改为暂停/切歌时保存，减少 SQLite 写入。

**文件：**
- 修改：`src/stores/playerStore.ts`

**当前问题：**

```typescript
// playerStore.ts 第215-227行
let progressSaveTimer: ReturnType<typeof setInterval> | null = null
usePlayerStore.subscribe((state) => {
  if (state.isPlaying && !progressSaveTimer) {
    progressSaveTimer = setInterval(() => {
      window.electronAPI.invoke('settings:set', { key: 'lastCurrentTime', value: String(ct) })
    }, 5000)
  } else if (!state.isPlaying && progressSaveTimer) {
    clearInterval(progressSaveTimer)
    progressSaveTimer = null
  }
})
```

**修复：** 删除 setInterval，改为在暂停和切歌时保存 currentTime。

```typescript
// 删除 setInterval 逻辑
// 在 setPlaying(false) 时保存
// 在 setCurrentTrack 时保存（切歌前保存上一首的进度）

// 方案：在 subscribe 中检测 isPlaying 从 true→false 时保存
let prevIsPlaying = false
usePlayerStore.subscribe((state) => {
  if (prevIsPlaying && !state.isPlaying) {
    // 暂停时保存当前进度
    const ct = currentTimeRef.current
    if (ct > 0) {
      window.electronAPI.invoke('settings:set', { key: 'lastCurrentTime', value: String(ct) }).catch(() => {})
    }
  }
  prevIsPlaying = state.isPlaying
})
```

切歌时的保存由 `setCurrentTrack` 中的 `resetTrackProgress()` 覆盖（切歌前不需要保存，因为切歌后 currentTimeRef 被重置为 0）。

**时序说明：** `playTrack` 内部先调 `setCurrentTrack`（清零 currentTimeRef），再设 `isPlaying = true`。暂停是单独调 `setPlaying(false)`，此时 currentTimeRef 还保留着播放位置，保存正确。不存在"保存已清零的值"的问题。

**单元测试：**

```typescript
it('暂停时应该保存 currentTime', () => {
  // 播放中设置 currentTimeRef = 30
  // 暂停，断言 settings:set 被调用，key 为 lastCurrentTime
})

it('播放中不应该每 5 秒保存 currentTime', () => {
  // 播放状态等待 6 秒
  // 断言 settings:set(lastCurrentTime) 没有被调用
})
```

**完成标准：**
- [ ] 删除 setInterval 逻辑
- [ ] 暂停时保存 currentTime
- [ ] 播放中不频繁写 SQLite
- [ ] `npm test` 通过

---

## 验收标准

1. `npm run verify` 全绿（harness + build + 271+ tests）
2. 暂停时 RAF 停止运行
3. 列表项有 React.memo 包裹
4. songs:getAll 不重复调用
5. MiniPlayer 默认视图不因 playlist 变化 re-render
6. 低频页面按需加载
7. isPlaying/duration 变化不触发 debounced save
8. 暂停时保存 currentTime，播放中不频繁写入

## 手动测试

1. 播放歌曲 → 暂停 → 确认 CPU 降下来
2. 快速滚动歌曲列表 → 确认不卡顿
3. 切换页面 → 确认低频页面有短暂 loading
4. 迷你模式队列视图 → 功能正常
5. 专辑页面 → 功能正常
6. 播放/暂停多次 → 确认设置保存正常

## 约束清单

- 不新增 npm 依赖
- 不改 package.json
- 不改音频逻辑（AudioEngine、淡入淡出）
- 不改数据库 schema
- 不改 feature flags
- 注释用中文
- 动画相关改动（reduced motion）不在本方案范围
