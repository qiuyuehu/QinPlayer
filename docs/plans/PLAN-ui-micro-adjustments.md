# UI 微调方案：播放队列、歌单按钮与 Mini 菜单

> 状态：已完成 Codex 初审、方案完善和独立复审；等待用户确认后再交 Hermes 生成任务包。本文仅定义实施方案，不授权修改源码或自动提交。

## 一、初审结论

原方案方向基本正确，但不能直接进入实施，存在以下问题：

| 级别 | 问题 | 当前源码事实 | 本版处理 |
|---|---|---|---|
| P1 | “顶部边框改细”没有明确对象，并假设边框是 `2px` | `.queue-panel__header` 的下分隔线已经是 `1px solid var(--border)`；面板左边框和 footer 边框也是 `1px`，只有优先队列强调线是 `2px` | 明确只降低 header 下分隔线的对比度，改用 `var(--border-subtle)`；不动其他边框 |
| P1 | Mini 菜单窗口高度计算不完整 | 专用 shell 有上下各 `8px` padding，共享 `.context-menu` 还有上下 padding 和边框 | 明确菜单内容、shell 和窗口三层尺寸，窗口高度按 `条目数 × 30 + 26` 计算 |
| P1 | 漏掉 Mini 菜单关键回归测试 | `tests/contextMenuIPC.test.ts` 对 BrowserWindow 的宽高和屏幕夹取有精确断言 | 将 IPC 与 renderer 测试纳入必改范围，列出需要更新的期望值 |
| P1 | 把缩小窗口等同于“优化延迟” | 每次右键仍会新建、加载并等待一个 BrowserWindow；这才是主要延迟来源 | 本方案只承诺尺寸调整；以真实 Electron 测量为门禁，未测量不得宣称性能改善 |
| P2 | “播放全部”移动规则过于模糊 | 当前按钮有 loading、空列表及播放功能开关的禁用条件 | 保留处理函数和全部禁用语义，只改变 DOM 位置与样式 |
| P2 | 删除两个队列标签后缺少层级约束 | “接下来 N 首”仍负责标识优先队列，优先项还有底色和左侧强调线 | 明确保留这些语义，不新增替代卡片或标题 |
| P2 | 手动验收覆盖不足 | Mini 菜单受主题、系统字体、DPI 和屏幕边缘影响 | 增加双主题、最长文案、100%/150%/200% DPI 和四边夹取验证 |

## 二、目标

1. 将歌单详情页的“播放全部”移动到排序栏最右侧，并缩小为与排序按钮一致的控件尺寸。
2. 删除播放队列 header 中的歌曲总数，以及普通播放列表前的重复区段标题。
3. 降低播放队列 header 下分隔线的视觉重量，不改变其他边框和优先队列强调线。
4. 将 Mini 右键菜单内容宽度缩至 `160px`、行高缩至 `30px`，同时保持文案完整和窗口边缘夹取正确。
5. 对 Mini 菜单打开延迟进行真实 Electron 测量；只记录结果，不用尺寸变化冒充性能优化。

## 三、Non-goals

- 不修改 `playerStore.ts`、`useAudioSync.ts` 或播放顺序、插播、移除逻辑。
- 不修改“播放全部”的业务行为、请求令牌、loading 保护和功能开关。
- 不增删或重命名右键菜单 action，不改变 action enabled 规则。
- 不改变 Mini 菜单的 sender/payload 校验、ready 握手、超时、fallback、单次 settle 和窗口销毁协议。
- 不在本方案中预热、缓存或复用 BrowserWindow。
- 不新增 IPC push 通道、依赖、数据库字段或持久化状态。
- 不顺带重构其他页面、队列结构或主题系统。
- 不自动提交。

## 四、当前实现基线

实施前先以当前工作树为准复核，禁止按旧行号盲改：

### 4.1 歌单详情

- `src/pages/Playlists.tsx` 中“播放全部”当前位于 detail header 右侧。
- `handlePlayAll()` 负责设置播放列表并播放首曲。
- 按钮的 disabled 条件包含歌曲加载中、歌曲为空和播放功能不可用。
- `.playlists__sort` 已是 flex 排序栏；`.playlists__sort-btn` 是目标尺寸基准。

### 4.2 播放队列

- `src/components/PlaylistPanel.tsx` 的 header 显示“播放队列”和 `{playlist.length} 首`。
- 普通队列前另有“播放列表”区段标题。
- 优先队列仍有“接下来 N 首”、背景色和 `2px` 左侧强调线。
- `.queue-panel__header` 下分隔线已经是 `1px solid var(--border)`。

### 4.3 Mini 菜单

