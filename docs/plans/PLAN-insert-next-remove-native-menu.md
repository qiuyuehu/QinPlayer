# QinPlayer 真正“下一首”、队列移除与 Mini 原生菜单方案

> 日期：2026-07-13
> 状态：待主人确认
> 类型：播放状态修正 + 跨进程 UI 交互
> 建议执行模型：Strong Codex（涉及 `playerStore`、`useAudioSync` 与 Electron IPC 生命周期）

## 1. 初审结论

原方案不能直接实施，存在以下阻断问题：

| 原方案问题 | 后果 | 本方案处理 |
|---|---|---|
| 删除 priorityQueue，直接把歌曲移到 playlist 当前项后 | 只对顺序模式有效；shuffle 仍随机，loop 自然结束仍重播当前曲 | 保留已验证的 priority 状态机，只把追加改成队首插入 |
| 声称“不需要独立状态机” | 破坏 2026-07-12 已通过自动门禁的恢复锚点、自然 ended 和跨模式语义 | priorityQueue/resume/consumed/commitTrack 全部保留 |
| 未定义连续两次“下一首”的顺序 | 插到 current+1 实际是后点的先播，和原 FIFO 追加不同 | 明确采用真正 Play Next 的 LIFO 提升语义：最后一次选择最先播放 |
| 已在 pending 的歌曲仍被 disabled | 无法把排在后面的待播歌曲提升为下一首 | `insertNext()` 对 pending 内歌曲去重后移到队首；只有当前歌曲禁用 |
| 移除当前歌曲后直接 filter playlist | currentTrack 不在 playlist，现有 next/prev 会因 index=-1 no-op；loop ended 还会无限重播被移除歌曲 | 增加短生命周期 `detachedPlaylistIndex`，并覆盖 next/prev/ended |
| “下一首从新 playlist 的 currentIndex 取”没有保存原 index | filter 后无法从 currentTrack 反推出位置 | 移除前记录索引，移除后保存 successor 所在的新索引 |
| 删除 commitTrack | 自动切歌容易再次调用会清理用户意图的公开 playTrack，且播放记账重复 | 保留内部原子提交与统一记账入口 |
| 原生菜单通过全局 `context-menu:clicked` 推送 | 无 requestId/sender/目标绑定；旧菜单点击可能作用于新行，取消也不完成 | 改为一次 `invoke()` 返回 `action|null`，不新增 push 通道 |
| 主进程把结果发给全局 mainWindow | sender 窗口与接收窗口可能不一致 | 只接受当前 mainWindow.webContents，并把 popup 绑定该 BrowserWindow |
| renderer 传任意 label/id，主进程照单构建 | 缺乏运行时校验，主进程菜单协议无边界 | renderer 只传受限 action IDs/enabled；主进程拥有固定 label 映射并严格校验 |
| Mini 菜单只保留三项 | 丢失“添加到下一首”和打开目录，source/priority 语义也不一致 | 原生菜单覆盖 Mini 当前已有公共动作，并按行 kind 区分 |
| 只在组件测试里 mock Electron Menu | 无法证明 sender、取消、双 settle 和 popup 绑定 | 新增独立主进程 IPC 单测与 renderer Hook 单测 |
| 将已有 Hook 测试写成“简化” | 当前仓库实际没有 `tests/useTrackContextMenu.test.tsx` | 本次补建，而不是假设已有 |

## 2. 已核验的当前实现

### 2.1 播放状态

- `playerStore` 已有 `priorityQueue`、`priorityResumeTrackId`、`priorityConsumedTrackIds` 和内部 `commitTrack()`。
- `addToPriorityQueue()` 当前按 FIFO 追加；`nextTrack()` 消费队首并在结束后按 resume 锚点恢复。
- `useAudioSync` 在自然 ended 时先检查 priorityQueue/resume，再处理 loop，因此现有插队确实高于所有播放模式。
- 用户手动 `playTrack()` 或 `setPlaylist()` 会清 priority 状态，自动 next/prev 通过 commitTrack 保留状态。
- 上一轮 `npm run verify` 记录为 48 个测试文件、442 个用例通过；真实 Electron 验收仍由主人负责。

### 2.2 队列视图与菜单

