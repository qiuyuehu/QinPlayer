# Codex 任务包：下一首播放 + 队列移除 + Mini 原生菜单

## 背景
- QinPlayer 纯本地音乐播放器，Electron + React + TypeScript
- 当前"添加到接下来播放"是 FIFO 追加到 priorityQueue 末尾，用户期望的是"下一首播放"（LIFO 提升到队首）
- 播放队列没有"从播放列表移除"功能
- 迷你模式右键菜单被 400×150 窗口边界裁剪，需要 Electron 原生菜单

## 方案文件
`C:\Users\秋月\Desktop\QinPlayer\docs\plans\PLAN-insert-next-remove-native-menu.md` — **必须先完整读取**，本任务包只是摘要

## 约束
- 保留 priorityQueue/resume/consumed/commitTrack 状态机，不删除
- 不新增 npm 依赖，不引入推送通道（`context-menu:clicked`）
- 不修改数据库、歌单数据库关系、`playlists:removeSong`
- 不改变无插队/无 detached 时的 sequential/shuffle/loop 规则
- 不修改 ContextMenu/SongInfoDialog 主窗口视觉样式
- renderer 只传受限 action IDs/enabled，主进程拥有固定 label 映射
- 注释用中文
- 不要自动 git commit

## 执行顺序

严格按 A → B → C → D → E → F 顺序执行。每个批次完成后单独验证，失败时停在该批修复。

### 批次 A：Store TDD（insertNext + detached 状态机）
- `tests/playerStore.test.ts` 先写失败测试
- insertNext：队首插入、LIFO 提升、去重、currentTrack disabled、无 currentTrack 时只入队
- removeFromPlaylist + detachedPlaylistIndex：移除普通/当前/不存在 ID、detached 前/后删除调整、setCurrentTrack/setPlaylist/playTrack 清 detached
- nextTrack/prevTrack 扩展 detached 分支
- clearUpcoming 在 current detached 时清所有状态
- 保留 commitTrack，所有跨字段转移通过一次 set 原子提交
- Run: `npx vitest run tests/playerStore.test.ts && npx tsc --noEmit`

### 批次 B：Ended TDD（useAudioSync 接入 detached）
- `tests/useAudioSync.test.tsx` 扩展测试
- loop + 无 queue/resume/detached：继续原曲重播
- loop + insertNext：优先播放队首
- loop + 当前歌曲已移出 playlist：ended 调 nextTrack，不重播
- priority 播放期间 resume 被移除：结束后从 detached successor 继续
- 不得删除上一轮 priorityQueue/恢复锚点测试
- Run: `npx vitest run tests/useAudioSync.test.tsx`

### 批次 C：主窗口菜单（useTrackContextMenu + SongList + PlaylistPanel）
- useTrackContextMenu：`onAddToPriorityQueue` → `onInsertNext`，`canAddToPriorityQueue` → `canInsertNext`
- 菜单文案改为"下一首播放"，priority 行保持"从接下来移除"
- 新建 `tests/useTrackContextMenu.test.tsx`
- SongList：改用 insertNext，只在 currentTrack 相同时禁用
- PlaylistPanel：source 行通过 getExtraItems 注入"从播放列表移除"，priority 行仍是"从接下来移除"
- 当前 source 行允许移除，只禁用"下一首播放"
- Run: `npx vitest run tests/useTrackContextMenu.test.tsx tests/SongList.test.tsx tests/PlaylistPanel.test.tsx`

### 批次 D：原生菜单 IPC（主进程 + preload + 类型）
- 新建 `electron/ipc/contextMenu.ts`：registerContextMenuIPC(getMainWindow)
- 新建 `tests/contextMenuIPC.test.ts`
- Modify：`electron/main.ts`、`electron/preload.ts`、`src/types/ipc.ts`
- 主进程只接受当前 sender，维护 action→中文 label 固定映射
- payload 校验：对象、entries 数组、长度 1..8、action 白名单、enabled boolean、action 不重复
- Promise 单次完成（settled guard），pending 时第二次调用返回 null
- preload 只加 INVOKE_CHANNELS，不加 SEND/ON
- Run: `npx vitest run tests/contextMenuIPC.test.ts`

### 批次 E：Mini 接入（renderer Hook + 组件）
- 新建 `src/hooks/useNativeTrackContextMenu.ts`，仅供 MiniQueueView
- 新建 `tests/useNativeTrackContextMenu.test.tsx`
- Modify：`MiniQueueView.tsx`、`MiniQueueViewContainer.tsx`、`MiniQueueView.test.tsx`、`MiniPlayer.test.tsx`
- source 行 entries：播放、下一首播放、从播放列表移除、打开目录、歌曲信息
- priority 行 entries：播放、从接下来移除、打开目录、歌曲信息
- invoke 返回后按捕获 track 执行动作；连续右键/unmount/null/reject 无陈旧副作用
- 本地 pending ref 阻止并发 invoke + 单调 request token
- MiniQueueView 删除自定义 ContextMenu 渲染，保留 SongInfoDialog
- Container 继续是唯一 queue selector 所有者
- Run: `npx vitest run tests/useNativeTrackContextMenu.test.tsx tests/MiniQueueView.test.tsx tests/MiniPlayer.test.tsx`

### 批次 F：全量验证 + 文档
- `npm run verify` 全绿
- 更新 SPEC.md + DECISIONS.md + devlog
- 交 Codex Reviewer 独立代码审查

## 验证命令
```bash
# 定向测试
npx vitest run tests/playerStore.test.ts tests/useAudioSync.test.tsx
npx vitest run tests/useTrackContextMenu.test.tsx tests/SongList.test.tsx tests/PlaylistPanel.test.tsx
npx vitest run tests/contextMenuIPC.test.ts tests/useNativeTrackContextMenu.test.tsx tests/MiniQueueView.test.tsx tests/MiniPlayer.test.tsx

# 完整验证
npx tsc --noEmit
npm run verify
git diff --check
```

## 需要特别注意
1. **priorityQueue 不删除** — 上一轮已通过 442 测试，保留 resume/consumed/commitTrack
2. **insertNext 是 LIFO** — 连续 A→B 得 B→A，不是 FIFO
3. **detachedPlaylistIndex 是短生命周期** — 不持久化，手动播放/换来源后清理
4. **移除当前歌曲后 loop 不无限重播** — ended 在 loop 前检查 detached
5. **原生菜单用 invoke 返回** — 不新增 `context-menu:clicked` 推送通道
6. **主进程不执行播放动作** — 只构建菜单并返回 action ID
7. **sender 校验** — 只接受当前 mainWindow.webContents
8. **settled guard** — click + callback 只 resolve 一次
9. **MiniPlayer 顶层不订阅 playlist** — selectors 只放 Container
10. **useTrackContextMenu 当前仓库没有测试** — 本次补建，不是假设已有

## 返回格式
同标准任务包格式：结论、变更、验证、风险、需要主人确认
