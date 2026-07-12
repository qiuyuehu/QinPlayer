# 方案：播放排行表格 Grid 布局重写

## 问题

播放排行表头与数据行没有共用同一套列布局模板，导致垂直对齐不一致。

## 当前结构

**HTML** (`src/pages/MyProfile.tsx` 198-225 行)：
```
<table class="profile-ranking__table">
  <thead><tr>
    <th>名次</th><th>标题</th><th>歌手</th><th>播放次数</th>
  </tr></thead>
  <tbody><tr>
    <td class="profile-ranking__rank">1</td>
    <td class="profile-ranking__title">歌名</td>
    <td class="profile-ranking__artist">歌手</td>
    <td class="profile-ranking__count">70 次</td>
  </tr></tbody>
</table>
```

**CSS** (`src/styles/myprofile.css` 282-363 行)：
- table: `table-layout: fixed; border-collapse: collapse`
- th, td: `height: 38px; padding: 0 10px`
- 列宽用 `th:first-child { width: 52px }` + `th:nth-child(2) { width: 42% }` + `th:last-child { width: 88px }`
- td 侧靠类名 `.profile-ranking__rank` / `.profile-ranking__count` 设 text-align

## 根因

`<table>` 的 `table-layout: fixed` 从第一行 `<th>` 推导列宽，`<td>` 的 width 被忽略。th 和 td 是不同元素类型，浏览器可能给它们不同的默认布局行为（baseline、vertical-align 等），导致对齐不一致。

## 修复方案

将 `<tr>` 改为 `display: grid`，让 thead 的 `<tr>` 和 tbody 的 `<tr>` 共用同一个 `grid-template-columns`。HTML 不改。

### 改动文件

仅 `src/styles/myprofile.css`（282-363 行）

### 具体改动

**Step 1：table 容器**

```css
.profile-ranking__table {
  width: 100%;
  font-size: 12px;
}
```

移除 `table-layout: fixed` 和 `border-collapse: collapse`（Grid 布局不需要）。

**Step 2：tr 统一 Grid 模板**

```css
.profile-ranking__table thead tr,
.profile-ranking__table tbody tr {
  display: grid;
  grid-template-columns: 52px minmax(0, 1.8fr) minmax(0, 1fr) 88px;
  height: 38px;
  align-items: center;
}
```

表头行和数据行共用完全相同的 `grid-template-columns`，`align-items: center` 垂直居中，`height: 38px` 保留固定行高。

**Step 3：单元格基础样式**

```css
.profile-ranking__table th,
.profile-ranking__table td {
  padding: 0 10px;
  border-bottom: 1px solid var(--border-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

移除 `height: 38px`（行高由 `tr` 上的 `height: 38px` + `align-items: center` 控制，单元格不再需要固定高度）。

**Step 4：各列对齐（th/td 成对声明）**

```css
/* 名次列：居中 */
.profile-ranking__table th:first-child,
.profile-ranking__table td:first-child {
  text-align: center;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* 标题列：左对齐 */
.profile-ranking__table th:nth-child(2),
.profile-ranking__table td:nth-child(2) {
  text-align: left;
}

/* 歌手列：左对齐 */
.profile-ranking__table th:nth-child(3),
.profile-ranking__table td:nth-child(3) {
  text-align: left;
}

/* 播放次数列：右对齐 */
.profile-ranking__table th:last-child,
.profile-ranking__table td:last-child {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

**Step 5：表头样式**

```css
.profile-ranking__table th {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
}
```

**Step 6：交互样式（保持不变）**

```css
.profile-ranking__table tbody tr[tabindex] {
  cursor: pointer;
}

.profile-ranking__table tbody tr:hover,
.profile-ranking__table tbody tr:focus-visible {
  background: var(--control-hover);
}
```

**Step 7：响应式**

```css
@media (max-width: 900px) {
  .profile-ranking__table thead tr,
  .profile-ranking__table tbody tr {
    grid-template-columns: 52px minmax(0, 1.4fr) minmax(0, 1fr) 88px;
  }
}
```

**Step 8：移除冗余选择器**

`.profile-ranking__rank` 和 `.profile-ranking__count` 的 width/text-align 声明移除（已由 td:first-child / td:last-child 替代）。保留 className 不变（JSX 不改）。

### 不改动

- JSX（MyProfile.tsx）不改
- HTML 结构不改
- 不改业务逻辑
- 不改顶部统计区

## 约束条件

1. 表头行和数据行必须共用同一个 `grid-template-columns`
2. 两者必须拥有完全相同的左右 padding
3. 名次列统一 text-align: center
4. 播放次数列统一 text-align: right
5. 不得新增 magic number margin/transform 修补单独元素位置
6. 不改 TypeScript 业务逻辑

## 自检清单

- [ ] `thead tr` 和 `tbody tr` 是否使用完全相同的 `grid-template-columns`
- [ ] 两者是否拥有完全相同的左右 padding
- [ ] 名次列是否统一居中
- [ ] 播放次数列是否统一右对齐
- [ ] 是否没有针对表头单独设置额外 margin

## 回归测试

### 现有测试
`tests/MyProfile.test.tsx` — 7 个测试，渲染+交互

### 新增测试

1. **Grid 布局测试**：验证 `<tr>` 的 display 为 grid
2. **列模板一致性测试**：验证 thead tr 和 tbody tr 的 gridTemplateColumns 相同
3. **对齐测试**：验证 th[0] 和 td[0] 的 textAlign 都是 center，th[3] 和 td[3] 的 textAlign 都是 right

### 手动验证

主人 `npm run dev` 后：
1. 打开「我的」页面
2. 表头和数据列应在同一垂直线上
3. 名次列居中，播放次数列右对齐
4. 拖窗口到 800px 宽度检查响应式
