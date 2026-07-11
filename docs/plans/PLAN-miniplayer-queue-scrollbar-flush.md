# 迷你队列视图滚动条贴边（v3）

> 创建：2026-07-11
> 修订：v3 — 清理草稿，补全验证

---

## 约束

- 只改 `src/styles/miniplayer.css`
- 不新增依赖、不新增 IPC、不改数据库查询
- 不顺手重构其他样式
- 不要自动 git commit

---

## 需求

1. 队列视图的滚动条紧贴窗口右边缘
2. 关闭按钮往右上角挪一点（v1 已完成，保留）

## 根因

`.mini-player` 是 `display: grid`（miniplayer.css 第9行），grid 子元素宽度由 grid 布局决定。v1 尝试用 `margin-right: -8px` + `overflow: visible`，实测滚动条位置没有变化（主人确认"还是老样子"），推断是 grid 布局限制了负 margin 的扩展效果。

## 方案

用绝对定位让队列视图脱离 grid 布局，直接相对于 `.mini-player` 定位，不受 padding 约束。

---

## 前置验证

| 检查项 | 结果 |
|--------|------|
| `.mini-player` 有 `position: relative` | ✓ 第6行确认 |
| 关闭按钮 `z-index: 2`（第114行），队列视图未设 z-index（默认 auto=0） | ✓ 不会遮挡关闭按钮 |
| `.mini-player__content` 改回 `overflow: hidden` 对其他视图的影响 | ✓ 歌词视图（第197行）和默认视图（第42行）各自有 `overflow: hidden`/`animation`，不依赖父容器的 overflow |
| `bottom: 46px` 验证 | 见下方计算 |

### bottom: 46px 计算

队列视图用绝对定位后相对于 `.mini-player`（包含块）。需要留出底部空间：

```
padding-bottom:  8px   (.mini-player padding: 8px)
grid gap:        4px   (grid-template-rows gap)
工具栏高度:     34px   (.mini-player__toolbar height)
─────────────────────
合计:           46px
```

> ⚠️ `bottom` 值需手动测试确认，如果工具栏和队列视图之间有间距或重叠，调整此值。

---

## 改动

### 步骤1：撤回 `.mini-player__content` 的 overflow 改动

当前状态（v1 改成了 `overflow: visible`）改回 `overflow: hidden`：

```css
.mini-player__content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;    /* 改回 hidden，不影响其他视图（各自有独立 overflow） */
}
```

### 步骤2：`.mini-queue-view` 改用绝对定位

移除 `width/height/margin-top/margin-right`，改用绝对定位的 `top/right/bottom/left`：

```css
.mini-queue-view {
  position: absolute;
  top: 28px;           /* 关闭按钮区域（26px按钮 + 2px间距） */
  right: 0;            /* 贴右边缘，滚动条紧贴窗口 */
  bottom: 46px;        /* padding-bottom(8) + gap(4) + 工具栏(34) */
  left: 0;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  animation: miniViewIn var(--motion-duration-standard) var(--motion-ease-standard) both;
}
```

---

## 验收标准

1. `npx tsc --noEmit` 无报错
2. `npm test` 通过
3. 队列视图滚动条紧贴窗口右边缘
4. 关闭按钮在右上角，不被队列视图遮挡（z-index 2 > auto 0）
5. 默认视图和歌词视图不受影响
6. 关闭按钮功能正常

## 手动测试

1. `npm run dev` 启动
2. 进入迷你模式 → 默认视图正常
3. 切换到队列视图 → 滚动条贴着右边缘
4. 滚动到顶端 → 不和关闭按钮重叠
5. 关闭按钮 hover → 正常显示
6. 点击关闭 → 正常退出迷你模式
7. 切换到歌词视图 → 样式正常
