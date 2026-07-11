# 专辑网格排序实施方案

> **For Hermes:** 严格按任务顺序实施；先写失败测试，再写最小实现。不要自动提交 Git，由主人决定何时提交。
>
> 创建：2026-07-10
> 修订：2026-07-11（Codex 对照当前源码完成审查并重写）
> 状态：待主人确认

## 审查结论

原方案的产品方向正确，但存在会造成错误排序、测试漏网和 UI 回归的问题，不能直接照原稿实施。

| 原方案问题 | 风险 | 本版修正 |
|---|---|---|
| 先说用 `useEffect` 排序，后文又说渲染时直接计算 | 实现口径矛盾，容易产生重复 state 或每次 render 重排 | 抽出纯函数，页面用 `useMemo` 计算派生列表 |
| 用 `\uffff` 代表“未知”，最后再整体反转比较器 | 降序时未知项会反到列表最前 | 未知判断独立于升降序，始终排在当前排序字段的末尾 |
| 每次比较直接 `localeCompare(..., 'zh-CN')` | 规则不完整，也会反复创建隐式 collator | 模块级 `Intl.Collator`，明确拼音、大小写、数字与标点语义 |
| 只比较一个字段 | 同歌手专辑顺序取决于数据库插入顺序，结果不稳定 | 主字段相同后比较次字段，最终相同则保留源顺序 |
| “按首字母”与代码实际比较全文没有解释 | 验收时容易对“只比较第一个字符”产生歧义 | 定义为本地化字母序：首字母优先，全文继续决定同首字母顺序 |
| 在 `Albums.tsx` 重写 `AlbumGroup` | 项目已经存在公共 `Album` 类型 | 复用 `src/types/index.ts` 的 `Album`，删除重复接口和无用 import |
| 把字段、方向拆成三个常驻按钮 | header 占用过宽，视觉上像一排设置按钮 | 四个选项收进一枚“专辑名 · 升序”菜单触发器 |
| 三个 header 子元素直接 `space-between` | 排序控件会被摊在标题和计数之间，窄内容区容易挤压 | 增加 `albums__header-actions`，菜单触发器与只读计数组成右侧操作区 |
| 直接复用现有 `ContextMenu` 的诱惑 | 现有组件按鼠标坐标定位，没有 checked 状态、完整菜单键盘导航或焦点回归 | 新建受控 `AlbumSortMenu`，使用锚点定位和 `menuitemradio` 语义 |
| 没有 popup、focus 和键盘契约 | 键盘和辅助技术无法识别当前排序或安全关闭菜单 | 补齐 `aria-haspopup/expanded`、单选项、方向键、Escape、外部点击和焦点回归 |
| 只计划页面测试 | 降序未知项、数字、拼音、不可变性等边界难以稳定覆盖 | 新增纯函数单测 + 页面接线测试两层覆盖 |
| 仍以 `npx tsc --noEmit` 作为门禁 | 不能替代 Electron 三段生产构建和 Harness | 最终统一运行 `npm run verify` |
| 未更新 SPEC 和 devlog | 产品行为与项目记忆脱节 | 实施后同步 `SPEC.md` 并写真实 devlog |

---

## 前置条件

