# QinPlayer UI 修复批次方案（复审完善版）

> 状态：Codex Reviewer 已完成初审、方案重写与独立复审。主人确认后，Hermes Agent 再生成 Executor 任务包；本文件本身不授权修改源码、commit、push、打包或发布。

## 1. 初审结论

原方案的六个产品目标可以保留，但不能直接交给 Executor。主要问题如下。

| 级别 | 初审发现 | 当前源码证据 | 本版处理 |
|---|---|---|---|
| P1 | 透明 `BrowserWindow` 没有可加载的独立 renderer 入口；“data URL 或 file://”无法指导实现，也无法直接复用 React 组件和主题 CSS | `electron.vite.config.ts` 目前只有 `index.html` renderer 入口 | 固定为 electron-vite 多页面入口 `mini-context-menu.html`，配套独立 React entry 和最小权限 preload |
| P1 | 新增 `context-menu:close` 未约束 sender、action、disabled 项和单次 settle，任意 renderer 都可能伪造结果 | 当前 `electron/ipc/contextMenu.ts` 对主窗口 sender、payload、pending、settled 都有防护 | 保留现有外部 `show-track` 契约思想；新增菜单窗口内部 invoke 必须只接受当前子窗口 sender，并再次校验原始 enabled action |
| P1 | 删除 `useNativeTrackContextMenu` 并让 `MiniQueueView` 直接处理 IPC，会丢失捕获 track、并发 pending、request token 和卸载后忽略结果的现有保障 | `src/hooks/useNativeTrackContextMenu.ts` 已集中处理这些边界 | 保留 Hook 作为 renderer 控制层，改名为 `useMiniTrackContextMenu`；只替换主进程显示载体 |
| P1 | “禁止 Mini 拉伸”写错文件，而且没有规定退出 Mini 后恢复 `resizable` | Mini 切换实际在 `electron/ipc/window.ts:185` | 进入 Mini 前后成对调用 `setResizable(false/true)`，并新增窗口 IPC 测试 |
| P1 | “播放全部”没有说明复用哪条播放入口，也没有处理歌单请求期间残留的旧 `songs` | `SongList` 的手动播放契约是 `setPlaylist(tracks)` 后 `playTrack(track)` | 使用同一契约；增加加载态和请求 token，加载中/空列表/playback=false 时禁用 |
| P2 | “改进视觉层次”没有 DOM、尺寸、状态和主题验收标准 | priority 行已有 `queue-panel__item-main` / `queue-panel__remove`，但 CSS 没有对应规则 | 明确 priority 行结构、封面、文字截断、删除按钮、区段标题和双主题状态 |
| P2 | “使用 Icons.heart”与源码不符，且当前收藏交互使用星标而不是心形 | `Icons.tsx` 只有 `IconStar`；`SongList` 和 `Sidebar` 都使用星标 | 复用 `IconStar`，删除 emoji，并把提示改为“点击歌曲旁的星标收藏” |
| P2 | “检查其他页面并一并更新”会无边界扩大范围 | 其他页面空状态不属于本次明确问题 | 只改 `Liked`；其他页面保持不动 |
| P2 | 当前决策记录明确写着 Mini 使用原生菜单，原方案没有安排决策替代 | `harness/DECISIONS.md` 2026-07-13 条目 | 实施验证通过后由 Hermes Agent 追加替代决策，并更新 `SPEC.md` 与 devlog |

**初审门结论：原方案不通过；按下述版本替换后再审。**

## 2. 最终目标

1. Mini 队列右键菜单可越过 `400x150` 主窗口边界，并与当前浅色/深色主题一致。
2. 主窗口播放队列中的 priority 区域具备完整歌曲信息和明确但克制的视觉区分。
3. source 区段标题只显示“播放列表”，不重复显示数量；顶部总数继续保留。
4. “我喜欢的”空状态不再出现 emoji，改用项目既有星标图标语言。
5. 歌单详情右上角提供“播放全部”，播放当前已加载排序下的完整歌单。
6. Mini 模式固定 `400x150`、不可由用户拉伸；退出后主窗口恢复可拉伸和原有 bounds 恢复逻辑。

