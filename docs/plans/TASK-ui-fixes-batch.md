# Codex 任务包：UI 修复批次（菜单主题 + 队列样式 + 禁止拉伸）

## 背景
- QinPlayer 纯本地音乐播放器，Electron + React + TypeScript
- 迷你模式右键菜单使用原生菜单，没有主题适配
- 播放队列 priority 区域样式简陋，缺少视觉层次
- "我喜欢的"空白提示使用拟物化 emoji
- 歌单页面没有播放按钮
- 迷你模式可以拉伸，但没做适配

## 方案文件
`C:\Users\秋月\Desktop\QinPlayer\docs\plans\PLAN-ui-fixes-batch.md` — **必须先完整读取**，本任务包只是摘要

## 约束
- 不修改 playerStore、useAudioSync、AudioEngine
- 不改变数据库、歌单 IPC、扫描、文件系统或持久化 schema
- 不改变主窗口 ContextMenu 的实现和视觉
- 不给透明菜单窗口暴露主应用完整 electronAPI
- 不新增 npm 依赖
- 不统一重做其他页面空状态
- 注释用中文
- 不要自动 git commit

## 执行顺序

严格按 A → B → C → D → E → F 顺序执行。每个批次完成后单独验证，失败时停在该批修复。

### 批次 A：菜单 IPC/renderer 基础设施

- 新建 `mini-context-menu.html`（独立 CSP 和挂载点）
- 新建 `src/miniContextMenu.tsx`（独立 React 入口）
- 新建 `src/components/MiniContextMenu.tsx`（主题菜单 UI）
- 新建 `src/styles/mini-context-menu.css`（token 导入、透明页面和菜单样式）
- 新建 `electron/contextMenuPreload.ts`（只暴露 getInit/ready/resolve）
- 修改 `electron.vite.config.ts`（增加 renderer/preload 多入口）
- 修改 `src/types/ipc.ts`（show payload、init 类型、内部 invoke 类型）
- 修改 `src/types/electron.d.ts`（contextMenuAPI 类型）
- 新建 `tests/MiniContextMenu.test.tsx`（菜单 renderer 行为）
- 完成门：类型检查通过；菜单组件测试转绿；生产 build 产出两个 renderer HTML 和两个 preload entry

### 批次 B：主进程子窗口 + Hook 重构

- 修改 `electron/ipc/contextMenu.ts`（子窗口生命周期、协议校验、定位、原生 fallback、统一 settle）
- 重命名 `src/hooks/useNativeTrackContextMenu.ts` → `src/hooks/useMiniTrackContextMenu.ts`（保留捕获目标/pending/token，增加 theme 快照）
- 修改 `src/components/MiniQueueView.tsx`（只更新 Hook import/调用名）
- 修改 `tests/contextMenuIPC.test.ts`（子窗口、校验、生命周期、fallback）
- 重命名 `tests/useNativeTrackContextMenu.test.tsx` → `tests/useMiniTrackContextMenu.test.tsx`（保留旧测试并增加 theme）
- 修改 `tests/MiniQueueView.test.tsx`（更新语义断言）
- 完成门：IPC sender/payload/action/pending/settle/load-failure 测试转绿；Hook 旧目标/卸载/并发测试保留

### 批次 C：队列样式 + Liked 空状态

- 修改 `src/components/PlaylistPanel.tsx`（priority 完整行、source 标题去重）
- 修改 `src/styles/playlist-panel.css`（priority/section/item-main/remove 样式）
- 修改 `tests/PlaylistPanel.test.tsx`（DOM、文案和交互回归）
- 修改 `src/pages/Liked.tsx`（IconStar 空状态和无 emoji 文案）
- 修改 `src/styles/recent-liked.css`（空状态图标样式）
- 修改 `tests/Liked.test.tsx`（图标和文案）
- 完成门：对应组件测试转绿；不触及播放状态机

### 批次 D：歌单播放全部

- 修改 `src/pages/Playlists.tsx`（播放全部、加载 token、旧快照清理）
- 修改 `src/styles/playlists.css`（详情 header/action/disabled 样式）
- 修改 `tests/Playlists.test.tsx`（播放、加载、空列表和 flag）
- 完成门：Playlists 测试覆盖最新请求、disabled 与一次播放记账

### 批次 E：Mini 禁止拉伸

- 修改 `electron/ipc/window.ts`（Mini setResizable false/true）
- 新建 `tests/windowIPC.test.ts`（进入/退出 Mini 的窗口调用契约）
- 完成门：tests/windowIPC.test.ts 转绿；saved bounds 两条分支不退化

### 批次 F：全量验证 + 文档

- `npm run verify` 全绿
- 更新 SPEC.md + DECISIONS.md + devlog
- 交 Codex Reviewer 独立代码审查

## 验证命令
```bash
# 定向测试
npx vitest run tests/contextMenuIPC.test.ts tests/useMiniTrackContextMenu.test.tsx tests/MiniContextMenu.test.tsx tests/MiniQueueView.test.tsx
npx vitest run tests/PlaylistPanel.test.tsx tests/Liked.test.tsx tests/Playlists.test.tsx tests/windowIPC.test.ts

# 完整验证
npx tsc --noEmit
node harness/checks.js
npm run build
npm test
git diff --check
```

## 需要特别注意
1. **独立 renderer** — 使用 electron-vite 多页面入口，不使用 data URL
2. **专用 preload** — 只暴露 getInit/ready/resolve，不暴露完整 electronAPI
3. **原生 fallback** — 子窗口创建/加载/ready 失败时降级到 Electron Menu
4. **主题快照** — 右键瞬间传递 dark/light，菜单存活期间不做热更新
5. **reducedMotion 快照** — 从 DOM data 属性取得，继承主应用手动偏好
6. **sender 校验** — 内部三个通道只接受当前菜单子窗口的 webContents
7. **action 再校验** — 非 null action 必须存在于原始 entries 且 enabled === true
8. **单 pending** — 第二次快速右键返回 null，不替换第一菜单的目标
9. **2000ms 超时** — 初始化超时进入原生 fallback
10. **setResizable 成对** — 进入 Mini false，退出 Mini true，不污染普通窗口

## 返回格式
同标准任务包格式：结论、变更、验证、风险、需要主人确认