- `src/styles/mini-context-menu.css` 当前菜单内容宽度为 `180px`，shell padding 为 `8px`。
- 共享 `src/styles/contextmenu.css` 为菜单提供上下 padding、边框及 item padding。
- `electron/ipc/contextMenu.ts` 当前使用固定窗口宽度、单项高度和附加高度计算 BrowserWindow 尺寸。
- 每次 `context-menu:show-track` 都会创建并加载专用 BrowserWindow；尺寸缩小不会消除这段生命周期成本。

## 五、设计与行为契约

### 5.1 歌单“播放全部”并入排序栏

修改 `src/pages/Playlists.tsx`：

1. 从 `.playlists__header--detail` 中移出“播放全部”。
2. 将按钮放到 `.playlists__sort` 的最后一个子项，位于排序方式、排序字段和升降序控件之后。
3. 使用组合 class：

```tsx
className="playlists__sort-btn playlists__play-all"
```

4. 原样保留以下内容：
   - `handlePlayAll`；
   - `IconPlay`；
   - 按钮文字；
   - disabled 表达式；
   - loading、空列表和功能开关行为。

修改 `src/styles/playlists.css`：

1. 从 header 大按钮的公共 selector 中移除 `.playlists__play-all`，避免继续继承 `6px 14px`、`13px` 的尺寸。
2. 让组合 class 继承 `.playlists__sort-btn` 的 padding、字号、圆角和交互状态。
3. `.playlists__play-all` 只保留必要差异：
   - `margin-left: auto`；
   - `display: inline-flex`；
   - 图标与文字垂直居中；
   - 稳定的图标尺寸和间距；
   - `flex-shrink: 0`。
4. 排序栏保持单行；按钮文字不得挤压、换行或遮挡相邻控件。

验收契约：

- 按钮是 `.playlists__sort` 的后代，不再是 detail header 的后代。
- 它与排序按钮同高、同字号、同圆角，位于排序栏最右侧。
- 空歌单、加载中或播放功能关闭时仍不可点击。
- 可用时点击仍只执行既有 `handlePlayAll()` 行为。

### 5.2 精简播放队列标签

修改 `src/components/PlaylistPanel.tsx`：

1. 删除 header 中的 `.queue-panel__count`。
2. 删除普通队列前仅包含“播放列表”的 `.queue-panel__section`。
3. 保留：
   - header 的“播放队列”；
   - 优先队列的“接下来 N 首”；
   - 空状态；
   - 所有歌曲行、封面、时长和菜单行为；
   - 优先队列背景及左侧 `2px` 强调线。
4. 不用新 badge、卡片或副标题替代被删文字。

修改 `src/styles/playlist-panel.css`：

- 删除只服务于已移除节点且确认无其他引用的 `.queue-panel__count` 样式。
- 若 `.queue-panel__section` 没有其他渲染来源，可清理其死样式；不得借机改动队列行布局。

测试断言必须基于结构而非全局搜索“首”字：优先队列本来就会显示“接下来 N 首”。

验收契约：

- header 仍显示“播放队列”，但不再含 `.queue-panel__count`。
- 普通播放列表不再出现独立的“播放列表”区段标题。
- 有优先歌曲时仍显示“接下来 N 首”。
- 空状态和队列交互测试保持通过。

### 5.3 降低 header 分隔线重量

只修改以下 selector：

```css
.queue-panel__header {
  border-bottom: 1px solid var(--border-subtle);
}
```

说明：当前物理宽度已经是浏览器可稳定渲染的 `1px`，因此本次通过降低颜色对比度实现“更细”的感受。

明确不改：

- `.queue-panel` 的左边框；
- `.queue-panel__footer` 的上边框；
- 优先队列的 `2px` 左侧强调线；
- header 高度和 padding。

### 5.4 Mini 菜单紧凑尺寸

#### CSS 几何

修改 `src/styles/mini-context-menu.css`：

```css
.mini-context-menu {
  width: 160px;
  min-width: 160px;
}

.mini-context-menu .context-menu__item {
  height: 30px;
  min-height: 30px;
  padding: 6px 12px;
  font-size: 12px;
  line-height: 18px;
  box-sizing: border-box;
}
```

- shell padding 保持 `8px`。
- 共享 `.context-menu` 的上下 `4px` padding 和 `1px` 边框保持不变。
- 不通过 `overflow: hidden` 掩盖文案溢出。
- disabled、hover、focus、危险操作颜色和双主题变量保持共享菜单语义。

#### BrowserWindow 几何

修改 `electron/ipc/contextMenu.ts`：

```ts
const MENU_WINDOW_WIDTH = 176
const MENU_ITEM_HEIGHT = 30
const MENU_WINDOW_CHROME_HEIGHT = 26
```