- PlaylistPanel 和 MiniQueueView 都显示“接下来”priorityQueue 与“播放列表”playlist。
- PlaylistPanel/Mini source 行没有“从播放列表移除”；priority 行已有单项移除。
- 三个表面通过 `useTrackContextMenu` 复用自定义 HTML 菜单。
- Mini 窗口固定 `400×150`，HTML 菜单无法越过 BrowserWindow 边界，被裁剪不是 CSS z-index 能解决的问题。
- preload 对 invoke/send/on 分别使用白名单；新增 invoke 通道必须同步更新 `src/types/ipc.ts` 和 preload。

## 3. 目标

1. “添加到接下来播放”改成真正的“下一首”：每次选择都提升到 priorityQueue 队首，下一次切歌必播。
2. PlaylistPanel 与 MiniQueueView 的 playlist source 行支持“从播放列表移除”。
3. 移除当前歌曲或恢复锚点后，当前音频继续，下一次 next/prev/ended 能从来源列表安全衔接。
4. MiniQueueView 使用 Electron 原生菜单，菜单可越过 `400×150` 窗口边界且不会串行到错误歌曲。
5. 主窗口继续使用现有自定义 ContextMenu；不扩大到全应用原生菜单迁移。

## 4. 非目标

- 不删除或持久化 priorityQueue/resume/consumed 状态。
- 不修改数据库、歌曲文件、歌单数据库关系或 `playlists:removeSong`；这里只移除会话内播放列表条目。
- 不增加拖拽排序、播放历史栈、多选删除、撤销 Toast 或全局快捷键。
- 不改变无插队、无 detached 状态时的 sequential/shuffle/loop 规则。
- 不修改 ContextMenu、SongInfoDialog 的主窗口视觉样式。
- 不新增 npm 依赖，不 commit/push/package/release。

## 5. 产品语义

### 5.1 真正“下一首”

`addToPriorityQueue` 重命名为 `insertNext`：

```ts
insertNext(track)
```

规则：

1. track 是 currentTrack：no-op，菜单 disabled。
2. track 不在 priorityQueue：插入队首。
3. track 已在 priorityQueue 第 0 位：保持同一数组引用的 no-op。
4. track 已在 priorityQueue 后部：先按 ID 移除旧位置，再插入队首。
5. 连续选择 A、再选择 B：待播顺序为 B、A；这是“播放下一首”而不是“追加到队尾”。
6. track 是否已存在 playlist 不影响插队；priorityQueue 是一次额外播放意图。
7. 没有 currentTrack 时仍可插入队首，之后手动 next 可消费；不自动开始播放。

菜单文案统一为“下一首播放”，避免“添加到接下来播放”被理解为 FIFO 追加。priority 行仍显示“从接下来移除”。

### 5.2 从播放列表移除

`removeFromPlaylist(trackId)` 只修改当前会话 playlist，不删除曲库或数据库歌单。

| 场景 | 行为 |
|---|---|
| 移除普通非当前 source 行 | 从 playlist 删除，当前播放和 priorityQueue 不变 |
| 移除不存在 ID | no-op，保持引用 |
| 移除当前 source 歌曲 | 当前音频继续；保存删除后 successor 的 `detachedPlaylistIndex` |
| priority 播放期间移除 resume 锚点 | 保存该锚点删除后的 successor index；priority 播完后从该位置恢复 |
| priority 播放期间移除与 current 同 ID 的 source 副本 | 只删除 source 项，不覆盖已有 resume；当前 priority 音频继续 |
| playlist 删除至空 | detached index 为 null；当前音频结束后不再自动切歌 |
| 再次删除 detached index 前的歌曲 | 原子调整 index，保持指向同一 successor |
| 删除 detached index 指向的歌曲 | index 保持在该位置，让后继自动顶上；末尾按新长度回绕 |
| 用户手动播放、setCurrentTrack 或 setPlaylist | 清 detached index，新的明确意图/直接替换接管导航 |

新增状态：

```ts
detachedPlaylistIndex: number | null
removeFromPlaylist: (trackId: number) => void
```

它只是“当前/锚点已从来源列表移除后，下次从哪里继续”的临时游标，不持久化，也不是第二套队列。

### 5.3 导航优先级

`nextTrack()` 顺序：

```text
1. priorityQueue 队首
2. priorityResumeTrackId 能在 playlist 找到时按既有规则恢复
3. resume 已被移除且 detachedPlaylistIndex 有效时，从 detached successor 恢复
4. currentTrack 已被移除且 detachedPlaylistIndex 有效时，从 detached successor 继续
5. 普通 playlist + playMode 导航
```

