# 迷你队列视图滚动条边距修复（v3）

> 创建：2026-07-11
> 修订：2026-07-11（修复滚动条和关闭按钮重叠问题）
> 状态：待确认

---

## 约束

- 不新增依赖、不新增 IPC、不改数据库查询
- 不新增 feature flag
- 不顺手重构其他样式
- 不要自动 git commit
- 只改方案里明确列出的代码

---

## 问题

1. 迷你队列视图的滚动条和迷你模式边缘之间有28px空白
2. 滚动条滚动到顶端时会和关闭按钮重叠

## 根因

1. `.mini-player__content` 的 `padding-right: 28px` 应用到了所有视图，包括队列视图
2. 关闭按钮是 `position: absolute`，`top: 6px`，`right: 6px`，`width: 26px`，`height: 26px`
3. 滚动条在右边缘，滚动到顶端时会和关闭按钮重叠

## 目标

1. 队列视图的滚动条贴着右边缘，没有多余空白
2. 滚动条滚动到顶端时不会和关闭按钮重叠
3. 默认视图的歌曲信息和进度条不被关闭按钮遮挡

---

## 改动范围

| 文件 | 改动 |
|------|------|
| `src/styles/miniplayer.css` | 把 `padding-right: 28px` 从 `.mini-player__content` 移到 `.mini-player__default-view`；给 `.mini-queue-view` 加 `margin-top` 和调整高度 |

**不影响：** 歌词视图、关闭按钮位置、其他样式

---

## 实现

### 步骤1：移除 `.mini-player__content` 的 `padding-right`

当前样式（第26-32行）：
```css
.mini-player__content {
  min-width: 0;
  min-height: 0;
  padding-right: 28px;
  overflow: hidden;
}
```

改为：
```css
.mini-player__content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
```

### 步骤2：给 `.mini-player__default-view` 加 `padding-right`

当前默认视图样式（第33-41行）：
```css
.mini-player__default-view {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 18px;
  gap: 6px;
}
```

改为：
```css
.mini-player__default-view {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 18px;
  gap: 6px;
  padding-right: 28px;
}
```

### 步骤3：给 `.mini-queue-view` 加 `margin-top` 和调整高度

当前队列视图样式（第244-253行）：
```css
.mini-queue-view {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}
```

改为：
```css
.mini-queue-view {
  width: 100%;
  height: calc(100% - 28px);
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  margin-top: 28px;
}
```

**⚠️ 注意：**
- `margin-top: 28px` 是关闭按钮高度26px + 顶部2px = 28px（比之前少4px，让滚动条更靠近关闭按钮）
- `height: calc(100% - 28px)` 让队列视图不延伸到关闭按钮区域
- 这样滚动条不会和关闭按钮重叠，且更靠近顶部

---

## 单元测试

纯CSS改动，不涉及逻辑变更，无需新增单元测试。现有测试覆盖了迷你模式的三视图切换和交互行为，样式变化不影响功能。

---

## 验收标准

1. `npx tsc --noEmit` 无报错
2. `npm test` 通过
3. 队列视图的滚动条贴着右边缘，没有多余空白
4. 滚动条滚动到顶端时不会和关闭按钮重叠
5. 默认视图的歌曲信息和进度条不被关闭按钮遮挡
6. 歌词视图样式不受影响
7. 深色/浅色主题下样式正确

## 手动测试

1. `npm run dev` 启动
2. 进入迷你模式 → 默认视图正常显示
3. 切换到队列视图 → 滚动条贴着右边缘，没有空白
4. 滚动到顶端 → 滚动条不会和关闭按钮重叠
5. 切换到歌词视图 → 样式正常
6. 切换深色/浅色主题 → 样式正确
7. 关闭按钮功能正常
