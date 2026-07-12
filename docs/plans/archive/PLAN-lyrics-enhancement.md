# QinPlayer 歌词界面增强方案（v2）

> 创建：2026-07-06
> 修订：2026-07-06（Codex 审查后修正）
> 状态：待确认

---

## 需求

1. 歌词界面进度条加粗（像主页面底部播放器一样）
2. 歌词界面添加音量按钮（折叠弹窗，点击后向上弹出）

---

## 当前状态

- 歌词界面进度条高度：`0.4vh`（很细）
- 主页面进度条高度：`8px` 点击热区，实际轨道/填充 `4px`
- 歌词界面播放控制：只有上一首/播放暂停/下一首
- 歌词界面没有音量功能
- 歌词界面已有置顶/返回逻辑（IconPin、togglePinned、leaveLyrics、IconChevronDown）

---

## 改动方案

### 1. 歌词界面进度条加粗

**文件**：`src/styles/lyrics.css`

**当前**：`.lyrics-page__progress-bar` 高度 `0.4vh`。

**改成**：复用主页面结构——bar 负责命中区域（8px），::before 画轨道（4px），fill 画填充（4px）。

```css
.lyrics-page__progress-bar {
  flex: 1;
  height: 8px;  /* 点击热区 */
  background: transparent;
  border-radius: 4px;
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.lyrics-page__progress-bar::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;  /* 实际轨道 */
  background: var(--bg-tertiary);
  border-radius: 2px;
}

.lyrics-page__progress-fill {
  height: 4px;  /* 实际填充 */
  background: var(--accent);
  border-radius: 2px;
  position: relative;
  z-index: 1;
}
```

### 2. 歌词界面添加音量按钮

**文件**：`src/pages/Lyrics.tsx` + `src/styles/lyrics.css`

#### 2.1 新增 import 和 store 读取

**Lyrics.tsx**：
```typescript
// 新增 import
// 在现有 import 上追加 IconVolumeHigh/IconVolumeLow/IconVolumeMuted

// 新增 store 读取
const volume = usePlayerStore((s) => s.volume)
const setVolume = usePlayerStore((s) => s.setVolume)
```

#### 2.2 音量图标选择

```typescript
const VolumeIcon = volume === 0 ? IconVolumeMuted : volume < 0.5 ? IconVolumeLow : IconVolumeHigh
```

#### 2.3 音量状态和 ref

```typescript
const [showVolume, setShowVolume] = useState(false)
const volumeRowRef = useRef<HTMLDivElement>(null)
const volumeBarRef = useRef<HTMLDivElement>(null)
```

#### 2.4 点击外部收起

```typescript
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
```

#### 2.5 音量按钮点击

```typescript
const handleVolumeBtnClick = (e: React.MouseEvent) => {
  e.stopPropagation()
  setShowVolume(prev => !prev)
}
```

#### 2.6 音量拖动

```typescript
const updateVolume = useCallback((e: MouseEvent) => {
  if (!volumeBarRef.current) return
  const rect = volumeBarRef.current.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  setVolume(pct)
}, [setVolume])

const handleVolumeMouseDown = useCallback((e: React.MouseEvent) => {
  e.preventDefault()
  updateVolume(e.nativeEvent)
  const handleMouseMove = (ev: MouseEvent) => updateVolume(ev)
  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}, [updateVolume])
```

#### 2.7 JSX 结构

```tsx
<div className="lyrics-page__volume-wrapper" ref={volumeRowRef}>
  <button className="lyrics-page__btn" onClick={handleVolumeBtnClick} title="音量">
    <VolumeIcon width={24} height={24} />
  </button>
  {showVolume && (
    <div className="lyrics-page__volume-popup">
      <div
        className="lyrics-page__volume-bar"
        ref={volumeBarRef}
        onMouseDown={handleVolumeMouseDown}
      >
        <div
          className="lyrics-page__volume-fill"
          style={{ width: `${volume * 100}%` }}
        />
        <div
          className="lyrics-page__volume-thumb"
          style={{ left: `${volume * 100}%` }}
        />
      </div>
    </div>
  )}
</div>
```

#### 2.8 lyrics.css 音量样式

```css
.lyrics-page__volume-wrapper {
  position: relative;
}

.lyrics-page__volume-popup {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  box-shadow: var(--shadow-md);
}

.lyrics-page__volume-bar {
  width: 120px;
  height: 4px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  cursor: pointer;
  position: relative;
}

.lyrics-page__volume-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
}

.lyrics-page__volume-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  background: var(--accent);
  border-radius: 50%;
}
```

### 3. 按钮布局调整

**文件**：`src/pages/Lyrics.tsx`

**当前布局**：
```
[上一首] [播放/暂停] [下一首]
```

**改成**：
```
[上一首] [播放/暂停] [下一首] [音量]
```

**注意**：只改 `.lyrics-page__buttons`，不改顶部 actions（置顶/全屏/返回）。

---

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/styles/lyrics.css` | 进度条加粗（复用主页面结构）+ 音量弹窗/音量条样式 |
| `src/pages/Lyrics.tsx` | 添加音量按钮（import、store 读取、状态、拖动逻辑、JSX） |

**不改动**：
- 歌词页面的置顶/返回逻辑（保留 IconPin、togglePinned、leaveLyrics、IconChevronDown）

---

## 验证方法

1. `npx tsc --noEmit` — TypeScript 语法检查
2. `npm test` — 测试通过
3. 手动验证：
   - 歌词界面进度条变粗
   - 音量按钮点击后向上弹出音量条
   - 音量弹窗可以拖动调节音量
   - 拖动音量后实际声音变化
   - 音量为 0 时图标变静音
   - 点击弹窗内部不关闭
   - 点击外部区域音量弹窗收起
   - 置顶、全屏、返回仍正常

---

*方案就绪，等主人确认后执行。*
