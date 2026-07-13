# Devlog：2026-07-13 下一首播放、来源移除与 Mini 原生菜单

## 问题/目标

- 原“添加到接下来播放”按 FIFO 追加，不符合真正“下一首播放”的最后选择优先语义。
- 从会话播放列表移除当前曲或 priority 恢复锚点后，旧导航会因 `currentIndex === -1` 停住，loop 还可能重播已移除歌曲。
- Mini 固定 `400×150`，HTML 右键菜单会被 BrowserWindow 边界裁剪。

## 最终方案

- 保留 `priorityQueue`、resume、consumed 与内部 `commitTrack`，新增 `insertNext()`，去重后提升到队首。
- 新增非持久化 `detachedPlaylistIndex`；移除当前曲/恢复锚点时保存 successor，next/prev/ended 消费后清理。
- 最后一首来源被移除时游标为 `null`，`useAudioSync` 额外核对当前曲是否仍属于 playlist，确保 loop 停止而不是重播。
- 主窗口继续使用主题化 HTML `ContextMenu`；Mini 使用 `context-menu:show-track` invoke 返回 `action | null`。
- 主进程固定中文 label，校验 sender、窗口生命周期、action/enabled、重复项和单 pending；renderer 捕获右键目标并用 request token 忽略卸载后的旧结果。

## 修改内容

- Store：LIFO 下一首、会话来源移除、detached 导航和清理语义。
- 自然结束：priority/resume/detached/current-not-in-playlist 均优先于 loop。
- 主窗口：菜单文案统一为“下一首播放”，PlaylistPanel source/priority 分别移除各自集合。
- Electron：新增原生菜单 IPC、共享 action 类型、preload invoke 白名单和 main 注册。
- Mini：新增原生菜单 Hook，移除 HTML ContextMenu，保留 SongInfoDialog 与 queue-only selector 边界。

## 验证结果

- 定向测试：9 个文件、177 项测试通过。
- `npx tsc --noEmit`：通过。
- `npm run verify`：Harness 通过、生产构建通过、51 个测试文件 / 505 项测试通过。
- 未新增 npm 依赖、数据库字段、推送通道或自动提交。

## 新增测试

- `playerStore`：insert-next 提升、去重、detached 连续删除、三种模式、prev、clear 与记账。
- `useAudioSync`：loop/detached、最后一首移除停止、resume 被移除和 transition guard。
- 主窗口 Hook/组件：菜单差异、flags、懒加载、动作路由和 source/priority 移除隔离。
- 主进程 IPC：sender/payload 校验、固定 label、取消、双 settle、pending、异常恢复和窗口销毁。
- Mini Hook/组件：entries、六种 action、并发、null/reject、unmount、Dialog 和 queue-only subscription。

## 主人手动验收

- sequential/shuffle/loop 下连续选择 A、B 后应按 B、A 播放并正确恢复。
- 移除普通、当前、恢复锚点和最后一首来源时，当前音频与后续导航符合方案。
- Mini 原生菜单可越过窗口边界；快速连续右键、取消、Escape、切换视图不产生陈旧动作。
- 主窗口 SongList/PlaylistPanel 仍使用原主题菜单。

## 后续审查

- 该任务涉及核心播放状态和跨进程 IPC，需交固定 Codex Reviewer 做独立代码审查。