## 3. 当前源码事实与设计决定

| 主题 | 当前事实 | 本次决定 |
|---|---|---|
| Mini 菜单 | `useNativeTrackContextMenu` 捕获目标并调用 `context-menu:show-track`；主进程使用 Electron `Menu` | 保留 renderer Hook 和外部 invoke 形状，主进程优先创建主题化子窗口；创建/加载失败才回退原生 `Menu` |
| Mini 壳层 | Mini 和主界面共用同一个 `mainWindow`，只切换到固定 `400x150` | 菜单窗口是短生命周期子窗口，不创建第二套播放器或状态树 |
| 主题 | 主 renderer 把解析后的主题写到 `html[data-theme]` | Hook 在右键瞬间传递解析后的 `dark | light`；菜单窗口只使用本次快照，菜单存活期间不做主题热更新 |
| 播放队列 | priority 和 source 都在 `PlaylistPanel`；priority DOM 缺少专用 CSS | priority 复用 source 的封面、标题、歌手、时长信息层级，但用区段背景/左侧强调线区分，不制作嵌套卡片 |
| 收藏语义 | 收藏按钮和导航均使用 `IconStar` | 空状态继续使用 `IconStar`，不新增 heart 图标 |
| 歌单播放 | `SongList` 通过 `setPlaylist(tracks)` + `playTrack(track)` 开始手动播放 | “播放全部”调用 `setPlaylist(songs)` 后 `playTrack(songs[0])`，不增加新的 store action |
| Mini 尺寸 | `electron/ipc/window.ts` 负责进入/退出 Mini 和 bounds 恢复 | 只在该模块增加成对的 resizable 控制，不修改 window persistence 数据结构 |

## 4. Non-goals

- 不修改 `playerStore`、`useAudioSync`、priority/detached 状态机或自然结束逻辑。
- 不改变 `insertNext`、source remove、priority remove 的语义。
- 不改变数据库、歌单 IPC、扫描、文件系统或持久化 schema。
- 不改变主窗口 `ContextMenu` 的实现和视觉。
- 不给透明菜单窗口暴露主应用完整 `electronAPI`。
- 不新增 npm 依赖。
- 不统一重做 LocalMusic、Albums、RecentlyPlayed、Search 等其他页面空状态。
- 不修改普通窗口默认尺寸和可拉伸行为。
- 不自动 commit、push、package 或 release。

## 5. 行为契约

### 5.1 Mini 主题菜单

#### 外部调用

主 renderer 仍只调用一个公开 invoke：

```ts
'context-menu:show-track': {
  args: {
    entries: NativeTrackMenuEntry[]
    theme: 'dark' | 'light'
    reducedMotion: boolean
  }
  return: NativeTrackMenuAction | null
}
```

- source/priority entries、disabled 规则、捕获 track、单 pending 和 request token 继续由 Hook 负责。
- Hook 改名为 `useMiniTrackContextMenu`，但不把业务动作搬进 `MiniQueueView`。
- `theme` 从右键瞬间的 `document.documentElement.dataset.theme` 读取；非法或缺失时按 `dark` 处理。
- `reducedMotion` 从同一时刻的 `document.documentElement.dataset.reducedMotion === 'true'` 取得，使独立 renderer 继承主应用手动减少动画偏好；系统偏好继续由 CSS media query 处理。

#### 独立 renderer

固定使用以下结构，不使用 data URL，不把 React 组件塞进主窗口 DOM：

```text
mini-context-menu.html
  -> src/miniContextMenu.tsx
      -> src/components/MiniContextMenu.tsx
      -> src/styles/mini-context-menu.css
```

`electron.vite.config.ts`：

- renderer input 增加 `miniContextMenu: resolve(__dirname, 'mini-context-menu.html')`。
- preload input 增加 `contextMenu: resolve(__dirname, 'electron/contextMenuPreload.ts')`。
- 生产环境从 `out/renderer/mini-context-menu.html` 加载；开发环境从 `ELECTRON_RENDERER_URL/mini-context-menu.html` 加载。

