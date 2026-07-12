# QinPlayer 歌曲列表布局调整方案

> 创建：2026-07-04
> 基于：web-design-engineer skill 设计流程
> 状态：待确认

---

## 设计分析

### 当前视觉词汇

| 元素 | 当前实现 | 问题 |
|------|----------|------|
| 内容区 | `padding: 20px 24px` | 两侧内缩，列表不填满 |
| 歌曲列表 | `border: 1px solid var(--border)` + `border-radius: 8px` | 像卡片，不填满 |
| 表头 | `background-color: var(--bg-secondary)` + `border-radius: 8px 8px 0 0` | 圆角不统一 |
| 列表高度 | `height: calc(100vh - 260px)` | 底部有空白 |

### 设计目标

1. 歌曲列表填满内容区宽度，不留两侧空白
2. 列表延伸到底部播放栏，不留底部空白
3. 保持整体视觉一致性，不破坏现有设计语言

---

## 设计系统声明

```markdown
Design Decisions:
- 布局策略：歌曲列表无边框、无圆角，填满内容区
- 间距系统：内容区左右 padding 缩小到 16px，上下 padding 保持 20px
- 边框策略：歌曲列表去掉边框，表头和数据行统一
- 圆角策略：歌曲列表去掉圆角，保持桌面工具感
- 高度策略：列表延伸到底部播放栏
```

---

## 改动方案

### 1. 内容区 padding 调整

**文件**：`src/styles/content.css`

```css
.content {
  flex: 1;
  background-color: var(--bg-primary);
  overflow-y: auto;
  padding: 20px 16px;  /* 上下 20px，左右 16px */
  position: relative;
}
```

**理由**：保留上下 padding（20px），左右 padding 从 24px 缩小到 16px，让列表视觉上撑满但不紧贴边缘。

### 2. 歌曲列表去掉边框和圆角

**文件**：`src/styles/songlist.css`

```css
.song-list__scroll {
  height: calc(100vh - 240px);  /* 调整高度，让列表延伸到底部 */
  overflow: auto;
  border-radius: 0;
  border: none;
}

.song-list__header {
  /* ... 保持不变 ... */
  border-radius: 0;
}
```

**理由**：去掉边框和圆角，让列表无边框，填满内容区宽度。

### 3. 列表高度调整

**文件**：`src/styles/songlist.css`

```css
.song-list__scroll {
  height: calc(100vh - 240px);  /* 从 260px 改成 240px */
}
```

**理由**：减去的值从 260px 改成 240px，让列表延伸到底部播放栏。

**注意**：需要实际测试 `calc(100vh - 240px)` 是否够填满底部。如果不够，可以继续调整。

---

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/styles/content.css` | padding: 20px 24px → 20px 16px |
| `src/styles/songlist.css` | border-radius: 8px → 0，border: 1px → none，height: calc(100vh - 260px) → calc(100vh - 240px) |

---

## 验证方法

1. `npm run dev` — 启动后确认：
   - 歌曲列表填满宽度，两侧无空白
   - 列表延伸到底部播放栏，底部无空白
   - 表头和数据行对齐
   - 滚动正常
   - "选择文件夹"按钮位置正常

---

## 设计约束

- 不改变现有布局结构（左右分栏）
- 不改变现有组件逻辑
- 不引入新依赖
- 保持桌面工具感，不做卡片化

---

*方案就绪，等主人确认后执行。*
