# QinPlayer 歌曲列表两侧空隙修复方案

> 创建：2026-07-04
> 状态：待确认

---

## 问题

表头和数据行两侧都有小空隙，没有完全填满宽度。

## 原因

- 表头有 `padding: 8px 16px`，两侧各有 16px 空隙
- 数据行有 `padding: 8px 16px`，两侧各有 16px 空隙

## 改动方案

**文件**：`src/styles/songlist.css`

```css
.song-list__header {
  padding: 8px 0;  /* 从 8px 16px 改成 8px 0 */
}

.song-list__row {
  padding: 8px 0;  /* 从 8px 16px 改成 8px 0 */
}
```

**理由**：表头和数据行保持相同水平 padding，都改成 0，让内容填满宽度。列自身的 width/flex 控制列宽。

---

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/styles/songlist.css` | .song-list__header 和 .song-list__row 的 padding: 8px 16px → 8px 0 |

---

## 验证方法

1. `npm run dev` — 启动后确认：
   - 表头和数据行填满宽度，两侧无空隙
   - 表头和数据列对齐
   - 有滚动条/无滚动条两种情况

---

*方案就绪，等主人确认后执行。*