菜单 HTML 使用独立 CSP，只允许自身脚本/样式；不使用 `unsafe-eval`、远程资源或内联可执行脚本。

#### 子窗口配置

```ts
{
  parent: currentWindow,
  show: false,
  width: 196,
  height: entries.length * 34 + 16,
  transparent: true,
  frame: false,
  resizable: false,
  movable: false,
  minimizable: false,
  maximizable: false,
  skipTaskbar: true,
  backgroundColor: '#00000000',
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload: dedicatedContextMenuPreload,
  }
}
```

- 不使用无 parent 的全局 always-on-top 窗口；子窗口只需稳定高于当前主窗口。
- 主进程使用 `screen.getCursorScreenPoint()` 取得锚点，并以 `screen.getDisplayNearestPoint(anchor).workArea` 把窗口限制在当前显示器工作区内，四边至少保留 4px。
- 菜单内容外围保留 8px 透明空间，避免 CSS 阴影被窗口边界裁切。
- 子 renderer 完成初始化、应用主题并渲染后发送 ready；主进程收到当前子窗口的合法 ready 后才 `show()`/`focus()`，避免闪白。

#### 内部最小权限协议

专用 preload 只暴露 `window.contextMenuAPI`：

```ts
interface NativeTrackMenuDisplayEntry extends NativeTrackMenuEntry {
  label: string
}

interface NativeTrackMenuWindowInit {
  entries: NativeTrackMenuDisplayEntry[]
  theme: 'dark' | 'light'
  reducedMotion: boolean
}

interface ContextMenuWindowAPI {
  getInit: () => Promise<NativeTrackMenuWindowInit | null>
  ready: () => Promise<void>
  resolve: (action: NativeTrackMenuAction | null) => Promise<void>
}
```

对应内部 invoke：

```text
context-menu:window-get-init
context-menu:window-ready
context-menu:window-resolve
```

这些通道写入 `src/types/ipc.ts` 以满足项目强类型约束，但不得加入主应用 `electron/preload.ts` 的白名单。只有 `electron/contextMenuPreload.ts` 可以调用它们。

主进程必须满足：

1. `show-track` 只接受当前 `mainWindow.webContents`。
2. entries 继续校验对象、长度 1..8、action 白名单、enabled boolean、action 不重复；theme 只接受 `dark | light`，reducedMotion 必须是 boolean。
3. 内部三个通道只接受当前菜单子窗口的 `webContents`，其他 sender 返回 null/void 并记录警告。
4. `window-resolve` 的非 null action 必须存在于本次原始 entries 且 `enabled === true`；不能只依赖 TypeScript。
5. 单 pending、单 active child、单 settle；第二次快速右键返回 null，不替换第一菜单的目标。
6. `getInit` 只返回主进程根据固定 `ACTION_LABELS` 生成的 display entries；主 renderer 不能传 label，子 renderer 不能自行扩展 action。
7. 从开始加载子窗口起设置 2000ms 初始化超时；超时、click、Escape、blur、child closed、parent destroyed、render-process-gone、load failure 都必须收敛 Promise 并释放引用。
8. blur 监听只在子窗口显示后启用，避免隐藏初始化阶段立即误取消。
9. `settle()` 幂等；先清 pending/active refs，再安全销毁 child，最后 resolve。
10. 创建失败、加载失败或 2000ms 内未 ready 时，使用现有 Electron `Menu` 逻辑降级；用户主动取消、Escape 或 blur 不触发降级。
11. 原生降级仍使用固定中文 label、enabled、owner window、settled guard。

#### 菜单交互与视觉