- 成功消费 detached successor 后清 `detachedPlaylistIndex`、无效 resume 和 consumed IDs。
- detached index 越界时按 playlist.length 规范化；playlist 为空时清理并 no-op。
- shuffle 在 detached 恢复时从当前 playlist 随机选择；sequential/loop 都从 successor 开始，因为用户已明确把原当前曲移出来源。

`prevTrack()`：

- 有有效 priority resume 时保持现有“回锚点”语义。
- current/resume 已 detached 时，播放 successor index 的前一项并清 detached；playlist 为空则 no-op。
- 普通路径保持现有规则。

### 5.4 自然结束

`useAudioSync` 的 ended 优先判断扩展为：

```text
priorityQueue 非空
或 priorityResumeTrackId 非空
或 detachedPlaylistIndex 非空
    → nextTrack()
否则 playMode === loop
    → 原曲重播
否则
    → nextTrack()
```

因此被移出 playlist 的当前歌曲在 loop 模式下也只播到本次结束，不会无限循环一首已不在来源列表的歌。

## 6. Mini 原生菜单协议

### 6.1 强类型 Action

在 `src/types/ipc.ts` 定义：

```ts
export type NativeTrackMenuAction =
  | 'play'
  | 'insert-next'
  | 'remove-priority'
  | 'remove-playlist'
  | 'open-location'
  | 'show-info'

export interface NativeTrackMenuEntry {
  action: NativeTrackMenuAction
  enabled: boolean
}
```

新增 invoke 映射：

```ts
'context-menu:show-track': {
  args: { entries: NativeTrackMenuEntry[] }
  return: NativeTrackMenuAction | null
}
```

不新增 `IpcPushChannels`，也不把 action 回传到全局 renderer listener。

### 6.2 主进程实现

新建 `electron/ipc/contextMenu.ts`，导出 `registerContextMenuIPC(getMainWindow)`。

要求：

1. 只接受 `event.sender === getMainWindow()?.webContents`，其他 sender 返回 null 并记录警告。
2. 主进程维护 action→中文 label 固定映射，renderer 不传 label。
3. payload 必须是对象、entries 是数组、长度 1..8、action 在白名单、enabled 是 boolean、action 不重复；非法输入返回 null，不抛出未处理异常。
4. `Menu.buildFromTemplate()` 只使用校验后的项目。
5. currentWindow/webContents 已销毁时返回 null；否则 `menu.popup({ window: currentWindow, callback })` 明确绑定发起窗口，不使用全局坐标或第二个透明窗口。
6. handler 返回 Promise；菜单项 click resolve 对应 action，popup callback 在未选择时 resolve null。
7. 使用 settled guard，保证 click 后 callback 再触发也只 resolve 一次。
8. 同一窗口已有 pending native menu 时，新请求返回 null；旧请求由点击或 popup close 完成，避免目标串线。
9. build/popup 同步抛错、窗口在调用间销毁时 catch 并 resolve null；所有完成路径都在 finally/统一 settle 中释放 pending。
10. 主进程只返回 action，不执行播放、文件或 renderer UI 操作。

在 `electron/main.ts` 与其他 IPC 模块同层注册：

```ts
registerContextMenuIPC(getMainWindow)
```

preload 只把 `context-menu:show-track` 加入 `INVOKE_CHANNELS`；不得加入 SEND/ON 白名单。

### 6.3 Renderer 调用

新建 `src/hooks/useNativeTrackContextMenu.ts`，仅供 MiniQueueView：

- source 行 entries：播放、下一首播放、从播放列表移除、打开目录、歌曲信息。
- priority 行 entries：播放、从接下来移除、打开目录、歌曲信息。
- 当前歌曲的 insert-next 为 disabled；已在 pending 后部仍 enabled，可提升到队首。
- 右键时捕获 `{track, kind}`，await `invoke()` 的 action 结果后只作用于该捕获目标。
- Hook 用本地 pending ref 阻止第二个并发 invoke；主进程 single-pending 是最后防线，不把第二次右键变成取消第一项选择。
- 使用单调 request token；组件卸载或生命周期失效后，旧 Promise 返回值必须忽略。
- null 表示点击菜单外/按 Esc/窗口关闭，不执行动作。
- `show-info` 设置 MiniQueueView 内的 songInfoTrack；`open-location` 复用现有 IPC。
- invoke reject 只记录一次中文错误，不回退渲染可能继续被裁剪的 HTML 菜单。

