# Devlog — 2026-07-11 专辑网格排序

## 目标

- 专辑网格默认按专辑名的拼音/本地化字母序升序排列。
- 支持按代表歌手排序，并可切换升序和降序。
- 当前排序字段的空白值和未知值始终位于末尾。
- 排序只影响网格展示，不改变专辑分组和详情歌曲顺序。

## 实现

1. `sortAlbums` 使用模块级 `Intl.Collator`，支持中文拼音、大小写不敏感、自然数字和忽略标点。
2. 主字段相同时使用另一字段作为次级排序；未知判断在方向反转前独立处理，升序和降序都固定置底。
3. 排序函数只复制外层专辑数组，不复制或排序 `album.songs`。
4. `Albums` 保留 `songs:getAll` 的分组源顺序，通过 `useMemo` 派生网格列表；字段和方向只在页面组件挂载期间保存。
5. `AlbumSortMenu` 是受控单层菜单，本地只保存开关状态；触发器持续显示当前字段和方向。
6. 菜单使用 `menuitemradio` / `aria-checked`，支持 Enter、Space、ArrowDown、方向键循环、Home、End、Escape、外部点击和 Tab 离开。
7. Header 操作区可整体换行，弹层锚定触发器右侧，样式仅使用现有主题 token，并支持减少动态效果。

## 修改文件

- 新增：`src/utils/albumSort.ts`、`src/components/AlbumSortMenu.tsx`。
- 修改：`src/pages/Albums.tsx`、`src/styles/albums.css`、`SPEC.md`。
- 新增测试：`tests/albumSort.test.ts`、`tests/AlbumSortMenu.test.tsx`、`tests/Albums.test.tsx`。

## 新增测试

共新增 34 条：

- `albumSort`：12 条，覆盖拼音、降序、未知项、次级字段、自然数字、空格/大小写和不可变性。
- `AlbumSortMenu`：14 条，覆盖四种打开方式、两组单选语义、受控更新、选择/退出回焦、外部点击、键盘循环、真实 Tab 焦点和监听清理。
- `Albums`：8 条，覆盖默认顺序、字段/方向接线、单次 IPC、详情歌曲顺序、返回保留状态、总数和空状态。

## 验证结果

- Task 0：相邻页面 2 个文件 / 19 个测试通过；main、preload、renderer 三段基线构建通过。
- Task 1：`albumSort` 1 个文件 / 12 个测试通过。
- Task 2：纯函数与页面接线 2 个文件 / 20 个测试通过。
- Task 3：菜单与真实页面接线 2 个文件 / 22 个测试通过；生产构建通过。
- 定向回归：3 个文件 / 34 个测试通过。
- `npx tsc --noEmit`：通过。
- 最终 `npm run verify`：Harness 约束检查通过；main、preload、renderer 生产构建通过；22 个测试文件 / 241 个测试全部通过，0 failed。

## 审查结果

- 审查发现 Tab 时同步关闭弹层会让焦点落回 `body`；增强为真实 `userEvent.tab()` 测试后先失败。
- 改为在 `focusin` 确认焦点离开菜单根节点后关闭，浏览器默认 Tab 顺序得以保留；修复后完整门禁再次通过。
- 未发现其余排序、状态、IPC、数组变异或监听生命周期问题。

## 约束确认

- 未新增依赖、IPC、数据库查询、feature flag 或持久化设置。
- 未修改专辑按名称分组规则、代表歌手来源或专辑详情歌曲顺序。
- 未修改 `ContextMenu`、公共 Album 类型和数据库 schema。
- 未自动提交 Git。

## 主人手动验证

状态：**待主人验证**。

- 深色和浅色主题分别检查标题、排序触发器、专辑总数、四个菜单项和分隔线。
- 用中文、英文、数字和未知值检查两个字段的升序/降序结果。
- 缩小到主窗口最小尺寸，确认 header 换行后不覆盖网格，弹层不被裁切。
- 使用键盘验证 Enter/Space/ArrowDown 打开、方向键/Home/End 移动、Escape 回焦和 Tab 正常离开。
- 进入专辑详情确认排序控件隐藏、歌曲顺序不变；返回后排序状态保留。
