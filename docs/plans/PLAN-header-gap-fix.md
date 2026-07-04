# QinPlayer 表头两侧空隙修复方案（v2）

> 创建：2026-07-04
> 修订：2026-07-04（Codex 审查后修正）
> 状态：待确认

---

## 问题

表头（#、歌名、歌手、时长）两侧有小空隙，没有完全填满宽度。

## 当前源码实际样式

```css
.song-list {
  --song-list-scrollbar-gutter: 6px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.song-list__scroll {
  flex: 1;
  height: auto;
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
  border-radius: 0;
  border: none;
}

.song-list__header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background-color: var(--bg-secondary);
  /* ... */
  padding-right: calc(16px + var(--song-list-scrollbar-gutter)); /* = 22px */
}

.song-list__row {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  /* ... */
}
```

**问题**：表头 padding-right 是 22px（16px + 6px gutter），数据行 padding-right 是 16px，表头比数据行右侧多 6px 空隙。

---

## 改动方案

### 1. 表头和数据行保持相同水平 padding

**文件**：`src/styles/songlist.css`

```css
.song-list__header {
  display: flex;
  align-items: center;
  padding: 8px 16px;  /* 保持和数据行一致 */
  background-color: var(--bg-secondary);
  /* ... */
  /* 删除 padding-right: calc(16px + var(--song-list-scrollbar-gutter)); */
}
```

**理由**：表头和数据行必须使用同一套水平内边距，否则列起点会错位。

### 2. 表头背景铺满宽度（用伪元素扩展）

**文件**：`src/styles/songlist.css`

```css
.song-list__header {
  position: relative;  /* 新增 */
  isolation: isolate;  /* 创建独立层叠上下文 */
}

.song-list__header::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -16px;   /* 向左扩展 16px */
  right: -16px;  /* 向右扩展 16px */
  background-color: var(--bg-secondary);
  z-index: -1;   /* 在表头内容后面 */
}
```

**理由**：用伪元素扩展背景，不改变表头内容的起点，让背景铺满宽度。

### 3. 有滚动条时按实测决定是否预留 gutter

**当前状态**：`.song-list__scroll` 已有 `scrollbar-gutter: stable`，会自动预留滚动条宽度。

**验证**：需要测试有滚动条/无滚动条两种情况，确认表头和数据列对齐。如果仍错位，再给表头右侧预留 gutter。

---

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/styles/songlist.css` | 删除表头的 padding-right，新增伪元素扩展背景 |

---

## 验证方法

1. `npx tsc --noEmit` — TypeScript 语法检查
1. `npm run dev` — 启动后确认：
   - 表头背景铺满宽度，两侧无空隙
   - 表头和数据列对齐（歌名/歌手/时长）
   - 有滚动条/无滚动条两种情况
   - 最近播放、搜索结果两种列表

---

*方案就绪，等主人确认后执行。*