- 文案和顺序保持当前 action 映射，不新增业务动作。
- 每行固定 34px；菜单本体宽 180px、圆角 8px、1px border、项目现有阴影。
- hover 使用 `var(--accent)` 和 `var(--text-on-accent)`；disabled 不响应 hover/click。
- 支持鼠标点击和 Escape 关闭；不要求本批新增方向键菜单导航。
- `mini-context-menu.css` 直接导入现有 `themes.css`、`contextmenu.css`、`motion.css`，组件复用 `.context-menu` / `.context-menu__item` class；专用 CSS 只覆盖透明 `html/body/#root`、外层阴影留白及菜单本体的 relative/固定宽度，不复制一套菜单颜色和 hover 规则，也不导入整个 `global.css`。

### 5.2 播放队列 priority 区域

`PlaylistPanel` 的 priority 行改为完整双按钮结构：

- 外层 `div.queue-panel__item.queue-panel__item--priority` 负责行背景和右键。
- 主按钮 `queue-panel__item-main` 显示 36x36 封面/占位、标题、歌手、时长；文字单行省略。
- 尾部删除按钮固定 28x28，只显示 `IconClose`，保留 tooltip“从接下来移除”。
- 第一项就是实际下一首，不另做会改变布局的 badge；顺序由当前列表位置表达。
- priority 区使用轻微 `var(--bg-secondary)` 背景和 2px accent 左线；source 行保持现状。
- hover、active、disabled、浅色、深色、reduced-motion 都不得改变行高或造成横向溢出。

区段标题固定为：

```text
接下来 N 首
播放列表
```

顶部 header 的 `{playlist.length} 首` 保留，因此 source 区段不再重复数量。

### 5.3 “我喜欢的”空状态

- 在空状态上方渲染既有 `IconStar`，class 为 `liked-page__empty-icon`。
- 文案固定为：

```text
还没有收藏歌曲
点击歌曲旁的星标收藏
```

- 删除 emoji；不新建 `IconHeart`，不扫描和修改其他页面。
- 图标为装饰性视觉，文本承担完整语义；颜色来自现有 token。

### 5.4 歌单“播放全部”

- 只在歌单详情 header 右侧显示 icon + text 按钮“播放全部”，使用 `IconPlay`。
- header 重组为左侧返回/标题/数量和右侧 action，不使用绝对定位。
- 增加 `songsLoading` 和单调 request token：只有最新的 `playlists:getSongs` 响应可以写入 `songs` 并结束 loading。
- 进入一个歌单前清空旧 `songs`；返回列表或切换选择时使旧请求 token 失效。
- 按钮在 `songsLoading`、`songs.length === 0` 或 `featureFlags.playback === false` 时 disabled。
- 合法点击严格执行：

```ts
setPlaylist(songs)
playTrack(songs[0])
```

- 使用当前后端返回的排序数组，不重新排序、不新增“随机播放”、不新增 store action。
- 点击一次只记录首曲的一组 `recordPlay` / `updatePlayCount`，其余歌曲只是进入 source playlist。

### 5.5 Mini 禁止拉伸

只修改 `electron/ipc/window.ts` 的 `window:set-mini-mode`：

- 进入 Mini：在隐藏/设置 `400x150` 前调用 `mainWindow.setResizable(false)`。
- 退出 Mini：先调用 `mainWindow.setResizable(true)`，再执行现有 minimum size、saved bounds/default size、show、maximize 恢复流程。
- 重复收到相同模式消息必须保持幂等，不改变正常窗口持久化规则。
- 不在 `electron/main.ts` 硬编码永久 `resizable: false`。

## 6. 文件范围

### 6.1 Menu 窗口