- 身份：你是 work profile 的 Hermes Agent，负责按本方案实现专辑网格排序。
- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`
- WSL 路径：`/mnt/c/Users/秋月/Desktop/QinPlayer`
- 技术栈：Electron 31、React 18、TypeScript、Vitest、Testing Library。
- 开工前必读：`SPEC.md` → `harness/SPEC.md` → `harness/CONSTRAINTS.md` → `harness/DECISIONS.md` → `harness/TEST_CONVENTIONS.md` → 最新 devlog。
- Git 约束：先执行 `git status --short`；不得覆盖或回滚主人已有改动；不要自动提交。
- 定向验证：`npx vitest run tests/albumSort.test.ts tests/AlbumSortMenu.test.tsx tests/Albums.test.tsx`。
- 最终验证：`npm run verify`；不要用单独的 `npx tsc --noEmit` 代替生产构建。
- 禁止事项：不新增依赖、不新增 IPC、不改数据库查询、不新增 feature flag、不持久化排序偏好、不顺手重构专辑数据模型。

## Goal

为专辑网格增加两种排序字段和两个方向：

- 默认：按专辑名本地化字母序升序。
- 可切换：按歌手名本地化字母序。
- 可切换：升序 / 降序。
- 当前排序字段中的未知值始终放在末尾。

排序只改变专辑卡片在网格中的展示顺序，不改变专辑分组、封面选择、专辑内歌曲顺序或播放队列行为。

## Non-goals

- 不改变当前“仅按专辑名分组”的规则；同名专辑即使歌手不同，仍沿用现有合并行为。
- 不引入 `albumArtist` 字段。按歌手排序使用卡片当前显示的代表歌手，即该专辑分组遇到的第一首歌曲的 artist。
- 不排序专辑详情中的歌曲。其顺序继续保持 `songs:getAll` 返回的 `id DESC` 源顺序。
- 不在切换页面、重启应用后保存排序状态；离开并重新进入“专辑”页面时恢复默认排序。
- 不把排序下沉到 SQLite；当前数据已经一次性加载到 renderer，本功能只处理专辑分组数组。
- 不照搬歌单详情的服务端排序逻辑或样式结构。

---

## 排序契约

### 字段与方向

| 状态 | 值 | 默认 | 行为 |
|---|---|---|---|
| `sortBy` | `'name' \| 'artist'` | `'name'` | 选择专辑名或代表歌手为主字段 |
| `sortOrder` | `'asc' \| 'desc'` | `'asc'` | 同时作用于主字段和次字段中的已知值 |

切换字段时保留当前方向。例如当前是“歌手降序”，点击“专辑名”后变为“专辑名降序”。

### 文本比较规则

在 `src/utils/albumSort.ts` 模块级创建一次：

```ts
const albumCollator = new Intl.Collator(
  ['zh-CN-u-co-pinyin', 'zh-CN'],
  {
    usage: 'sort',
    sensitivity: 'base',
    numeric: true,
    ignorePunctuation: true,
  },
)
```

语义：

- 中文按拼音排序。
- 拉丁字母不区分大小写和基础重音差异。
- 数字采用自然顺序，例如 `Album 2` 在 `Album 10` 前。
- 忽略前导/中间标点的排序权重。
- 比较前使用 `trim()`；显示文本保持原样，不修改专辑数据。
- “按首字母”表示本地化全文排序，不是只截取第一个字符；同首字母继续比较后续字符。

### 未知项与次级排序

- 按专辑名时，空白值或 `未知专辑` 始终最后。
- 按歌手名时，空白值或 `未知歌手` 始终最后。
- 未知项不参与方向反转，因此升序和降序都在末尾。
- 主字段相同：按专辑名时以歌手为次字段；按歌手时以专辑名为次字段。
- 次字段也遵循“未知最后”和当前方向。
- 主、次字段都相同则 comparator 返回 `0`，依赖现代 V8 的稳定排序保留源分组顺序。

### 纯函数接口

```ts
export type AlbumSortBy = 'name' | 'artist'

export function sortAlbums(
  albums: readonly Album[],
  sortBy: AlbumSortBy,
  sortOrder: SortOrder,
): Album[]
```

`sortAlbums` 必须先复制外层数组再排序，不能修改 `albums`，也不能排序或复制每个 `album.songs`。

---

## UI 契约

网格视图收起状态：

```text
[专辑]                     [专辑名 · 升序 ▾] [N 个专辑]
```

点击排序触发器后显示一个锚定在按钮右下方的单层菜单：

```text
● 专辑名
  歌手
────────
● 升序
  降序
