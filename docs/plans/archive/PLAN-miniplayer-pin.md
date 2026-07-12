# 迷你模式置顶功能

> 创建：2026-07-11

---

## 约束

- 只改 `src/components/MiniPlayer.tsx` + `src/styles/miniplayer.css`
- 复用已有 `window.electronAPI.setAlwaysOnTop(flag)` IPC（preload.ts:77），不新增后端逻辑
- 不改工具栏现有按钮顺序（音量/上一首/播放/下一首/视图切换/展开/播放方式）
- 置顶按钮放在展开按钮左边
- 不顺手重构其他样式
- 不要自动 git commit

---

## 需求

迷你模式加置顶功能，复用歌词界面的置顶逻辑（Lyrics.tsx:122-128）。点击按钮切换置顶状态，退出迷你模式时自动取消置顶。

## 实现参考

歌词界面的置顶逻辑：
```tsx
// Lyrics.tsx:122-128
const [isPinned, setIsPinned] = useState(false)
const togglePinned = useCallback(() => {
  setIsPinned(prev => {
    const next = !prev
    window.electronAPI.setAlwaysOnTop(next)
    return next
  })
}, [])
```

---

## 改动

### MiniPlayer.tsx

1. 新增 state（第75行附近，`isMuted` 旁边）：
```tsx
const [isPinned, setIsPinned] = useState(false)
```

2. 新增切换函数（第151行附近，`handleVolumeClick` 后面）：
```tsx
const togglePinned = useCallback(() => {
  setIsPinned(prev => {
    const next = !prev
    window.electronAPI.setAlwaysOnTop(next)
    return next
  })
}, [])
```

3. 退出迷你模式时取消置顶（第109-112行，`handleClose` 中）：
```tsx
const handleClose = useCallback(() => {
  if (isPinned) window.electronAPI.setAlwaysOnTop(false)
  setIsPinned(false)
  setMiniMode(false)
  setActiveNav('local')
}, [setMiniMode, setActiveNav, isPinned])
```

4. 展开时也取消置顶（第117-119行，`handleExpand` 中）：
```tsx
const handleExpand = useCallback(() => {
  if (isPinned) window.electronAPI.setAlwaysOnTop(false)
  setIsPinned(false)
  setMiniMode(false)
}, [setMiniMode, isPinned])
```

5. 工具栏加置顶按钮（第361行附近，展开按钮左边）：

先在 import 中添加 `IconPin`（第18-23行，`IconClose` 旁边）：
```tsx
import {
  IconPlay, IconPause, IconPrev, IconNext,
  IconVolumeHigh, IconVolumeMuted,
  IconClose, IconExpand, IconMusic, IconLyrics, IconList,
  IconRepeat, IconRepeatOne, IconShuffle,
  IconPin,    // ← 新增
} from './Icons'
```

然后在展开按钮（第361行）左边插入：
```tsx
<button
  type="button"
  className={`mini-player__btn ${isPinned ? 'mini-player__btn--pinned' : ''}`}
  onClick={togglePinned}
  aria-label={isPinned ? '取消置顶' : '置顶'}
  title={isPinned ? '取消置顶' : '置顶'}
>
  <IconPin width={14} height={14} />
</button>
```

### miniplayer.css

6. 置顶按钮激活态样式（`.mini-player__btn--mode` 附近）：
```css
.mini-player__btn--pinned {
  color: var(--accent);
}
```

---

## 单元测试

在 `tests/MiniPlayer.test.tsx` 中新增。

> ⚠️ `setAlwaysOnTop` 是通过 `window.electronAPI.send` 调用的（preload.ts:77），不是 `invoke`。测试中需要 mock `send`，并在 `afterEach` 中恢复，避免污染其他测试。

```tsx
// 在 describe('MiniPlayer') 内部，现有 afterEach 之前添加：
const originalSend = window.electronAPI.send

// 在现有 afterEach 中补充恢复：
afterEach(() => {
  window.electronAPI.invoke = originalInvoke
  window.electronAPI.send = originalSend  // ← 新增
  globalThis.requestAnimationFrame = originalRequestAnimationFrame
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame
})

it('置顶按钮应该切换窗口置顶状态', () => {
  const sendMock = vi.fn()
  window.electronAPI.send = sendMock

  render(<MiniPlayer />)

  // 初始不置顶
  expect(screen.getByTitle('置顶')).toBeInTheDocument()

  // 点击置顶
  fireEvent.click(screen.getByTitle('置顶'))
  expect(sendMock).toHaveBeenCalledWith('window:set-always-on-top', true)
  expect(screen.getByTitle('取消置顶')).toBeInTheDocument()

  // 再点取消置顶
  fireEvent.click(screen.getByTitle('取消置顶'))
  expect(sendMock).toHaveBeenCalledWith('window:set-always-on-top', false)
  expect(screen.getByTitle('置顶')).toBeInTheDocument()
})

it('关闭迷你模式时应该自动取消置顶', () => {
  const sendMock = vi.fn()
  window.electronAPI.send = sendMock

  render(<MiniPlayer />)

  // 先置顶
  fireEvent.click(screen.getByTitle('置顶'))
  expect(sendMock).toHaveBeenCalledWith('window:set-always-on-top', true)

  // 关闭迷你模式
  fireEvent.click(screen.getByTitle('关闭'))

  // 应该自动取消置顶
  expect(sendMock).toHaveBeenCalledWith('window:set-always-on-top', false)
  expect(useUIStore.getState().isMiniMode).toBe(false)
})

it('展开时应该自动取消置顶', () => {
  const sendMock = vi.fn()
  window.electronAPI.send = sendMock

  render(<MiniPlayer />)

  // 先置顶
  fireEvent.click(screen.getByTitle('置顶'))

  // 展开
  fireEvent.click(screen.getByTitle('展开'))

  // 应该自动取消置顶
  expect(sendMock).toHaveBeenCalledWith('window:set-always-on-top', false)
  expect(useUIStore.getState().isMiniMode).toBe(false)
})
```

---

## 验收标准

1. `npx tsc --noEmit` 无报错
2. `npm test` 通过（含新增 3 个测试）
3. 点击置顶按钮 → 窗口置顶，按钮高亮（accent色）
4. 再点一次 → 取消置顶，按钮恢复
5. 退出迷你模式（关闭/展开）→ 自动取消置顶
6. 其他功能（播放、切歌、视图切换）不受影响

## 手动测试

1. `npm run dev` 启动
2. 进入迷你模式 → 工具栏有置顶按钮（在展开按钮左边）
3. 点击置顶 → 窗口始终在最前面
4. 切换到其他应用 → 迷你播放器仍然可见
5. 再点取消置顶 → 恢复正常层级
6. 置顶状态下关闭迷你模式 → 自动取消置顶
7. 置顶状态下展开 → 自动取消置顶