| 操作 | 文件 | 内容 |
|---|---|---|
| Modify | `electron/ipc/contextMenu.ts` | 子窗口生命周期、协议校验、定位、原生 fallback、统一 settle |
| Create | `electron/contextMenuPreload.ts` | 只暴露 getInit/ready/resolve |
| Modify | `electron.vite.config.ts` | 增加 renderer/preload 多入口 |
| Create | `mini-context-menu.html` | 独立 CSP 和挂载点 |
| Create | `src/miniContextMenu.tsx` | 独立 React 入口 |
| Create | `src/components/MiniContextMenu.tsx` | 主题菜单 UI、disabled、Escape、选择 |
| Create | `src/styles/mini-context-menu.css` | token 导入、透明页面和菜单样式 |
| Modify | `src/types/ipc.ts` | show payload、init 类型、内部 invoke 类型 |
| Modify | `src/types/electron.d.ts` | `contextMenuAPI` 类型 |
| Rename/Modify | `src/hooks/useNativeTrackContextMenu.ts` -> `src/hooks/useMiniTrackContextMenu.ts` | 保留捕获目标/pending/token，增加 theme 快照 |
| Modify | `src/components/MiniQueueView.tsx` | 只更新 Hook import/调用名，不接管 IPC 状态机 |
| Modify | `tests/contextMenuIPC.test.ts` | 子窗口、校验、生命周期、fallback |
| Rename/Modify | `tests/useNativeTrackContextMenu.test.tsx` -> `tests/useMiniTrackContextMenu.test.tsx` | 保留旧并发/陈旧响应测试并增加 theme |
| Create | `tests/MiniContextMenu.test.tsx` | 菜单 renderer 行为 |
| Modify | `tests/MiniQueueView.test.tsx` | 更新语义断言，确认主窗口内仍不渲染 HTML menu |

### 6.2 其余 UI

| 操作 | 文件 | 内容 |
|---|---|---|
| Modify | `src/components/PlaylistPanel.tsx` | priority 完整行、source 标题去重 |
| Modify | `src/styles/playlist-panel.css` | priority/section/item-main/remove 样式 |
| Modify | `tests/PlaylistPanel.test.tsx` | DOM、文案和交互回归 |
| Modify | `src/pages/Liked.tsx` | IconStar 空状态和无 emoji 文案 |
| Modify | `src/styles/recent-liked.css` | 空状态图标样式 |
| Modify | `tests/Liked.test.tsx` | 图标和文案 |
| Modify | `src/pages/Playlists.tsx` | 播放全部、加载 token、旧快照清理 |
| Modify | `src/styles/playlists.css` | 详情 header/action/disabled 样式 |
| Modify | `tests/Playlists.test.tsx` | 播放、加载、空列表和 flag |
| Modify | `electron/ipc/window.ts` | Mini setResizable false/true |
| Create | `tests/windowIPC.test.ts` | 进入/退出 Mini 的窗口调用契约 |

### 6.3 明确禁止修改

- `src/stores/playerStore.ts`
- `src/hooks/useAudioSync.ts`
- `src/utils/AudioEngine.ts`
- `electron/db/**`
- `electron/ipc/playlists.ts`
- 主窗口 `src/components/ContextMenu.tsx` 与 `src/styles/contextmenu.css`
- 与本批无关的页面、设计预览、依赖和构建发布配置

## 7. 执行批次与完成门

| 批次 | 工作 | 完成门 |
|---|---|---|
| A | 先写菜单 IPC/renderer 失败测试；补共享类型、独立 HTML、renderer entry、专用 preload 和 Vite 多入口 | 类型检查通过；菜单组件测试转绿；生产 build 产出两个 renderer HTML 和两个 preload entry |
| B | 重构 `contextMenu.ts` 为主题子窗口 + 原生 fallback；保留/改名 renderer Hook | IPC sender/payload/action/pending/settle/load-failure 测试转绿；Hook 旧目标/卸载/并发测试保留 |
| C | PlaylistPanel priority 行与 source 标题；Liked 空状态 | 对应组件测试转绿；不触及播放状态机 |
| D | Playlists 播放全部、加载 token 和 UI | Playlists 测试覆盖最新请求、disabled 与一次播放记账 |
| E | Mini setResizable 成对恢复 | `tests/windowIPC.test.ts` 转绿；saved bounds 两条分支不退化 |
| F | 定向测试、类型、Harness、生产 build、全量测试、diff 检查和真实 Electron smoke | 所有自动门禁 0 failed；主人完成双主题和窗口交互验收 |

任何批次失败都在该批次修复，不带红灯进入下一批；不得通过删除旧测试或放宽断言获得绿色结果。