MiniQueueView 删除自定义 ContextMenu 渲染和 `useTrackContextMenu` 调用，但保留 SongInfoDialog。

## 7. 执行批次

| 批次 | 内容 | 完成门 |
|---|---|---|
| A | `insertNext` 与 detached 导航状态机 | playerStore 失败测试转绿、类型检查通过 |
| B | useAudioSync ended 接入 detached | ended/loop 回归通过 |
| C | 主窗口菜单接入 insert/remove | Hook、SongList、PlaylistPanel 测试通过 |
| D | 原生菜单 IPC 与 preload | 主进程 IPC、白名单测试通过 |
| E | Mini renderer Hook 与组件接入 | Mini 组件/订阅测试和 Electron smoke 通过 |
| F | 全量验证、文档和独立代码审查包 | `npm run verify` 0 failed |

主人确认方案后才生成 Executor 任务包并修改源码。每批失败时停在该批修复，不带红灯进入下一批。

## 8. 批次 A：Store TDD

先扩展 `tests/playerStore.test.ts`：

### 8.1 insertNext

1. 空 pending 插入队首。
2. 连续 A→B 得到 B→A。
3. 已在 pending 后部的歌曲提升到队首且不重复。
4. 已在队首时保持引用 no-op。
5. currentTrack disabled/no-op。
6. playlist 内已有歌曲仍可插队。
7. 无 currentTrack 时只入队不自动播放。
8. nextTrack 仍按现有 queue/resume/consumed 状态机消费和恢复。
9. sequential/shuffle/loop 的现有优先级测试不得删除。

### 8.2 removeFromPlaylist 与 detached

1. 移除非当前、当前、不存在 ID和最后一首。
2. 移除当前后 isPlaying/currentTrack/currentTime 不变。
3. 顺序、随机、循环三模式在当前结束后从 detached 安全继续。
4. prev 从 detached 前一项继续。
5. 移除 priorityResumeTrackId 后，待播结束从 detached 恢复。
6. priority 播放时移除同 ID source 副本不覆盖真实 resume。
7. detached 前/当前位置再次删除时 index 调整正确。
8. setCurrentTrack、setPlaylist、手动 playTrack 清 detached；自动 commitTrack 仅在消费 detached 时清理。
9. clearUpcoming 在 current 仍在 playlist 时保持现有截断；current detached 时清 playlist、priorityQueue、resume、consumed 与 detached，使当前播完后停止。
10. playback=false 全部播放导航无副作用。
11. 实际开始新歌仍只记一组 recordPlay/updatePlayCount。

实现时保留 `commitTrack(track, extraState?)`，所有跨字段转移通过一次 set 原子提交。

Run：

```bash
npx vitest run tests/playerStore.test.ts
npx tsc --noEmit
```

## 9. 批次 B：Ended TDD

扩展 `tests/useAudioSync.test.tsx`：

1. loop + 无 queue/resume/detached：继续原曲重播，不重复记账。
2. loop + insertNext：优先播放队首。
3. loop + 当前歌曲已移出 playlist：ended 调 nextTrack，不重播当前曲。
4. priority 播放期间 resume 被移除：结束后从 detached successor 继续。
5. sequential/shuffle + detached：只前进一次。
6. playback=false、旧音频 ended 和 transition guard 不退化。

不得删除上一轮 priorityQueue/恢复锚点测试来换取绿灯。

## 10. 批次 C：主窗口菜单

### 10.1 useTrackContextMenu

重命名 Options：

- `onAddToPriorityQueue` → `onInsertNext`
- `canAddToPriorityQueue` → `canInsertNext`

source 菜单文案改为“下一首播放”。priority 菜单保持“从接下来移除”。`getExtraItems` 继续作为宿主扩展点。

新增 `tests/useTrackContextMenu.test.tsx`，覆盖：

1. source/priority 公共菜单差异。
2. playback/playlists flags 与 playlists 懒加载。
3. insert/remove/play/open/info 动作路由。
4. getExtraItems 的位置和执行。
5. pending 已有歌曲仍可提升；current disabled 由宿主 predicate 控制。

