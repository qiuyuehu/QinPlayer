# QinPlayer 歌曲列表表头独立方案（v2）

> 创建：2026-07-04
> 修订：2026-07-04（Codex 审查后修正）
> 状态：待确认

---

## 问题

表头（#、歌名、歌手、时长）在滚动容器内，跟着滚动条一起滚动，不好看。

## 目标

- 表头独立出来，不在滚动条范围内
- 表头和数据列对齐（有滚动条/无滚动条两种情况）

## 当前布局结构

```
.song-list (flex column)
  └── .song-list__scroll (height: 100%, overflow: auto)
        ├── .song-list__header (position: sticky, top: 0)
        └── 虚拟列表行
```

---

## 改动方案

### 1. 表头移出滚动容器

**文件**：`src/components/SongList.tsx`

把 `<div className="song-list__header">` 从 `.song-list__scroll` 内移到 `.song-list` 内：

```
.song-list (flex column)
  ├── .song-list__header (独立，不滚动)
  └── .song-list__scroll (overflow: auto)
        └── 虚拟列表行
```

### 2. 调整滚动区高度

**文件**：`src/styles/songlist.css`

```css
.song-list__scroll {
  flex: 1;           /* 从 height: 100% 改成 flex: 1 */
  min-height: 0;     /* 允许收缩 */
  height: auto;      /* 高度自适应 */
  overflow: auto;
  scrollbar-gutter: stable;  /* 预留滚动条宽度，防止列错位 */
}
```

**理由**：表头移出后，滚动区需要用 flex: 1 填充剩余空间，不能继续用 height: 100%（会溢出）。

### 3. 处理表头和数据列对齐

**问题**：表头在滚动容器外，数据区有滚动条时，表头和数据列可能错位。

**方案**：给 `.song-list__scroll` 加 `scrollbar-gutter: stable`，预留滚动条宽度。

**验证**：需要测试有滚动条/无滚动条两种情况，确认列对齐。

**Fallback**：如果 `scrollbar-gutter: stable` 后仍出现表头/数据列错位，则给 `.song-list__header` 预留同等右侧 gutter（例如 `padding-right` 或 CSS 变量方式），直到有滚动条/无滚动条两种状态都对齐。

### 4. 删除表头的 sticky 定位

**文件**：`src/styles/songlist.css`

```css
.song-list__header {
  /* 删除以下三行 */
  /* position: sticky; */
  /* top: 0; */
  /* z-index: 1; */
}
```

**理由**：表头已移出滚动容器，不再需要 sticky 定位。

### 5. 保留 .content padding 不改

**不改**：`src/styles/content.css` 的 `.content` padding 保持 `20px 8px 0`。

**理由**：`.content` 是所有页面共用的，改成 `padding: 20px 0 0` 会让标题"最近播放"也贴到侧栏边缘。若要列表全出血，用页面/列表自身做局部 margin 或单独处理标题区 padding。

---

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/components/SongList.tsx` | 表头从滚动容器内移到外面 |
| `src/styles/songlist.css` | .song-list__scroll 改成 flex: 1，加 scrollbar-gutter: stable；删除表头的 sticky 定位 |

**不改动**：
- `src/styles/content.css` — 保留现有 padding

**注释更新**：执行时顺手更新 `SongList.tsx` 第 266 行附近关于"表头 sticky 固定在内部"的注释，避免代码注释和结构不一致。

---

## 验证方法

1. `npx tsc --noEmit` — TypeScript 语法检查
2. `npm test -- SongList` — SongList 测试通过
3. 手动验证：
   - 最近播放页面：表头固定，列对齐
   - 本地音乐页面：表头固定，列对齐
   - 搜索结果页面：表头固定，列对齐
   - 有滚动条/无滚动条两种情况

---

## 风险

- 表头和数据列可能错位（需要 scrollbar-gutter 或手动对齐）
- 虚拟列表高度计算可能受影响（需要验证）

---

*方案就绪，等主人确认后执行。*
