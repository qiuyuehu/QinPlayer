# QinPlayer 歌曲列表布局调整方案

> 创建：2026-07-04
> 状态：待确认

---

## 问题

1. 表头（#、歌名、歌手、时长）在滚动容器内，跟着滚动条一起滚动，不好看
2. 列表两侧还有空白，需要完全填满

## 目标

- 表头独立出来，不在滚动条范围内
- 列表完全填满内容区宽度，不留两侧空白

## 当前布局结构

```
.song-list
  └── .song-list__scroll (overflow: auto)
        ├── .song-list__header (position: sticky, top: 0)
        └── 虚拟列表行
```

**问题**：表头在滚动容器内，虽然有 `position: sticky` 能固定，但表头在滚动条范围内，视觉上不好看。

---

## 改动方案

### 1. 表头独立出来

**文件**：`src/components/SongList.tsx`

把表头从 `.song-list__scroll` 内移到外面：

```
.song-list
  ├── .song-list__header (独立，不滚动)
  └── .song-list__scroll (overflow: auto)
        └── 虚拟列表行
```

**改动**：
- 把 `<div className="song-list__header">` 从 `.song-list__scroll` 内移到 `.song-list` 内
- 删除 `.song-list__header` 的 `position: sticky; top: 0; z-index: 1;`（不再需要）

### 2. 去掉两侧空白

**文件**：`src/styles/content.css`

```css
.content {
  flex: 1;
  background-color: var(--bg-card);
  overflow: hidden;
  padding: 20px 0 0;  /* 从 20px 8px 0 改成 20px 0 0 */
  position: relative;
  min-height: 0;
}
```

**理由**：去掉左右 padding，让列表完全填满内容区宽度。

---

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/components/SongList.tsx` | 表头从滚动容器内移到外面，删除 sticky 定位 |
| `src/styles/content.css` | padding: 20px 8px 0 → 20px 0 0 |
| `src/styles/songlist.css` | 删除 `.song-list__header` 的 position/top/z-index |

---

## 验证方法

1. `npm run dev` — 启动后确认：
   - 表头独立在顶部，不在滚动条范围内
   - 列表完全填满宽度，两侧无空白
   - 表头和数据列对齐
   - 滚动正常

---

*方案就绪，等主人确认后执行。*