### 10.2 SongList

- 改用 insertNext；只在 currentTrack 相同时禁用。
- 保留 likedIds、虚拟列表、playlistId 的“从歌单移除”和排序后的来源列表语义。
- 更新现有右键测试：断言队首插入/提升，不再断言 FIFO 追加。

### 10.3 PlaylistPanel

- 保留“接下来”和“播放列表”两区，不删除 priority UI。
- source 行通过 getExtraItems 注入“从播放列表移除”，使用 IconClose。
- priority 行仍是“从接下来移除”，两种移除不得串 action。
- 当前 source 行允许移除；只禁用“下一首播放”。
- exiting 状态继续阻止右键和所有动作。
- source 移除后复合 key/ref、滚动定位和区数量正确更新。

扩展 `tests/PlaylistPanel.test.tsx` 覆盖 source/priority 菜单差异、移除当前/非当前、清空后续和退出中禁用。

## 11. 批次 D：原生菜单 IPC

Create：

- `electron/ipc/contextMenu.ts`
- `tests/contextMenuIPC.test.ts`

Modify：

- `electron/main.ts`
- `electron/preload.ts`
- `src/types/ipc.ts`
- `tests/harnessChecks.test.ts`（扩展通道白名单/类型约束时）

主进程测试使用依赖注入或 Electron mock，至少覆盖：

1. 当前 sender + 合法 payload 绑定正确 BrowserWindow。
2. 非当前 sender、窗口不存在/销毁、非法 payload、重复 action 返回 null。
3. action ID 映射为主进程固定中文 label，disabled 正确。
4. click resolve action；popup 取消 resolve null。
5. click + callback 只 settle 一次。
6. pending 时第二次调用返回 null，第一项完成后可再次打开。
7. build/popup 抛错和窗口在调用间销毁时返回 null、释放 pending，随后仍可再次打开。
8. handler 注册名称与 `IpcChannels`、preload INVOKE 白名单一致。

## 12. 批次 E：Mini 接入

Create：

- `src/hooks/useNativeTrackContextMenu.ts`
- `tests/useNativeTrackContextMenu.test.tsx`

Modify：

- `src/components/MiniQueueView.tsx`
- `src/components/MiniQueueViewContainer.tsx`
- `tests/MiniQueueView.test.tsx`
- `tests/MiniPlayer.test.tsx`

要求：

- Container 继续是唯一 queue selector 所有者；MiniPlayer 顶层不得订阅 playlist/priorityQueue。
- 增加 `onInsertNext` 与 `onRemoveFromPlaylist` props，移除旧 add 命名。
- source/priority 右键分别生成第 6.3 节 entries。
- 原生菜单返回后按捕获 track 执行动作；连续右键、unmount、null、reject 都无陈旧副作用。
- SongInfoDialog 保持在 renderer；不尝试由主进程创建窗口。
- 组件不再渲染 `.context-menu`，但主窗口相关组件仍渲染。
- 右键区域和滚动容器保持 `no-drag`；左键播放和 priority 行移除按钮不退化。

测试：

1. source/priority 发送正确 action IDs/enabled。
2. 选择每种 action 调用正确 callback，作用于原右键 track。
3. null/reject/旧 Promise/unmount 不执行 action；本地 pending 时第二次右键不发第二个 invoke。
4. source remove 与 priority remove 不混淆。
5. 不渲染 HTML ContextMenu；SongInfoDialog 仍可打开。
6. MiniPlayer 默认/歌词视图仍不因 queue 更新重渲染；queue view 保持实时。

## 13. 完整文件范围

Create：

- `electron/ipc/contextMenu.ts`
- `src/hooks/useNativeTrackContextMenu.ts`
- `tests/contextMenuIPC.test.ts`
- `tests/useNativeTrackContextMenu.test.tsx`
- `tests/useTrackContextMenu.test.tsx`

Modify：