```

- `专辑名 / 歌手 / 升序 / 降序` 四个选项整合在同一个弹出菜单中。
- 上半组选择排序字段，下半组选择排序方向；分隔线只负责视觉分组。
- 不制作截图中的二级子菜单。这里只有四个选项，单层菜单更快、更稳定，也更适合窄窗口。
- 触发器始终显示当前组合，例如 `歌手 · 降序`，无需打开菜单也能确认状态。
- 选择任一项后立即应用、关闭菜单，并把焦点返回触发器。
- `N 个专辑` 是只读统计，不放进菜单，也不伪装成第五个按钮。
- 详情视图不显示排序控件。
- 返回网格时保留组件当前 `sortBy` / `sortOrder`。
- header 允许换行；弹层右对齐触发器，不能超出内容区右边界或被专辑网格裁切。
- 样式只使用现有主题变量，不写深色专用的白色透明背景。

无障碍契约：

- 触发器：`type="button"`、`aria-haspopup="menu"`、`aria-expanded`、`aria-controls`，并提供可见 `:focus-visible`。
- 弹层：`role="menu" aria-label="专辑排序"`。
- 两组选项分别用 `role="group" aria-label="排序字段"` 和 `role="group" aria-label="排序方向"`。
- 四个选项使用 `role="menuitemradio"` + `aria-checked`；任意时刻每组恰好一个 checked。
- `Enter`、`Space` 或 `ArrowDown` 打开菜单并聚焦当前字段项。
- 菜单内 `ArrowUp/ArrowDown/Home/End` 在四个选项间循环移动焦点。
- `Escape` 关闭并把焦点返回触发器；点击外部关闭；组件卸载时清理监听。
- Tab 离开弹层时关闭菜单，不把焦点困在弹层内。

---

## 改动范围

| 类型 | 文件 | 改动 |
|---|---|---|
| Create | `src/utils/albumSort.ts` | 纯排序函数、字段类型和单例 Collator |
| Create | `src/components/AlbumSortMenu.tsx` | 受控排序菜单、锚点弹层、关闭与键盘逻辑 |
| Modify | `src/pages/Albums.tsx` | 复用 `Album`、增加状态/`useMemo`、接入排序菜单 |
| Modify | `src/styles/albums.css` | header 操作区、菜单触发器/弹层、focus 与边界样式 |
| Create | `tests/albumSort.test.ts` | 排序算法边界测试 |
| Create | `tests/AlbumSortMenu.test.tsx` | 菜单选中态、关闭、焦点和键盘测试 |
| Create | `tests/Albums.test.tsx` | 页面默认状态、交互、详情和 IPC 接线测试 |
| Modify | `SPEC.md` | 记录专辑网格排序行为与边界 |
| Create after implementation | `docs/devlog/devlog-20260711-album-sort.md` | 记录真实实现和验证结果 |

明确不修改：`electron/ipc/songs.ts`、`src/types/ipc.ts`、`src/types/index.ts`、`SongList.tsx`、feature flags、数据库 schema、`package.json`、Harness 决策文件。

---

## Task 0：基线与工作区保护

**Objective:** 确认已有代码和测试基线，避免覆盖主人修改。

### Step 1：检查状态

Run：

```bash
git status --short
```

记录已有改动。若计划内文件已有主人修改，必须基于现状合并，不得 reset/checkout。

### Step 2：运行相关基线

Run：

```bash
npx vitest run tests/Playlists.test.tsx tests/SongList.test.tsx
npm run build
```

Expected：现有相邻页面测试和生产构建通过。若已有失败，先记录并报告。

---

## Task 1：先实现并锁定纯排序契约

**Objective:** 把容易出错的 locale、未知项和方向逻辑从 React 组件中隔离出来。

**Files:**

- Create: `src/utils/albumSort.ts`
- Create test: `tests/albumSort.test.ts`

### Step 1：先写失败测试

至少覆盖：

1. 专辑名默认升序按中文拼音排列。
2. 专辑名降序正确反转已知值。
3. 按歌手排序时以歌手为主字段，同歌手再按专辑名排序。
4. `未知专辑` 在专辑名升序和降序中都位于末尾。
5. `未知歌手` 在歌手升序和降序中都位于末尾。
6. 未被选中的未知字段不强制整张卡片排末尾：例如按歌手排序时，“未知专辑 + 已知歌手”仍按歌手参与主排序。
7. `Album 2`、`Album 10` 使用自然数字顺序。
8. 大小写和首尾空格不改变基础字母序。
9. 主字段相同后使用次字段，避免同歌手专辑顺序随机。
10. 调用前后的输入数组引用顺序一致，`album.songs` 引用和内部顺序不变。

测试数据使用完整 `Album` / `Track` fixture，不用 `as any` 绕过类型。

### Step 2：确认测试先失败

Run：

```bash
npx vitest run tests/albumSort.test.ts
```

Expected：模块尚不存在，测试失败。

### Step 3：实现最小纯函数

- 模块级创建 `albumCollator`，不要在 `.sort()` comparator 内重复构造。
- 写一个内部 `compareAlbumField`：先处理空白/未知，再比较已知文本，最后应用方向。
- `sortAlbums` 根据 `sortBy` 选择主、次字段。
- 使用 `[...albums].sort(...)`，不修改参数。
- 不导出内部 comparator；测试公共行为，不锁死实现细节。

### Step 4：验证

Run：

```bash
npx vitest run tests/albumSort.test.ts
```

**完成标准：**

- [ ] 未知项在两个方向都最后。
- [ ] 拼音、自然数字和次级排序符合契约。
- [ ] 输入专辑数组与歌曲数组均未被修改。

---

## Task 2：页面接线与组件测试

**Objective:** 将排序函数接入 Albums 网格，同时证明不重载数据、不影响详情歌曲顺序。

**Files:**

- Modify: `src/pages/Albums.tsx`
- Create test: `tests/Albums.test.tsx`

### Step 1：先写页面失败测试

测试文件在导入 `Albums` 前 mock `SongList`，让 mock 输出接收到的歌曲 ID/标题，避免虚拟列表、收藏和歌单 IPC 干扰本页测试。

至少覆盖：

1. `songs:getAll` 返回后，菜单触发器显示 `专辑名 · 升序`，卡片 DOM 顺序符合名称升序。
2. 打开菜单选择“歌手”后，触发器显示 `歌手 · 升序`，卡片改为歌手顺序。
3. 重新打开菜单选择“降序”后更新方向；随后选择“专辑名”时继续保留降序。
4. 排序字段/方向变化只改变 renderer 中的卡片顺序，`songs:getAll` 始终只调用一次。
5. 点击一张专辑进入详情后，排序控件消失，mock SongList 收到的 songs 顺序与该分组源顺序一致。
6. 返回网格后保留进入详情前的排序字段、方向和卡片顺序。
7. 专辑数量仍来自未排序的 `albums.length`，不会随筛选或排序变化。
8. 空歌曲数组仍显示现有空状态，不因排序控件抛错。

卡片顺序可读取 `.albums__card-name` 的 DOM 顺序；不要仅用 `getByText` 判断“元素存在”。

### Step 2：确认测试先失败

Run：

```bash
npx vitest run tests/Albums.test.tsx
```

Expected：页面尚无排序控件和新顺序，测试失败。

### Step 3：实现页面接线

- import 改为 `useState`、`useEffect`、`useMemo`。
- 从 `../types` 导入 `Track`、`Album`、`SortOrder`；删除无用 `Playlist` 和局部 `AlbumGroup`。
- 导入专用 `AlbumSortMenu`，把 `sortBy`、`sortOrder` 和两个 setter 作为受控 props 传入。
- `albums` / `selectedAlbum` 使用公共 `Album` 类型。
- `loadAlbums` 只分组并 `setAlbums(Array.from(albumMap.values()))`，不再预排序。
- 增加：

```ts
const [sortBy, setSortBy] = useState<AlbumSortBy>('name')
const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
const sortedAlbums = useMemo(
  () => sortAlbums(albums, sortBy, sortOrder),
  [albums, sortBy, sortOrder],
)
```

- 网格 map 改用 `sortedAlbums`；空状态和总数仍基于 `albums`。
- header 右侧只渲染一枚菜单触发器和只读专辑总数，不再渲染三个常驻排序按钮。
- 不增加排序 effect，不创建第二份 `sortedAlbums` state。
- 不触碰 `selectedAlbum.songs`，详情继续把原数组传给 `SongList`。
- 同步修正文件头和 `albums` state 注释，删除“按歌曲数降序”的过期描述。

### Step 4：验证接线

Run：

```bash
npx vitest run tests/albumSort.test.ts tests/Albums.test.tsx
```

**完成标准：**

- [ ] 数据只加载一次，切换排序没有 IPC。
- [ ] 网格顺序变化，详情歌曲顺序不变。
- [ ] 返回网格保留组件内排序状态。
- [ ] 没有重复 Album 类型和无用 import。

---

## Task 3：实现整合式排序菜单与跨主题布局

**Objective:** 用一枚紧凑触发器承载四个排序选项，并提供完整的关闭、焦点和键盘行为。

**Files:**

- Create: `src/components/AlbumSortMenu.tsx`
- Modify: `src/pages/Albums.tsx`
- Modify: `src/styles/albums.css`
- Create test: `tests/AlbumSortMenu.test.tsx`
- Test: `tests/Albums.test.tsx`

### Step 1：先写菜单组件失败测试

`AlbumSortMenu.test.tsx` 至少覆盖：

1. 默认关闭，触发器显示 `专辑名 · 升序`，`aria-expanded=false`。
2. 点击、Enter、Space、ArrowDown 均可打开；打开后 `aria-expanded=true`，出现四个 `menuitemradio`。
3. 字段组中只有“专辑名”checked，方向组中只有“升序”checked。
4. 点击“歌手”只调用一次 `onSortByChange('artist')`，关闭菜单并把焦点还给触发器。
5. 点击“降序”只调用一次 `onSortOrderChange('desc')`，关闭并回焦。
6. rerender 新 props 后，触发器和两组 checked 状态同步更新；组件不能保留第二份排序 state。
7. Escape 和外部 pointerdown 关闭但不调用排序回调；Escape 需要回焦。
8. ArrowUp/ArrowDown/Home/End 在四项间移动焦点，越界时循环。
9. Tab 离开菜单时关闭但不 `preventDefault`，允许浏览器继续移动焦点。
10. unmount 后 document 监听被清理，不影响后续测试。

### Step 2：实现受控菜单组件

建议 props：

```ts
interface AlbumSortMenuProps {
  sortBy: AlbumSortBy
  sortOrder: SortOrder
  onSortByChange: (value: AlbumSortBy) => void
  onSortOrderChange: (value: SortOrder) => void
}
```

实现约束：

- 组件只持有 `isOpen`；排序值完全由 props 控制。
- 外层 `.album-sort-menu` 使用 `position: relative`，弹层绝对定位到触发器右下方，不使用鼠标坐标。
- 使用现有 `IconChevronDown`，打开时只旋转图标，不新增 SVG。
- 四个选项使用数据数组生成，保留固定 checkmark 列，选中变化时文字不横跳。
- 字段组选项：“专辑名”“歌手”；方向组选项：“升序”“降序”；中间使用 `role="separator"`。
- 选择项后先调用对应受控回调，再关闭并在下一帧/微任务安全回焦触发器。
- open effect 注册 `pointerdown` 和 `keydown`，cleanup 必须移除；不要采用现有 ContextMenu 的鼠标坐标 API。
- `ContextMenu.tsx` 不修改、不扩展。本功能不是右键菜单，也不应把领域选中态塞进通用菜单接口。

### Step 3：接入 header

```tsx
<div className="albums__header">
  <h2 className="albums__title">专辑</h2>
  <div className="albums__header-actions">
    <AlbumSortMenu
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSortByChange={setSortBy}
      onSortOrderChange={setSortOrder}
    />
    <span className="albums__total">{albums.length} 个专辑</span>
  </div>
