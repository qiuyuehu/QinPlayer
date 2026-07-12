# 迷你播放器 — 播放方式切换按钮

## 前置条件
- 身份：work profile 衾衾，负责写方案
- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`（WSL: `/mnt/c/Users/秋月/Desktop\QinPlayer`）
- 测试运行：`npm test`（Vitest + Harness 约束检查）
- 开工前必读：`SPEC.md` → `harness/SPEC.md` → `CONSTRAINTS.md` → `DECISIONS.md` → 最近 devlog

## 需求

在迷你播放器工具栏的展开按钮（IconExpand）右边，新增一个播放方式切换按钮：
- 顺序播放（sequential）→ 单曲循环（loop）→ 随机播放（shuffle）→ 顺序播放
- 点击切换，图标和 tooltip 跟随当前模式变化
- 复用主页面 PlayerBar 已有的播放方式逻辑

## 当前代码分析

### 已有资源（grep 已确认）

| 资源 | 位置 | 状态 |
|------|------|------|
| `playMode` 状态 | `playerStore.ts:24` | 已有 |
| `setPlayMode` action | `playerStore.ts:38,111` | 已有 |
| `togglePlayMode()` 函数 | `playerStore.ts:178-181` | 已有，顺序: sequential→loop→shuffle |
| `PlayMode` 类型 | `types/index.ts:64` | 已有 |
| `IconShuffle` | `Icons.tsx:85` | 已有 |
| `IconRepeat` | `Icons.tsx:96` | 已有（顺序播放图标） |
| `IconRepeatOne` | `Icons.tsx:107` | 已有（单曲循环图标） |
| `PLAY_MODE_ICON` 映射 | `PlayerBar.tsx:23-27` | 仅在 PlayerBar 内定义 |
| `PLAY_MODE_LABELS` 映射 | `PlayerBar.tsx:30-34` | 仅在 PlayerBar 内定义 |
| 播放模式切换 handler | `PlayerBar.tsx:106-109` | 仅在 PlayerBar 内 |

### MiniPlayer 工具栏结构（MiniPlayer.tsx:269-349）

```
toolbar (flex, center, gap:4)
  ├── 音量按钮
  ├── 上一首
  ├── 播放/暂停
  ├── 下一首
  ├── 视图切换器（歌曲/歌词/队列）
  ├── 展开按钮 ← 在这里右边加
  └── [新增] 播放方式按钮
```

### 设计决策

**不提取共享模块：** `PLAY_MODE_ICON` / `PLAY_MODE_LABELS` 只有两个消费者（PlayerBar + MiniPlayer），在 MiniPlayer 内联定义。避免 `utils/` 反向依赖 `components/Icons`（违反分层原则）。PlayerBar 不做任何改动。

### 约束
- 迷你模式固定 400×150，工具栏已有 7 个元素，新增第 8 个不能溢出
- 按钮必须设 `-webkit-app-region: no-drag`（已在 CSS 全局规则中覆盖 `.mini-player button`）
- 不新增依赖、不改 package.json
- 不改 CONSTRAINTS.md
- 不改 PlayerBar.tsx
- 注释用中文

## 方案

### Task 1: MiniPlayer 新增播放方式按钮

**目的：** 在展开按钮右边加一个播放方式切换按钮，内联定义常量，复用 store 的 `playMode` / `setPlayMode` / `togglePlayMode`。

**文件：**
- 修改：`src/components/MiniPlayer.tsx`

**改动 1 — 新增 import（文件顶部 Icons import 之后）：**

```typescript
import { togglePlayMode } from '../stores/playerStore'
```

**改动 2 — 在组件函数体内、现有 usePlayerStore 调用附近，新增 store 读取：**

```typescript
const playMode = usePlayerStore((s) => s.playMode)
const setPlayMode = usePlayerStore((s) => s.setPlayMode)
```

**改动 3 — 在组件函数体内、handleExpand 之后，新增常量和 handler：**

```typescript
// --- 播放方式（内联常量，与 PlayerBar 保持一致） ---
const PLAY_MODE_ICON = {
  sequential: IconRepeat,
  loop: IconRepeatOne,
  shuffle: IconShuffle,
} as const

const PLAY_MODE_LABELS = {
  sequential: '顺序播放',
  loop: '单曲循环',
  shuffle: '随机播放',
} as const

const handleToggleMode = useCallback(() => {
  setPlayMode(togglePlayMode(playMode))
}, [playMode, setPlayMode])
```

**改动 4 — Icons import 区新增需要的图标：**

```typescript
// 修改前：
import {
  IconPlay, IconPause, IconPrev, IconNext,
  IconVolumeHigh, IconVolumeMuted,
  IconClose, IconExpand, IconMusic, IconLyrics, IconList,
} from './Icons'