- `src/stores/playerStore.ts`
- `src/hooks/useAudioSync.ts`
- `src/hooks/useTrackContextMenu.tsx`
- `src/components/SongList.tsx`
- `src/components/PlaylistPanel.tsx`
- `src/components/MiniQueueView.tsx`
- `src/components/MiniQueueViewContainer.tsx`
- `src/types/ipc.ts`
- `electron/preload.ts`
- `electron/main.ts`
- `tests/playerStore.test.ts`
- `tests/useAudioSync.test.tsx`
- `tests/SongList.test.tsx`
- `tests/PlaylistPanel.test.tsx`
- `tests/MiniQueueView.test.tsx`
- `tests/MiniPlayer.test.tsx`
- `tests/harnessChecks.test.ts`（仅现有白名单约束需要同步时）
- `SPEC.md`
- `harness/DECISIONS.md`
- 对应 devlog

明确不修改：

- 数据库和 migrations
- `electron/ipc/playlists.ts` / `songs.ts`
- `ContextMenu.tsx` / `SongInfoDialog.tsx`
- MiniPlayer 窗口尺寸与 BrowserWindow 数量
- package dependencies、TypeScript/build 配置

## 14. 自动验证

执行前先记录基线；执行后只报告实际运行结果：

```bash
npx vitest run tests/playerStore.test.ts tests/useAudioSync.test.tsx
npx vitest run tests/useTrackContextMenu.test.tsx tests/SongList.test.tsx tests/PlaylistPanel.test.tsx
npx vitest run tests/contextMenuIPC.test.ts tests/useNativeTrackContextMenu.test.tsx tests/MiniQueueView.test.tsx tests/MiniPlayer.test.tsx
npx tsc --noEmit
npm run verify
git diff --check
```

最终要求：Harness、生产 build、全量 Vitest 0 failed；无新增依赖、push 通道、数据库字段或未授权文件。

## 15. 主人手动验收

真实 Electron 中验证：

1. 顺序模式连续选择 A、B“下一首播放”，实际顺序为 B、A，再恢复来源列表。
2. shuffle 模式下一首必播选中歌曲，待播结束后恢复随机。
3. loop 模式当前曲结束后先播选中歌曲，待播结束后回原锚点。
4. 已在 pending 后部的歌曲再次选择后提升到第一位，不重复。
5. PlaylistPanel 移除普通、当前及 resume 锚点，当前音频不中断，后续衔接正确。
6. current 被移除且处于 loop 时只完成本次播放，不无限循环。
7. priority/source 两区同曲的移除动作不会删错区域。
8. Mini `400×150` 右键菜单可以越过窗口边界，source/priority 菜单项正确。
9. 连续快速右键两首歌后，选择动作只作用于实际弹出菜单对应歌曲。
10. 点击菜单外、Escape、切换 Mini 视图后没有陈旧动作。
11. 主窗口 SongList/PlaylistPanel 仍使用原有主题化 HTML 菜单。
12. 重启后 priority/detached 为空，playlist 恢复逻辑不受影响。

## 16. 验收标准

1. priorityQueue 状态机保留；`insertNext` 使用去重后 prepend，最后选择项最先播放。
2. sequential/shuffle/loop 的插队和恢复语义全部有自动测试。
3. 移除当前/resume 后不出现 index=-1 no-op 或 loop 无限重播。
4. detached 游标短生命周期、非持久化，手动播放/换来源后清理。
5. source remove 与 priority remove 作用于各自集合。
6. Mini 原生菜单只有一个 invoke 通道，返回 `action|null`，无全局 clicked push。
7. 主进程校验 payload/sender、绑定正确窗口并保证 Promise 单次完成。
8. renderer 忽略旧请求和卸载后的返回值。
9. MiniPlayer queue-only subscription、固定壳层和 no-drag 行为不退化。
10. `npm run verify` 0 failed，主人完成真实 Electron 验收。

## 17. 风险与控制

| 风险 | 控制 |
|---|---|
| 删除 priority 状态导致 shuffle/loop 回归 | 明确禁止删除，保留上一轮测试 |
| “下一首”连续操作顺序含糊 | 明确 LIFO 提升并手动验收 A→B 得 B→A |
| 移除 current 后失去列表位置 | detachedPlaylistIndex 原子维护，ID/index missing 测试 |
| resume 在插队期间被删除 | 删除时记录 detached successor，恢复顺序覆盖 |
| loop 继续重播已移除当前曲 | ended 在 loop 前检查 detached |
| 公开 playTrack 清理自动队列 | 自动导航继续使用 commitTrack |
| 原生菜单点击作用于新 target | invoke 返回值 + 捕获 target + request token |
| popup click/callback 双完成 | 主进程 settled guard |
| renderer 伪造菜单内容 | action union、运行时白名单、固定主进程 labels |
| 菜单发给错误窗口 | sender 必须等于当前 mainWindow.webContents |
| Mini 顶层订阅回归 | selectors 只放 Container，保留 MiniPlayer 回归测试 |
| 用户归档改动被误覆盖 | 本任务只修改计划列出的源码，归档移动全部保留 |

