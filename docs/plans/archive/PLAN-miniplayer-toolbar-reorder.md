# 迷你播放器工具栏按钮重排

## 约束
- 只改 `src/components/MiniPlayer.tsx`（JSX 顺序）+ `src/styles/miniplayer.css`（工具栏分组布局）
- 不改按钮功能、不改图标、不新增按钮、不删除按钮
- 不改工具栏高度（34px）、不改 border-top
- 不改 `mini-player__btn` 的宽高和样式
- 不新增 npm 依赖
- 不要自动 git commit

## 需求

工具栏按钮从"全部居中"改为三栏分组布局：

```
当前：音量 → 上一首 → 播放/暂停 → 下一首 → [歌曲|歌词|队列] → 置顶 → 展开 → 播放方式
目标：[音量 置顶 展开] · [上一首 播放/暂停 下一首] · [歌曲 歌词 队列 播放方式]
```

左3：窗口控制（音量、置顶、展开）
中3：播放控制（上一首、播放/暂停、下一首）
右4：内容切换 + 播放行为（视图切换器、播放方式）

## 改动

### MiniPlayer.tsx — JSX 重排

工具栏区域（第327-427行）的按钮顺序改为三组，每组用 `<div className="mini-player__toolbar-group">` 包裹：

```tsx
<div className="mini-player__toolbar mini-player__controls">
  {/* 左侧：窗口控制 */}
  <div className="mini-player__toolbar-group">
    {/* 音量按钮（现有） */}
    {/* 置顶按钮（现有） */}
    {/* 展开按钮（现有） */}
  </div>

  {/* 中间：播放控制 */}
  <div className="mini-player__toolbar-group">
    {/* 上一首（现有） */}
    {/* 播放/暂停（现有） */}
    {/* 下一首（现有） */}
  </div>

  {/* 右侧：内容切换 + 播放行为 */}
  <div className="mini-player__toolbar-group">
    {/* 视图切换器（现有） */}
    {/* 播放方式按钮（现有） */}
  </div>
</div>
```

所有按钮的 props、事件处理、条件渲染不变，只改 DOM 顺序和包裹容器。

### miniplayer.css — 工具栏分组布局

```css
/* 修改现有 .mini-player__toolbar */
.mini-player__toolbar {
  /* 保留现有：min-width: 0; height: 34px; align-items: center; padding-top: 1px; border-top */
  display: flex;
  justify-content: center;
  gap: 16px;  /* 组间间距（原 gap: 4px 改为 16px） */
}

/* 新增：组内布局 */
.mini-player__toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;  /* 组内间距 */
}
```

## 单元测试

现有 `tests/MiniPlayer.test.tsx` 的 `expectCommonControls` 已经验证所有按钮存在（静音、上一首、暂停、下一首、展开、关闭）。重排后这些断言仍然有效，因为只改了 DOM 顺序，不改 title/aria-label。

新增验证：
```typescript
it('工具栏应该分为三组', () => {
  render(<MiniPlayer />)
  const groups = document.querySelectorAll('.mini-player__toolbar-group')
  expect(groups).toHaveLength(3)
})
```

## 验收标准

1. `npx tsc --noEmit` 无报错
2. `npm test` 通过（含现有 expectCommonControls + 新增分组测试）
3. 工具栏三栏分组：左窗口控制、中播放控制、右内容切换
4. 中间播放控制组在 400px 宽度内视觉居中
5. 组内按钮间距 4px，组间间距 16px
6. 按钮功能全部正常
7. 400×150 窗口下不溢出

## 手动测试

1. 进入迷你模式 → 工具栏三栏分组清晰
2. 中间播放控制组视觉居中
3. 点击各按钮 → 功能正常
4. 切换播放模式 → 图标正常
5. 置顶/取消置顶 → 正常
6. 视图切换 → 正常

## 约束清单

- 不新增 npm 依赖
- 不改按钮功能和图标
- 不改工具栏高度和边框
- 不新增/删除按钮
- 注释用中文