## 8. 自动测试矩阵

### 8.1 菜单主进程

`tests/contextMenuIPC.test.ts` 至少覆盖：

1. 合法主窗口 sender 创建唯一 child，parent/webPreferences/透明/不可拉伸配置正确。
2. 非主窗口 sender、非法 entries、重复 action、非法 enabled、非法 theme 被拒绝。
3. 子窗口 getInit/ready/resolve 只接受 active child sender。
4. disabled action 或不在本次 entries 的 action 不能完成选择。
5. click、null、blur、closed、parent destroyed、render-process-gone 都单次 settle 并释放 pending。
6. 第二次 show 在 pending 时返回 null，不创建第二个 child。
7. 子窗口创建/加载/ready 前失败进入原生 fallback；fallback build/popup 抛错仍返回 null。
8. workArea 四个边缘位置都被 clamp，窗口不越出当前显示器。
9. settle 后允许再次打开，旧 child 的迟到事件不能完成新请求。
10. 主 preload 仍只暴露 `context-menu:show-track`；内部通道只存在于 dedicated preload。

### 8.2 菜单 renderer 与 Hook

1. dark/light init 正确设置 `data-theme`，reducedMotion 快照正确设置 `data-reduced-motion`。
2. entry 顺序、label、disabled class 与 click 行为正确。
3. disabled 不调用 resolve；Escape 调用 `resolve(null)`。
4. ready 只在 init 和首轮 render 后调用一次。
5. Hook 继续覆盖 source/priority action 集、当前曲 disabled、捕获目标、第二请求、null、unknown、reject、unmount。
6. Hook payload 增加当前解析主题和 reduced-motion 快照；非法 DOM theme 降级 dark。
7. `MiniQueueView` 本体不出现 `.context-menu`，歌曲信息 Dialog 仍在主 renderer 打开。

### 8.3 其余 UI

1. priority 行显示封面/占位、标题、歌手、时长和独立删除按钮；播放与删除各只触发一次。
2. source 区段存在“播放列表”，不存在“播放列表 N 首”；header 总数仍存在。
3. Liked 空状态存在 `IconStar` class 和新文案，不含 heart emoji。
4. 播放全部对已加载 songs 调用统一 store 入口，playlist 顺序与当前后端排序一致。
5. 加载中、空歌单、playback=false 时按钮 disabled；旧请求不能覆盖新请求或解除新请求 loading。
6. 进入 Mini 调用 `setResizable(false)` 和 `setSize(400, 150)`；退出先恢复 `setResizable(true)`，再恢复 bounds/default size。

## 9. 验证命令

按顺序执行：

```bash
npx vitest run tests/contextMenuIPC.test.ts tests/useMiniTrackContextMenu.test.tsx tests/MiniContextMenu.test.tsx tests/MiniQueueView.test.tsx
npx vitest run tests/PlaylistPanel.test.tsx tests/Liked.test.tsx tests/Playlists.test.tsx tests/windowIPC.test.ts
npx tsc --noEmit
node harness/checks.js
npm run build
npm test
git diff --check
```

报告必须分别写明：通过、失败、因环境跳过、仍需人工验证；不得用“应该没问题”替代结果。

## 10. 真实 Electron 验收

### Menu

1. `400x150` Mini 中在四角右键 source/priority 行，菜单可越过主窗口但不越出当前显示器工作区。
2. 浅色、深色、跟随系统三种设置下，菜单背景、边框、文字、hover、disabled 都可读，无闪白黑块。
3. source 与 priority 菜单动作正确；当前曲“下一首播放”禁用。
4. 点击外部、Escape、切换 Mini 视图、退出 Mini、关闭主窗口均关闭菜单且不执行旧动作。
5. 快速连续右键两首歌只保留第一请求；选择动作只作用于实际菜单捕获的歌曲。
6. 开发模式与生产 build 各 smoke 一次，确认独立 HTML/preload 路径都能加载。

### Main UI