</div>
```

详情分支不渲染 `AlbumSortMenu`。

### Step 4：实现样式

- `.albums__header` 保持左右布局但允许 `flex-wrap`，使用稳定 gap。
- `.albums__header-actions` 使用 `margin-left: auto`、`display: flex`、`align-items: center`。
- 触发器高度和内边距固定，文字用一行，不因四种组合改变尺寸；Chevron 保留独立固定列。
- 弹层设置稳定宽度、最多 6px 圆角、`box-shadow`、高于网格的 z-index，并右对齐触发器。
- 菜单项使用固定 checkmark 列、标签列和统一高度；hover 使用 `var(--control-hover)`，checked 使用 `var(--accent-subtle)`/`var(--accent)`。
- 分隔线使用 `var(--border-subtle)`；背景和文字使用 `--bg-*`、`--text-*` 现有 token。
- 触发器和菜单项都提供 `:focus-visible`；不能只靠圆点或颜色传达 checked。
- `prefers-reduced-motion: reduce` 下关闭 Chevron 和弹层过渡。
- header 换行后计数仍紧邻触发器；弹层不能被 `.albums__grid` 的 `overflow: auto` 裁切。
- 不修改专辑卡片、封面比例和网格列规则。

### Step 5：页面级断言

在 `tests/Albums.test.tsx` 断言：

- 可按名称查询排序菜单触发器，初始摘要正确。
- 通过菜单项改变字段/方向后，摘要和卡片顺序同步变化。
- 专辑总数位于触发器之外，且不是 button/menuitem。
- 进入详情后触发器和弹层都不存在。

### Step 6：构建验证

Run：

```bash
npx vitest run tests/AlbumSortMenu.test.tsx tests/Albums.test.tsx
npm run build
```

---

## Task 4：规格、全量门禁与开发记录

**Objective:** 让项目记忆与真实行为一致，并准备实施后独立复审。

**Files:**

- Modify: `SPEC.md`
- Create: `docs/devlog/devlog-20260711-album-sort.md`
- Do not modify: `harness/DECISIONS.md`（本功能没有新的跨模块架构决策）

### Step 1：更新 SPEC

在“专辑”章节记录：

- 网格默认按专辑名拼音/本地化字母序升序。
- 可切换按代表歌手排序和升降序。
- 四个排序选项收在单层弹出菜单中，触发器显示当前字段和方向；专辑总数保持只读文本。
- 当前字段的未知值始终最后。
- 排序只影响网格，不影响详情歌曲顺序。

同时注明当前既有边界：专辑仍按名称分组，代表歌手取分组中的第一首歌曲。

### Step 2：运行最终门禁

Run：

```bash
npm run verify
```

Expected：Harness checks、Electron 生产构建、全量 Vitest 全部通过，0 failed。

### Step 3：记录真实结果

Devlog 必须记录：

- 最终排序契约和 UI 结构。
- 实际修改/新增文件。
- 新增测试名称和数量。
- `npm run verify` 的真实输出摘要。
- 主人未完成的视觉测试写“待主人验证”，不能提前写成已通过。

---

## 整体验收标准

1. `npm run verify` 全绿，0 failed。
2. 专辑网格默认按专辑名拼音/本地化字母序升序。
3. 一枚排序触发器整合专辑名、代表歌手、升序和降序四个选项，并持续显示当前组合。
4. 升降序切换正确，`未知专辑` / `未知歌手` 在对应字段的两个方向都最后。
5. 同歌手专辑使用专辑名作为次级排序，不依赖偶然的数据库顺序。
6. `Album 2` 在升序中位于 `Album 10` 前。
7. 切换排序不会再次调用 `songs:getAll`，也不会修改原 albums/songs 数组。
8. 进入详情后排序控件隐藏，歌曲继续保持 `id DESC` 源顺序。
9. 返回网格时保留当前排序；离开专辑页面再进入时恢复默认。
10. 深色、浅色和窄内容区中，触发器、弹层和计数无重叠，checked/hover/focus 均可辨认。

## 手动视觉与交互测试（主人执行）

1. 深色和浅色主题分别进入专辑页，检查标题、排序触发器和总数对齐；打开菜单检查四项及分隔线。
2. 用中文、英文、数字开头的专辑名验证升序和降序。
3. 按歌手排序，检查同一歌手的多张专辑具有稳定次序。
4. 两个方向分别检查“未知专辑”和“未知歌手”在对应排序字段的末尾。
5. 反复打开菜单切换字段和方向，确认每次选择后菜单关闭、摘要更新，且没有重新加载或卡片数量变化。
6. 进入专辑详情，确认控件消失且歌曲顺序未变化；返回后排序状态保留。
7. 缩小主窗口到允许的最小尺寸，确认 header 可换行但不覆盖专辑网格。
8. 使用 Tab 聚焦触发器，验证 Enter/Space/ArrowDown 打开、方向键移动、Escape 关闭回焦和 Tab 正常离开。

## 实施后审查交接

实现完成后交给 Codex 独立审查，最小审查包包含：

- 本方案文件。
- `git status --short`。
- `git diff -- src/utils/albumSort.ts src/components/AlbumSortMenu.tsx src/pages/Albums.tsx src/styles/albums.css tests/albumSort.test.ts tests/AlbumSortMenu.test.tsx tests/Albums.test.tsx SPEC.md docs/devlog/devlog-20260711-album-sort.md`。
- `npm run verify` 输出摘要。
- 深浅主题截图和主人手动测试结果。
