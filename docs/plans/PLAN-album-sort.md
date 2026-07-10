# 专辑排序方案

> 创建：2026-07-10
> 状态：待确认

---

## 前置条件

- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`
- 代码规范：TypeScript，中文注释
- 测试运行：`npm test`
- 开工前必读：`SPEC.md` → `harness/CONSTRAINTS.md` → 最近 devlog

---

## 问题

当前专辑页面按歌曲数降序排列，没有排序控件。主人想要按专辑首字母和歌手名字首字母排序，默认按专辑首字母升序。

## 根因

Albums.tsx 第 57-58 行硬编码了排序逻辑：
```typescript
const sorted = Array.from(albumMap.values())
  .sort((a, b) => b.songs.length - a.songs.length)
```

## 方案

新增 `sortBy` 状态（'name' | 'artist'）和 `sortOrder` 状态（'asc' | 'desc'），在 `albums__header` 右上角增加排序控件。专辑详情视图不加排序（保持原始顺序）。

---

## 改动范围

| 文件 | 改动 |
|------|------|
| `src/pages/Albums.tsx` | 新增排序状态、排序控件、排序逻辑 |
| `src/styles/albums.css` | 新增排序控件样式 |

**不影响：** 专辑详情视图、SongList 组件、其他页面

---

## Task 1: Albums.tsx 新增排序状态和控件

**目标：** 新增 sortBy/sortOrder 状态，在 albums__header 右上角增加排序控件

**文件：** `src/pages/Albums.tsx`

**实现要点：**

1. **新增状态：**
```typescript
const [sortBy, setSortBy] = useState<'name' | 'artist'>('name')
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
```

2. **排序逻辑改造：**
```typescript
// 当前（硬编码按歌曲数降序）
const sorted = Array.from(albumMap.values())
  .sort((a, b) => b.songs.length - a.songs.length)

// 改为：按 sortBy 和 sortOrder 排序
const sorted = Array.from(albumMap.values()).sort((a, b) => {
  const compare = sortBy === 'name'
    ? a.name.localeCompare(b.name, 'zh-CN')
    : a.artist.localeCompare(b.artist, 'zh-CN')
  return sortOrder === 'asc' ? compare : -compare
})
```

3. **排序控件渲染（albums__header 内）：**
```tsx
<div className="albums__header">
  <h2 className="albums__title">专辑</h2>
  <div className="albums__sort">
    <button
      className={`albums__sort-btn ${sortBy === 'name' ? 'albums__sort-btn--active' : ''}`}
      onClick={() => setSortBy('name')}
    >
      专辑名
    </button>
    <button
      className={`albums__sort-btn ${sortBy === 'artist' ? 'albums__sort-btn--active' : ''}`}
      onClick={() => setSortBy('artist')}
    >
      歌手
    </button>
    <button
      className="albums__sort-btn"
      onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
    >
      {sortOrder === 'asc' ? '↑ 升序' : '↓ 降序'}
    </button>
  </div>
  <span className="albums__total">{albums.length} 个专辑</span>
</div>
```

**⚠️ 注意：**
- `localeCompare` 用 `'zh-CN'` locale 支持中文排序
- 排序控件放在 `albums__total` 左边
- 排序状态变化时 `useEffect` 会自动重新排序（依赖 `sortBy` 和 `sortOrder`）

**完成标准：**
- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm test` 通过

---

## Task 2: 样式调整

**目标：** 新增排序控件样式

**文件：** `src/styles/albums.css`

**实现要点：**

```css
.albums__sort {
  display: flex;
  align-items: center;
  gap: 4px;
}

.albums__sort-btn {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.albums__sort-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.albums__sort-btn--active {
  color: var(--accent);
  background: rgba(255, 255, 255, 0.05);
}
```

**⚠️ 注意：**
- 样式参考 Playlists.tsx 的 `.playlists__sort-btn`
- `albums__header` 需要调整为 `display: flex` + `align-items: center` + `gap`

**完成标准：**
- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm test` 通过

---

## 验收标准

1. `npx tsc --noEmit` 无报错
2. `npm test` 全部通过
3. 专辑页面默认按专辑首字母升序排列
4. 可以切换到按歌手名排序
5. 可以切换升序/降序
6. 排序控件在右上角，专辑数量左边
7. 专辑详情视图不受影响（保持原始顺序）

## 手动测试（主人执行）

1. `npm run dev` 启动
2. 进入专辑页面 → 默认按专辑名升序排列
3. 点击"歌手"按钮 → 按歌手名升序排列
4. 点击"↓ 降序" → 按歌手名降序排列
5. 点击"专辑名" → 按专辑名降序排列
6. 进入某个专辑详情 → 歌曲列表保持原始顺序
7. 返回专辑网格 → 排序状态保持