## 18. 回滚

按批次回滚，不做整仓 reset：

1. E 可恢复 Mini HTML ContextMenu，同时保留已验证的 IPC 模块或随后回滚 D。
2. D 可删除单一 invoke 通道和注册，不影响主窗口菜单。
3. C 可恢复 addToPriorityQueue 命名和主面板无 source remove 状态。
4. B 必须与 A 的 detached 状态一起回滚，避免 ended 读取不存在字段。
5. A 回滚时恢复现有 FIFO append 与 priority 状态机，不回滚到“删除 priorityQueue”的原稿方案。
6. 回滚前列出精确文件，保留用户的 docs/plans/archive 移动及其他无关改动。

## 19. 文档与实施后审查

实施完成后：

- `SPEC.md`：更新“下一首播放”为 prepend/提升语义，并记录会话内 source removal。
- `harness/DECISIONS.md`：补充 detached 游标与原生菜单 invoke 决策；不要覆盖原 priorityQueue 决策。
- `docs/devlog/devlog-20260713-insert-next-remove-native-menu.md`：记录真实文件、测试数量、未测量项和主人验收结果。
- 由于涉及 core playback state 与跨进程 IPC，必须交 Codex Reviewer 做实施后独立代码审查。

审查重点：

1. 是否有任何自动路径调用公开 playTrack 并意外清状态。
2. detached index 在连续删除、空列表、wrap 和 resume missing 下是否正确。
3. 原生菜单 handler 是否可被错误 sender 或非法 payload 利用。
4. Promise 是否在 click/cancel/window close 下都恰好完成一次。
5. Mini renderer 是否可能把旧 action 用到新 track。

## 20. 独立维护者视角二审

审查身份：未参与方案编写、负责后续播放器状态与 Electron 安全边界的维护者。

### 20.1 二审发现与处理

| 二审问题 | 处理结果 |
|---|---|
| playlist 插入能否覆盖 shuffle/loop？ | 不能，拒绝删除 priorityQueue，改为 priority 队首提升 |
| 连续 Play Next 的顺序是什么？ | 明确 LIFO：最后选择项最先播放 |
| pending 内已有歌曲怎么办？ | 从旧位置移到队首，不 disabled、不重复 |
| 为什么保留 commitTrack？ | 自动提交与用户手动意图必须分层，并保持统一记账 |
| 移除当前后怎么找下一首？ | 保存删除后 successor index，不再从 currentTrack 反推 |
| resume 锚点被删除怎么办？ | 同一 detached 游标接管恢复，priority 仍先消费 |
| loop 会不会重播已移除歌曲？ | detached 判定进入 ended 的 loop 分支之前 |
| 是否需要完整播放历史？ | 不需要；detached 只保存一次来源位置，消费即清 |
| 为什么不用 clicked push？ | invoke Promise 天然关联调用与返回，取消可返回 null，状态更少 |
| 如何阻止原生菜单串到错误歌曲？ | sender 校验、单 pending、捕获 target、request token 四层保护 |
| 主进程是否执行播放动作？ | 不执行，只构建菜单并返回 action ID |
| Mini 和主窗口是否必须统一菜单实现？ | 不必；窗口边界不同，主窗口保留主题化 HTML 菜单 |
| 测试是否只是 mock UI？ | 增加主进程 IPC、renderer Hook、组件和真实 Electron 四层验证 |
| 是否误碰用户归档？ | 文件范围明确排除归档移动 |

### 20.2 二审结论

**有条件通过。** 完善后的方案保留了已验证的跨模式 priority 状态机，用最小的 detached 游标补足 source removal，并把 Mini 原生菜单收敛为强类型、sender 绑定、单次 Promise IPC。主人确认后可按 A→F 以 TDD 实施；Executor 不得删除 priorityQueue/commitTrack，不得引入 `context-menu:clicked` 推送，也不得把 renderer 传入的任意 label 直接交给 `Menu.buildFromTemplate()`。
