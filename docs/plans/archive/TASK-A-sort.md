# 任务包 A：通用排序菜单 + LocalMusic/Liked 排序

> 来源：PLAN-sort-closebehavior-eq.md 批次 A
> 约束：不改 SongList、不持久化排序状态、不改后端查询

## 入场条件

- `npm run verify` 基线全绿
- 读完 `docs/plans/PLAN-sort-closebehavior-eq.md` 第 7 节（批次 A）

## 任务

### A1. 新建 `src/utils/trackSort.ts`

- 导出 `TrackSortBy = 'title' | 'artist' | 'playCount'`
- 导出 `sortTracks(tracks: readonly Track[], sortBy: TrackSortBy, order: SortOrder): Track[]`
- title/artist 用中文拼音 Collator（numeric: true, ignorePunctuation），空值/未知固定末尾
- playCount 非有限值固定末尾，正常值按数值
- 稳定 tie-break：title → artist → id 均升序
- 返回副本，不修改输入

### A2. 泛化 SortMenu

- 把 `src/components/AlbumSortMenu.tsx` 重命名为 `src/components/SortMenu.tsx`
- 新增 props：`fields: readonly SortField<T>[]`、`ariaLabel: string`
- `SortField<T>` = `{ value: T; label: string }`
- `sortBy` 类型从 `AlbumSortBy` 改为泛型 `T`
- `onSortByChange` 类型从 `(value: AlbumSortBy)` 改为 `(value: T)`
- 移除 `fieldLabel` prop，改为从 `fields` 查找
- popup id 用 `useId()` 替代固定 `MENU_ID`
- 打开后聚焦当前 field，非法值聚焦第一项
- fieldOptions 从 fields 动态生成，不硬编码
- CSS 从 `albums.css` 移到 `src/styles/sort-menu.css`，类名改为 `sort-menu__*`
- `global.css` 在页面样式之后、motion.css 之前导入 sort-menu.css

### A3. 更新 Albums.tsx

- import 从 `AlbumSortMenu` 改为 `SortMenu`
- 传 `fields={[{ value: 'name', label: '专辑名' }, { value: 'artist', label: '歌手' }]}`
- `ariaLabel="专辑排序"`
- 排序行为不变

### A4. LocalMusic 加排序

- 新增 `sortBy` / `sortOrder` state（默认 title + asc）
- `useMemo` 调用 `sortTracks` 排序
- header 区域加 SortMenu（左）+ "选择文件夹"按钮（右）
- 传 `sortedTracks` 给 SongList
- fields：title/artist/playCount

### A5. Liked 加排序

- 同 LocalMusic 逻辑
- 新增标准 header/actions 区域
- fields：title/artist/playCount

### A6. 删除旧文件

- 删除 `src/components/AlbumSortMenu.tsx`
- 删除 `tests/AlbumSortMenu.test.tsx`
- 清理 `albums.css` 中的 `.album-sort-menu__*` 样式

### A7. 测试

- `tests/SortMenu.test.tsx`：泛型调用、动态字段、aria-label、useId 唯一、键盘导航、焦点
- `tests/trackSort.test.ts`：拼音、数值、未知值、tie-break、输入不变
- `tests/LocalMusic.test.tsx`：排序后列表正确、起播队列等于 sortedTracks
- `tests/Liked.test.tsx`：同上
- `tests/Albums.test.tsx`：行为不变

### A8. 验收

```bash
npx vitest run tests/SortMenu.test.tsx tests/trackSort.test.ts tests/Albums.test.tsx tests/LocalMusic.test.tsx tests/Liked.test.tsx
npx tsc --noEmit
```

### A9. 完成后

- 更新 SPEC.md（排序字段）
- 写 devlog
- 等主人确认视觉效果后 commit