高度公式：

```ts
const height = entries.length * MENU_ITEM_HEIGHT + MENU_WINDOW_CHROME_HEIGHT
```

其中 `26px` 的来源必须留在常量旁的简短注释中：shell 上下 padding `16px` + 菜单上下 padding `8px` + 上下边框 `2px`。

屏幕夹取继续使用既有 `MENU_WINDOW_GUTTER = 4`。不得更改 BrowserWindow 安全配置、父窗口关系、ready timeout 或 fallback。

#### 精确测试值

更新 `tests/contextMenuIPC.test.ts` 中所有依赖尺寸的断言：

- 6 个条目：`width = 176`，`height = 206`。
- 1 个条目：`height = 56`。
- 若 workArea 为 `{ x: 10, y: 20, width: 300, height: 260 }` 且锚点远超右下边界，夹取结果应为 `x = 130`、`y = 220`。
- 其他条目数必须使用同一公式计算，不允许只改一个 fixture 使测试偶然通过。

更新 `tests/MiniContextMenu.test.tsx`：

- 保留 enabled/disabled、点击和 Escape 关闭测试。
- fixture 至少包含最长现有文案“从播放列表移除”或“打开文件所在目录”，确认完整渲染。
- CSS 文案是否被裁切由真实 Electron 手动验收，不能依赖 jsdom 的布局结果。

### 5.5 延迟测量门禁

本方案不承诺 Mini 菜单延迟改善。Executor 在真实 Electron 可用时记录：

1. 从主进程收到 `context-menu:show-track` 到子窗口 ready 后执行 `show()` 的耗时。
2. 单独记录首次冷启动。
3. 连续打开 10 次，报告后续打开的中位数和 p95。
4. 临时测量日志不得留在最终 diff 中。

判定规则：

- 未执行真实 Electron 测量时，结果必须写“未测量”，不得写“已优化延迟”。
- 后续打开 p95 不高于 `100ms` 且主观无明显停顿时，本任务只记录数据并结束。
- 若 p95 高于 `100ms` 或用户仍能感知延迟，另建 `PLAN-mini-menu-latency.md`，评估窗口预热/复用。
- 后续方案必须单独处理 request id、重复 ready、防旧响应、owner 销毁、并发 pending、内存常驻和 fallback 测试；不得塞回本次微调。

## 六、文件范围

### 允许修改

| 文件 | 目的 |
|---|---|
| `src/pages/Playlists.tsx` | 移动“播放全部”按钮 |
| `src/styles/playlists.css` | 统一按钮尺寸和对齐 |
| `tests/Playlists.test.tsx` | 锁定 DOM 位置、disabled 和播放行为 |
| `src/components/PlaylistPanel.tsx` | 删除 count 和普通队列区段标题 |
| `src/styles/playlist-panel.css` | 清理死样式并降低 header 分隔线对比度 |
| `tests/PlaylistPanel.test.tsx` | 锁定标签删除和优先队列语义 |
| `src/styles/mini-context-menu.css` | 缩小菜单内容与条目尺寸 |
| `electron/ipc/contextMenu.ts` | 同步窗口尺寸公式 |
| `tests/contextMenuIPC.test.ts` | 更新窗口几何和屏幕夹取断言 |
| `tests/MiniContextMenu.test.tsx` | 保持菜单交互并覆盖最长文案 |
| `docs/devlog/devlog-YYYYMMDD-ui-micro-adjustments.md` | 记录实施、验证与延迟测量状态 |

### 明确禁止修改

- `src/stores/playerStore.ts`
- `src/hooks/useAudioSync.ts`
- `src/hooks/useNativeTrackContextMenu.ts`
- preload、IPC 类型和 Mini 菜单协议文件
- 数据库、依赖和构建配置

如实施中发现必须越界，立即停下并回到 Reviewer，不得自行扩大任务包。

## 七、实施顺序与门禁

### Task A：歌单按钮

1. 先补 DOM 位置和 disabled 回归测试。
2. 移动 JSX，调整组合 class CSS。
3. 运行 `tests/Playlists.test.tsx`。

门禁：测试必须证明业务 handler 和禁用条件未变。

### Task B：队列标签与分隔线

1. 先补 header count、普通区段标题和优先区段语义测试。
2. 删除两个节点，清理确认无引用的 CSS。
3. 只修改 header 下分隔线颜色变量。
4. 运行 `tests/PlaylistPanel.test.tsx`。

门禁：不得误删“接下来 N 首”，不得改变优先队列强调线。

### Task C：Mini 菜单尺寸

