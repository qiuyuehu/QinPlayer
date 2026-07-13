# Codex 任务包：UI 微调（播放队列 + 歌单按钮 + Mini 菜单）

## 背景
- QinPlayer 纯本地音乐播放器，Electron + React + TypeScript
- 歌单"播放全部"按钮偏大，需要和排序按钮对齐
- 播放队列有重复标签（"播放队列45首"和"播放列表"）
- 顶部边框对比度太强
- 迷你模式菜单太大，文字显示不全

## 方案文件
`C:\Users\秋月\Desktop\QinPlayer\docs\plans\PLAN-ui-micro-adjustments.md` — **必须先完整读取**，本任务包只是摘要

## 约束
- 不修改 playerStore.ts、useAudioSync.ts
- 不改变播放逻辑、菜单 action、sender/payload 校验
- 不预热、缓存或复用 BrowserWindow
- 不新增依赖、IPC push 通道
- 注释用中文
- 不要自动 git commit

## 执行顺序

严格按 A → B → C → D 顺序执行。每个 Task 完成后单独验证。

### Task A：歌单按钮

1. 先补 DOM 位置和 disabled 回归测试
2. 移动 JSX：从 `.playlists__header--detail` 移到 `.playlists__sort` 最后一个子项
3. 调整组合 class CSS：`className="playlists__sort-btn playlists__play-all"`
4. 保留 handlePlayAll、IconPlay、disabled 表达式、loading/空列表/功能开关行为
5. 运行 `tests/Playlists.test.tsx`

门禁：测试必须证明业务 handler 和禁用条件未变。

### Task B：队列标签与分隔线

1. 先补 header count、普通区段标题和优先区段语义测试
2. 删除 `.queue-panel__count`（第99行）
3. 删除普通队列前的 `.queue-panel__section`（第138行）
4. 只修改 header 下分隔线颜色：`border-bottom: 1px solid var(--border-subtle)`
5. 清理确认无引用的 CSS
6. 运行 `tests/PlaylistPanel.test.tsx`

门禁：不得误删"接下来 N 首"，不得改变优先队列强调线。

### Task C：Mini 菜单尺寸

1. 先更新 IPC 几何测试，确认旧常量下测试失败
2. 更新 CSS：
   - `.mini-context-menu` width/min-width: 160px
   - `.mini-context-menu .context-menu__item` height/min-height: 30px, padding: 6px 12px, font-size: 12px
3. 更新主进程常量：
   - `MENU_WINDOW_WIDTH = 176`
   - `MENU_ITEM_HEIGHT = 30`
   - `MENU_WINDOW_CHROME_HEIGHT = 26`
4. 更新 renderer 最长文案 fixture
5. 运行 `tests/contextMenuIPC.test.ts` 和 `tests/MiniContextMenu.test.tsx`

门禁：精确宽高、右下夹取、fallback、安全选项及交互测试全部通过。

### Task D：整体验证和记录

1. 执行全量自动验证
2. 在深色、浅色主题中完成真实 Electron 手测
3. 可用时记录延迟数据；不可用时明确记录未测量
4. 写 devlog，列出实际修改、验证证据和未验证项
5. 不自动 commit

## 验证命令
```bash
npx vitest run tests/Playlists.test.tsx tests/PlaylistPanel.test.tsx tests/MiniContextMenu.test.tsx tests/contextMenuIPC.test.ts
npx tsc --noEmit
node harness/checks.js
npm run build
npm test
git diff --check
```

## 需要特别注意
1. **播放按钮保留原有语义** — handlePlayAll、disabled、loading、空列表、功能开关
2. **删除标签不误删优先队列** — 保留"接下来 N 首"、背景色和左侧强调线
3. **边框只改颜色不改宽度** — 已经是 1px，改为 var(--border-subtle)
4. **Mini 菜单尺寸精确** — 内容宽 160px、窗口宽 176px、行高 30px、附加高度 26px
5. **延迟只测量不优化** — 记录数据，不伪装成性能改善
6. **双主题+三档DPI验收** — 深色/浅色、100%/150%/200% DPI

## 返回格式
同标准任务包格式：结论、变更、验证、风险、需要主人确认
