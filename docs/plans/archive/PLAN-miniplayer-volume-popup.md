# 迷你播放器 — 音量弹窗替换静音开关

## 前置条件
- 身份：work profile 衾衾，负责写方案
- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`（WSL: `/mnt/c/Users/秋月\Desktop\QinPlayer`）
- 测试运行：`npm test`（Vitest + Harness 约束检查）

## 问题

Codex 把迷你播放器的音量按钮实现为**静音开关**（点击静音/取消静音），但主人需要的是**弹出音量条**（和主页面 PlayerBar 一样，点击弹出滑块拖动调节）。

### 当前实现（MiniPlayer.tsx）

```
状态：isMuted (boolean) + prevVolumeRef
交互：点击 → 静音/取消静音 切换
图标：IconVolumeHigh / IconVolumeMuted（2态）
```

### 主页面实现（PlayerBar.tsx）—— 复用这个

```
状态：showVolume (boolean) + volumeHover (boolean) + volumeBarRef + volumeRowRef
交互：点击按钮 → 弹出音量条 → 拖动调节 → 点击外部关闭
图标：IconVolumeMuted (0) / IconVolumeLow (<0.5) / IconVolumeHigh（3态）
弹窗：垂直滑块 + fill + thumb + 数值气泡
```

## 约束
- 迷你模式 400×150，弹窗不能超出窗口
- 弹窗用 `position: fixed` + JS 动态定位，避免被 `overflow: hidden` 裁剪
- 复用 PlayerBar 的交互逻辑和 CSS 变量
- 不改 PlayerBar.tsx
- 不新增依赖
- 注释用中文

## 方案

### Task 1: 替换音量交互逻辑

**文件：** `src/components/MiniPlayer.tsx`

**改动 1 — Icons import 新增 IconVolumeLow：**

```typescript
// 修改前：
import {
  IconPlay, IconPause, IconPrev, IconNext,
  IconVolumeHigh, IconVolumeMuted,
  IconClose, IconExpand, IconMusic, IconLyrics, IconList,
  IconRepeat, IconRepeatOne, IconShuffle,
} from './Icons'

// 修改后：
import {
  IconPlay, IconPause, IconPrev, IconNext,
  IconVolumeHigh, IconVolumeLow, IconVolumeMuted,
  IconClose, IconExpand, IconMusic, IconLyrics, IconList,
  IconRepeat, IconRepeatOne, IconShuffle,
} from './Icons'
```

**改动 2 — 删除旧状态，新增新状态：**

```typescript
// 删除（约第 74-76 行）：
const [isMuted, setIsMuted] = useState(false)
const prevVolumeRef = useRef(1)

// 新增：
const [showVolume, setShowVolume] = useState(false)
const [volumeHover, setVolumeHover] = useState(false)
const volumeBarRef = useRef<HTMLDivElement>(null)
const volumeRowRef = useRef<HTMLDivElement>(null)
```

**改动 3 — 删除旧 handler，新增新 handler：**

```typescript
// 删除 handleVolumeClick（约第 142-151 行的 mute toggle）

// 新增：音量按钮点击（切换弹窗显隐）
const handleVolumeBtnClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
  e.stopPropagation()
  setShowVolume((visible) => !visible)
}, [])

// 新增：音量拖拽更新（从 PlayerBar 复用）
const updateVolume = useCallback((e: MouseEvent) => {
  if (!volumeBarRef.current) return
  const rect = volumeBarRef.current.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
  setVolume(ratio)
}, [setVolume])

