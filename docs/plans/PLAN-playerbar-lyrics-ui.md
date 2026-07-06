# QinPlayer 播放器 UI 调整方案（v2）

> 创建：2026-07-05
> 修订：2026-07-05（Codex 审查后修正）
> 状态：待确认

---

## 需求

1. 主页面音量条隐藏到音量按钮里，点击后向上显示
2. 歌词页面播放按钮偏小，要改大
3. 歌词页面播放进度条移到三个按钮上面

---

## 改动方案

### 1. 主页面音量条折叠

**文件**：`src/components/PlayerBar.tsx` + `src/styles/playerbar.css`

**当前**：音量条始终显示在音量按钮右侧。

**改成**：
- 音量条默认隐藏
- 点击音量按钮后，音量条向上弹出（absolute 定位）
- 点击外部区域或再次点击音量按钮，音量条收起

**实现**：

**PlayerBar.tsx**：
```typescript
const [showVolume, setShowVolume] = useState(false)
const volumeRowRef = useRef<HTMLDivElement>(null)

// 点击外部收起
useEffect(() => {
  if (!showVolume) return
  const handleClickOutside = (e: MouseEvent) => {
    if (volumeRowRef.current && !volumeRowRef.current.contains(e.target as Node)) {
      setShowVolume(false)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [showVolume])

// 音量按钮点击（stopPropagation 防止触发 document click）
const handleVolumeBtnClick = (e: React.MouseEvent) => {
  e.stopPropagation()
  setShowVolume(prev => !prev)
}
```

**JSX 结构**：
```tsx
<div className="player-bar__volume-wrapper" ref={volumeRowRef}>
  <button
    className="player-bar__btn"
    onClick={handleVolumeBtnClick}
    title="音量"
    aria-expanded={showVolume}
    aria-label="音量控制"
  >
    <VolumeIcon width={18} height={18} />
  </button>
  {showVolume && (
    <div className="player-bar__volume-popup">
      {/* 复用现有 .player-bar__volume-bar、volumeBarRef、handleVolumeMouseDown、volumeHover tooltip 逻辑 */}
    </div>
  )}
</div>
```

**playerbar.css**：
```css
.player-bar__volume-wrapper {
  position: relative;  /* 锚点 */
}

.player-bar__volume-popup {
  position: absolute;
  bottom: 100%;  /* 向上弹出 */
  right: 0;
  z-index: 100;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  box-shadow: var(--shadow-md);
}
```

### 2. 歌词页面播放按钮改大

**文件**：`src/pages/Lyrics.tsx` + `src/styles/lyrics.css`

**当前**：播放按钮使用 `width={18} height={18}`，按钮容器被 `.lyrics-page__btn` 限制为 `width: min(3vw, 34px)`、`height: min(2.4vw, 32px)`。

**改成**：

**Lyrics.tsx**：
- 上一首/下一首：`width={24} height={24}`
- 播放/暂停：`width={32} height={32}`

**lyrics.css**：
```css
.lyrics-page__btn {
  width: 48px;   /* 从 min(3vw, 34px) 改成固定 48px */
  height: 48px;  /* 从 min(2.4vw, 32px) 改成固定 48px */
}

.lyrics-page__buttons {
  gap: 16px;  /* 按钮间距，从当前值调整 */
}
```

**注意**：不改顶部 actions 和置顶 cleanup，保留 IconPin、togglePinned、leaveLyrics、IconChevronDown。

### 3. 歌词页面进度条移到按钮上面

**文件**：`src/pages/Lyrics.tsx`

**当前**：进度条在按钮下面。

**改成**：进度条移到按钮上面。

**实现**：在 `.lyrics-page__controls` 内，把 `.lyrics-page__progress-row` 移到 `.lyrics-page__buttons` 前面。

**注意**：不改顶部 actions 和置顶 cleanup。

---

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/components/PlayerBar.tsx` | 音量条折叠逻辑（showVolume 状态、outside-click、stopPropagation） |
| `src/styles/playerbar.css` | 音量弹窗样式（absolute 定位、锚点、z-index） |
| `src/pages/Lyrics.tsx` | 播放按钮改大 + 进度条移到按钮上面 |
| `src/styles/lyrics.css` | 按钮容器尺寸调整 |

---

## 验证方法

1. `npx tsc --noEmit` — TypeScript 语法检查
2. `npm test` — 测试通过
3. 手动验证：
   - 主页面：点击音量按钮，音量条向上弹出；再次点击收起
   - 主页面：音量弹出后拖动能改音量
   - 主页面：点击弹窗内部不关闭
   - 主页面：点击其他播放器按钮会关闭
   - 主页面：迷你模式/播放队列按钮同时存在时右侧不挤压
   - 歌词页面：播放按钮变大
   - 歌词页面：进度条在按钮上面
   - 歌词页面：进度条移到按钮上方后，置顶、全屏、返回仍正常

---

*方案就绪，等主人确认后执行。*