// 修改后：
import {
  IconPlay, IconPause, IconPrev, IconNext,
  IconVolumeHigh, IconVolumeMuted,
  IconClose, IconExpand, IconMusic, IconLyrics, IconList,
  IconRepeat, IconRepeatOne, IconShuffle,
} from './Icons'
```

**改动 5 — 在展开按钮 JSX 之后，渲染播放方式按钮：**

```tsx
<button
  type="button"
  className="mini-player__btn mini-player__btn--mode"
  onClick={handleToggleMode}
  aria-label={PLAY_MODE_LABELS[playMode]}
  title={PLAY_MODE_LABELS[playMode]}
>
  <ModeIcon width={14} height={14} />
</button>
```

其中 `ModeIcon` 在 return 语句前提取：

```typescript
const ModeIcon = PLAY_MODE_ICON[playMode]
```

**完成标准：**
- [ ] `npx tsc --noEmit` 无报错
- [ ] 工具栏显示播放方式按钮，图标正确
- [ ] 点击按钮切换模式：sequential→loop→shuffle→sequential
- [ ] tooltip 显示对应的中文标签
- [ ] 模式切换后 PlayerBar 同步更新（同一 store）
- [ ] 按钮不影响工具栏布局（不溢出、不错位）
- [ ] 不引入未使用的 import

---

### Task 2: 单元测试

**目的：** 覆盖迷你播放器中播放方式按钮的交互和持久化。

**文件：**
- 修改：`tests/MiniPlayer.test.tsx`

**新增测试用例（在现有 describe('MiniPlayer') 内）：**

```typescript
it('应该显示播放方式按钮且 tooltip 反映当前模式', () => {
  act(() => usePlayerStore.setState({ playMode: 'sequential' }))
  render(<MiniPlayer />)

  expect(screen.getByTitle('顺序播放')).toBeInTheDocument()
})

it('点击播放方式按钮应该循环切换模式并触发持久化', () => {
  act(() => usePlayerStore.setState({ playMode: 'sequential' }))
  render(<MiniPlayer />)

  // sequential → loop
  fireEvent.click(screen.getByTitle('顺序播放'))
  expect(usePlayerStore.getState().playMode).toBe('loop')

  // loop → shuffle
  fireEvent.click(screen.getByTitle('单曲循环'))
  expect(usePlayerStore.getState().playMode).toBe('shuffle')

  // shuffle → sequential
  fireEvent.click(screen.getByTitle('随机播放'))
  expect(usePlayerStore.getState().playMode).toBe('sequential')

  // 每次切换都触发 settings:set 保存 playMode（debounced 500ms）
  // 验证 invoke 被调用过至少一次 playMode 相关保存
  const playModeSaveCalls = invokeMock.mock.calls.filter(
    ([channel, args]) => channel === 'settings:set' && args?.key === 'playMode',
  )
  expect(playModeSaveCalls.length).toBeGreaterThan(0)
})
```

**说明：** 测试 2 同时覆盖循环切换和持久化（`settings:set` IPC 调用），比原来拆成两个测试更有价值。`togglePlayMode` 的纯函数测试已在 `tests/playerStore.test.ts` 中存在（3 个用例），不需要重复。

**完成标准：**
- [ ] 新增测试全部通过
- [ ] 现有 241 个测试不被破坏
- [ ] `npm test` 全绿

---

## 验收标准

1. `npx tsc --noEmit` 无报错
2. `npm test` 全部通过（现有 241 + 新增 2 = 243）
3. 迷你播放器工具栏展开按钮右边显示播放方式按钮
4. 点击按钮循环切换：顺序播放→单曲循环→随机播放→顺序播放
5. 图标和 tooltip 正确反映当前模式
6. 切换后主页面 PlayerBar 的播放方式同步变化
7. 400×150 窗口下工具栏不溢出
8. PlayerBar.tsx 无任何改动

## 手动测试（主人执行）

1. 打开迷你播放器 → 工具栏展开按钮右边看到播放方式按钮
2. 默认"顺序播放"，点击变为"单曲循环"（图标变为单曲循环图标）
3. 再点击变为"随机播放"（图标变为随机图标）
4. 再点击回到"顺序播放"
5. 切换到主页面 → PlayerBar 的播放方式按钮显示相同模式
6. 在 PlayerBar 切换模式 → 回到迷你播放器，按钮同步更新

## 约束清单

- 不新增 npm 依赖
- 不改 package.json
- 不改 tsconfig
- 不改 CONSTRAINTS.md
- 不改 PlayerBar.tsx
- 不删除现有测试
- 注释用中文
- 所有颜色通过 CSS 变量引用

## 单元测试说明

- Task 2 新增 2 个测试用例：按钮存在性 + 循环切换含持久化验证
- `togglePlayMode` 纯函数测试已在 `tests/playerStore.test.ts` 中覆盖（3 个用例），不重复