// 新增：音量条 mousedown 注册拖拽（从 PlayerBar 复用）
const handleVolumeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
  updateVolume(e as unknown as MouseEvent)

  const handleMouseMove = (ev: MouseEvent) => {
    updateVolume(ev)
  }

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}, [updateVolume])
```

**改动 4 — 新增 outside-click 关闭弹窗（在现有 useEffect 区域）：**

```typescript
// 点击外部关闭音量弹窗
useEffect(() => {
  if (!showVolume) return

  const handleClickOutside = (e: MouseEvent) => {
    if (volumeRowRef.current && !volumeRowRef.current.contains(e.target as Node)) {
      setShowVolume(false)
      setVolumeHover(false)
    }
  }

  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [showVolume])
```

**改动 5 — 更新图标逻辑（3态替换2态）：**

在 `if (!featureFlags.playback...)` 守卫之后、`const coverUrl` 之前，新增：

```typescript
const VolumeIcon = volume === 0 ? IconVolumeMuted : volume < 0.5 ? IconVolumeLow : IconVolumeHigh
```

同时删除 JSX 中旧的 `{isMuted ? IconVolumeMuted : IconVolumeHigh}` 内联判断。

**改动 6 — 替换音量按钮 JSX：**

删除旧的音量按钮（约第 291-302 行），替换为：

```tsx
<div className="mini-player__volume-wrapper" ref={volumeRowRef}>
  <button
    type="button"
    className="mini-player__btn mini-player__volume-btn"
    onClick={handleVolumeBtnClick}
    title="音量"
    aria-label="音量控制"
    aria-expanded={showVolume}
  >
    <VolumeIcon width={14} height={14} />
  </button>
  {showVolume && (() => {
    const btn = volumeRowRef.current
    if (!btn) return null
    const rect = btn.getBoundingClientRect()
    return (
      <div
        className="mini-player__volume-popup"
        style={{
          position: 'fixed',
          left: rect.left + rect.width / 2,
          bottom: window.innerHeight - rect.top + 8,
          transform: 'translateX(-50%)',
        }}
      >
        <div
          className="mini-player__volume-bar"
          ref={volumeBarRef}
          onMouseDown={handleVolumeMouseDown}
          onMouseEnter={() => setVolumeHover(true)}
          onMouseLeave={() => setVolumeHover(false)}
        >
          <div
            className="mini-player__volume-fill"
            style={{ height: `${volume * 100}%` }}
          />
          <div
            className="mini-player__volume-thumb"
            style={{ bottom: `${volume * 100}%` }}
          />
          {volumeHover && (
            <div
              className="mini-player__volume-tooltip"
              style={{ bottom: `${volume * 100}%` }}
            >
              {Math.round(volume * 100)}
            </div>
          )}
        </div>
      </div>
    )
  })()}
</div>
```

**完成标准：**
- [ ] `npx tsc --noEmit` 无报错
- [ ] 点击音量按钮弹出音量条
- [ ] 拖动音量条调节音量（实时更新）
- [ ] 音量图标 3 态正确（静音/低/高）
- [ ] hover 显示数值气泡
- [ ] 点击外部关闭弹窗
- [ ] PlayerBar 不受影响

---

### Task 2: 音量弹窗 CSS

**文件：** `src/styles/miniplayer.css`

**新增样式（只保留外观，定位全部交给 JS inline style）：**

```css
/* 音量弹窗（迷你模式适配） */
.mini-player__volume-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.mini-player__volume-btn {
  color: var(--text-secondary);
}

.mini-player__volume-popup {
  z-index: 100;
  width: 32px;
  height: 110px;
  padding: 12px 0;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  /* 定位由 JS inline style 控制（position: fixed + 动态 left/bottom） */
}

.mini-player__volume-bar {
  width: 8px;
  height: 100%;
  background-color: transparent;
  border-radius: 2px;
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.mini-player__volume-bar::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 4px;
  background-color: var(--progress-track);
  border-radius: 2px;
  transform: translateX(-50%);
}

.mini-player__volume-fill {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 4px;
  background-color: var(--progress-fill);
  border-radius: 2px;
  pointer-events: none;
  z-index: 1;
  transform: translateX(-50%);
}

.mini-player__volume-thumb {
  position: absolute;
  left: 50%;
  width: 10px;
  height: 10px;
  background-color: var(--progress-fill);
  border-radius: 50%;
  transform: translate(-50%, 50%);
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

.mini-player__volume-bar:hover .mini-player__volume-thumb {
  opacity: 1;
}

.mini-player__volume-tooltip {
  position: absolute;
  right: calc(100% + 8px);
  transform: translateY(50%);
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
```

**完成标准：**
- [ ] 弹窗不被 `overflow: hidden` 裁剪
- [ ] 弹窗在按钮正上方显示
- [ ] 滑块样式与 PlayerBar 一致（缩小尺寸）
- [ ] 暗色/亮色主题都正常

---

### Task 3: 单元测试

**文件：** `tests/MiniPlayer.test.tsx`

**改动 1 — 更新 expectCommonControls：**

```typescript
// 修改前：
function expectCommonControls(): void {
  expect(screen.getByTitle('静音')).toBeInTheDocument()
  // ...

// 修改后：
function expectCommonControls(): void {
  expect(screen.getByTitle('音量')).toBeInTheDocument()
  // ...
```

**改动 2 — 新增测试用例：**

```typescript
it('点击音量按钮应该弹出音量条', () => {
  render(<MiniPlayer />)

  fireEvent.click(screen.getByTitle('音量'))
  expect(screen.getByLabelText('音量控制')).toHaveAttribute('aria-expanded', 'true')
})

it('音量图标应该根据音量值显示不同状态', () => {
  // volume = 0 → 静音图标（IconVolumeMuted 的 SVG path）
  act(() => usePlayerStore.setState({ volume: 0 }))
  const { container, rerender } = render(<MiniPlayer />)
  const btn = screen.getByLabelText('音量控制')
  const mutedPath = container.querySelector('svg')?.innerHTML
  expect(mutedPath).toBeTruthy()

  // volume = 0.3 → 低音量图标（IconVolumeLow，path 不同）
  act(() => usePlayerStore.setState({ volume: 0.3 }))
  rerender(<MiniPlayer />)
  const lowPath = btn.querySelector('svg')?.innerHTML
  expect(lowPath).not.toBe(mutedPath)

  // volume = 0.8 → 高音量图标（IconVolumeHigh，path 又不同）
  act(() => usePlayerStore.setState({ volume: 0.8 }))
  rerender(<MiniPlayer />)
  const highPath = btn.querySelector('svg')?.innerHTML
  expect(highPath).not.toBe(lowPath)
})
```

**完成标准：**
- [ ] 新增测试通过
- [ ] 现有测试（含 expectCommonControls）不被破坏
- [ ] `npm test` 全绿

---

## 验收标准

1. `npx tsc --noEmit` 无报错
2. `npm test` 全部通过
3. 点击音量按钮弹出垂直音量条
4. 拖动音量条实时调节音量
5. 音量图标 3 态正确（0=静音，<0.5=低，>=0.5=高）
6. hover 显示数值气泡
7. 点击外部关闭弹窗
8. PlayerBar 不受影响

## 手动测试（主人执行）

1. 迷你播放器 → 点击音量按钮 → 弹出音量条
2. 拖动音量条 → 音量实时变化 → 图标跟随变化
3. 音量为 0 时图标显示静音
4. hover 音量条 → 显示数值气泡
5. 点击弹窗外部 → 弹窗关闭
6. 主页面 PlayerBar 音量功能不受影响