1. 先更新 IPC 几何测试，确认旧常量下测试失败。
2. 更新 CSS 和主进程常量及公式。
3. 更新 renderer 最长文案 fixture。
4. 运行 Mini 菜单两个定向测试文件。

门禁：精确宽高、右下夹取、fallback、安全选项及交互测试全部通过。

### Task D：整体验证和记录

1. 执行全量自动验证。
2. 在深色、浅色主题中完成真实 Electron 手测。
3. 可用时记录延迟数据；不可用时明确记录未测量。
4. 写 devlog，列出实际修改、验证证据和未验证项。
5. 不自动 commit。

## 八、自动验证

```bash
npx vitest run tests/Playlists.test.tsx tests/PlaylistPanel.test.tsx tests/MiniContextMenu.test.tsx tests/contextMenuIPC.test.ts
npx tsc --noEmit
node harness/checks.js
npm run build
npm test
git diff --check
```

`npm run verify` 可作为项目统一入口补跑，但不能替代上述定向测试结果的核对。

## 九、真实 Electron 验收

### 歌单详情

- “播放全部”位于排序栏最右侧，与三个排序控件同高且基线一致。
- 窄到应用允许的最小窗口宽度时不换行、不重叠、不截断。
- loading、空歌单和功能关闭状态仍正确禁用。

### 播放队列

- header 仅保留“播放队列”，不显示总歌曲数。
- 普通列表前不再显示“播放列表”。
- 有优先歌曲时仍显示“接下来 N 首”，底色和左侧强调线清晰。
- header 下分隔线比原来更轻，但 footer、面板边界和优先强调线未变。

### Mini 菜单

- 深色和浅色主题各检查一次。
- 100%、150%、200% DPI 各检查最长文案，不能裁切、换行或溢出。
- 在窗口左、右、上、下边缘分别打开，菜单完整位于 workArea 内。
- enabled、disabled、Escape、点击 action 和点击外部关闭行为保持正常。
- 快速连续右键至少 10 次，无残留窗口、重复 action 或未处理异常。
- 记录冷启动、后续中位数和 p95；不能执行时写明原因。

## 十、风险与回滚

| 风险 | 控制 | 回滚单元 |
|---|---|---|
| 排序栏在窄宽度下拥挤 | 按钮右对齐、禁止收缩并做最小窗口手测 | 单独回滚 Playlists JSX/CSS/tests |
| 删除标签削弱队列分层 | 保留“接下来 N 首”、背景和强调线 | 单独恢复两个文本节点及样式 |
| 菜单窗口与 CSS 内容尺寸不一致 | 使用明确的 `160/176/30/26` 几何并锁定 IPC 断言 | 单独回滚 Mini CSS、常量和测试 |
| 最长文案在高 DPI 下裁切 | 双主题、三档 DPI 真实 Electron 验证 | 调整内容宽度并同步窗口宽度测试 |
| 延迟没有改善 | 不作未经测量的承诺，失败时拆独立性能方案 | 本任务无需回滚视觉调整 |

回滚必须按上述功能单元进行，不使用整仓恢复，不覆盖工作树中与本任务无关的已有改动。

## 十一、独立视角复审

复审假设：Reviewer 未参与前述完善，只按当前源码契约、失败模式和可验证性重新检查。

| 检查项 | 独立结论 |
|---|---|
| 范围是否足够小 | 通过。视觉 DOM/CSS 与对应测试受控；窗口复用明确拆出 |
| 播放行为是否可能被误改 | 通过。handler、disabled 条件和状态逻辑被列为硬约束并有测试门禁 |
| 队列语义是否被过度删除 | 通过。只删除重复标签，优先队列标签和视觉强调保留 |
| “顶部边框”是否仍有歧义 | 通过。已锁定 `.queue-panel__header` 的 `border-bottom`，并明确不改其他边框 |
| Mini 几何是否闭合 | 通过。内容宽 `160px`、窗口宽 `176px`、行高 `30px`、垂直附加高度 `26px` 可相互推导 |
| 屏幕夹取是否覆盖 | 通过。IPC 精确断言与四边真实窗口手测同时覆盖 |
| 文案完整性是否可验证 | 通过。renderer fixture 防止文案遗漏，真实 Electron 负责布局裁切验证 |
| 延迟目标是否被虚假解决 | 通过。计划明确只测量，不把缩小尺寸写成性能成果 |
| 验证和回滚是否完整 | 通过。定向、Harness、构建、全量测试、真实 Electron 和按功能单元回滚均已定义 |

**独立复审结论：通过，可交用户确认。**

唯一保留项：Mini 菜单延迟仍可能存在，这是本方案有意保留的测量结果，不是遗漏。只有数据或用户体验触发阈值后，才进入独立的窗口生命周期优化方案。