1. priority 行在双主题下信息完整、与 source 明确区分、长标题不挤压时长和删除按钮。
2. “播放列表”区段不重复数量，顶部总数仍正确。
3. Liked 空状态无 emoji，星标和文字语义一致。
4. 歌单详情有“播放全部”；加载期间不可误播上一歌单，点击后从第一首开始且 source playlist 顺序正确。
5. playback flag 关闭时按钮不可操作。
6. Mini 无法拖拽改变尺寸；退出 Mini 后普通窗口可拉伸，保存尺寸/最大化恢复不退化。

## 11. 文档、回滚与交付

### 文档

实施和验证通过后，由 Hermes Agent：

1. 在 `harness/DECISIONS.md` 顶部新增条目，明确替代“Mini 使用纯原生菜单”的旧决定，并记录独立 renderer + 原生 fallback。
2. 更新 `SPEC.md` 的 Mini 菜单、歌单播放和窗口尺寸行为；测试数量只在全量结果确认后更新。
3. 新增本批 devlog，记录自动验证、真实 Electron 未测项和最终人工验收结果。
4. 方案/任务包的归档移动由 Hermes Agent 处理，Executor 不顺手整理其他 plans。

### 分项回滚

- Menu：移除独立 HTML/renderer/preload 输入，恢复当前 `Menu.popup` 实现和原 Hook 名称；不影响其他五项。
- Queue：回滚 `PlaylistPanel` priority DOM/CSS 和 source 标题文本。
- Liked：恢复原空状态，但不影响收藏数据。
- Playlists：移除播放按钮和局部 loading/token，不影响歌单 CRUD。
- Resize：移除 `setResizable(false/true)` 两行，恢复当前尺寸切换。

### Executor 回报格式

- 实际修改文件清单。
- 每批实现摘要与偏离方案之处。
- 定向测试、类型、Harness、build、全量测试、diff check 的真实输出摘要。
- 未执行或失败项目及原因。
- 需要主人完成的 Electron 验收清单。
- 不自动 commit。

## 12. 独立维护者复审

复审时假设未参与前述重写，只检查方案是否能安全交给另一位程序员。

| 复审问题 | 结论 |
|---|---|
| 是否仍有二选一或需要 Executor 猜测的架构？ | 无；独立 electron-vite renderer、dedicated preload、内部 invoke 和 fallback 均已固定 |
| 是否破坏刚完成的菜单目标捕获和并发防护？ | 否；renderer Hook 保留，主进程继续 single pending + settled guard |
| 是否扩大播放状态机风险？ | 否；禁止修改 `playerStore` / `useAudioSync`，播放全部复用既有手动播放入口 |
| 新子窗口是否有权限和 sender 边界？ | 有；sandbox + contextIsolation + 最小 API，内部 action 再校验 active child 和 enabled |
| 初始化数据和失败等待是否仍需猜测？ | 否；display entry 结构、固定 label 来源和 2000ms ready 超时均已写明 |
| 独立 renderer 是否继承现有视觉和无障碍约束？ | 是；直接复用主题/菜单/motion CSS，并传递 resolved theme 与手动 reduced-motion 快照 |
| 开发/生产构建路径是否闭环？ | 是；Vite renderer/preload 多入口和双环境 smoke 已进入执行与验收门 |
| UI 要求是否可以机械验收？ | 是；DOM 文案、尺寸、disabled、信息字段、双主题与溢出都有明确断言 |
| Mini 不可拉伸是否会污染普通窗口？ | 不会；false/true 成对恢复并覆盖 saved/default bounds 分支 |
| 六项放在同一批次是否仍可回滚？ | 可以，但必须按 A-E 分批实施和验证；Menu 高风险批不得与其他 UI 一次性混写 |
| 是否遗漏文档决策冲突？ | 已安排实施通过后由 Hermes Agent 写替代决策、SPEC 和 devlog |

**独立复审结论：方案通过，可以在主人确认后生成 Executor 任务包。剩余不可自动证明的风险仅为透明子窗口在真实 Windows/DPI/多显示器下的视觉与焦点行为，已列入强制人工验收。**
