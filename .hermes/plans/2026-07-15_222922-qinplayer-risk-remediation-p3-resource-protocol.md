# P3 — `qinplayer://` 受控资源 ID 与 Range 边界

> 前置：P2 已通过 Reviewer；P0 第 2 项 Range 越界策略已由主人确认。
> 目标：Renderer 不再用协议授权任意绝对路径；资源由主进程基于数据库/设置解析。

## 现状证据

- `electron/ipc/protocol.ts` 读取 `searchParams.get('path')`，再额外 `decodeURIComponent`，任意可读绝对路径都可被 Renderer 请求。
- host 没有严格 allowlist；未知 host 会落到音频类型分支。
- Range 只做字符串 split/parseInt，没有 NaN、负数、多段、反向、越界、零长度或 416 处理。
- `electron/preload.ts` 暴露 `getAudioUrl(filePath)`、`getCoverUrl(filePath)`。
- Settings/MyProfile 直接拼 `qinplayer://avatar?path=...`。
- 歌单卡片当前只返回 `coverPath`，没有代表封面的 song ID/mtime。

## 新协议合同

~~~text
qinplayer://audio?id=<positive-song-id>&v=<mtime>
qinplayer://cover?id=<positive-song-id>&v=<mtime>
qinplayer://avatar?id=current&v=<avatar-file-name>
~~~

- `id` 决定授权对象；`v` 只做缓存失效，绝不参与路径解析。
- audio：按 song ID 查询 `songs.file_path`。
- cover：按 song ID 查询 `songs.cover_path`。
- avatar：只读取 `settings.avatarPath`；Renderer 不能提供资源路径。
- `Track.filePath/coverPath` 暂时保留，继续服务歌词路径、歌曲信息、“打开文件所在位置”和是否显示封面；“字段存在”不等于协议授权。
- 生产实现不保留 `?path=` 兼容回退。

## 范围

### 新增

- `electron/db/mediaResourceRepository.ts`
- `electron/ipc/protocolPolicy.ts`
- `tests/mediaResourceRepository.test.ts`
- `tests/protocolPolicy.test.ts`
- `tests/protocol.test.ts`
- `tests/preload.test.ts`

### 修改

- `electron/ipc/protocol.ts`
- `electron/preload.ts`
- `src/types/electron.d.ts`
- `src/types/index.ts`
- `electron/ipc/playlists.ts`
- `src/hooks/useAudioSync.ts`
- `src/utils/mediaSession.ts`
- `src/pages/Lyrics.tsx`
- `src/pages/Albums.tsx`
- `src/pages/Playlists.tsx`
- `src/pages/Settings.tsx`
- `src/pages/MyProfile.tsx`
- `src/components/MiniPlayer.tsx`
- `src/components/MiniQueueView.tsx`
- `src/components/PlayerBar.tsx`
- `src/components/PlaylistPanel.tsx`
- `tests/setup.ts`
- 更新所有现有 URL 断言测试，至少包括：
  - `tests/useAudioSync.test.tsx`
  - `tests/MiniQueueView.test.tsx`
  - `tests/PlaylistPanel.test.tsx`
  - `tests/Playlists.test.tsx`
  - `tests/Albums.test.tsx`
  - `tests/Settings.test.tsx`
  - `tests/MyProfile.test.tsx`
- `SPEC.md`、`harness/CONSTRAINTS.md`、`harness/DECISIONS.md`、`harness/TEST_CONVENTIONS.md`
- 新建 `docs/devlog/devlog-YYYYMMDD-resource-protocol-safety.md`

### 非目标

- 不删除 Track 的本地路径字段，不重做歌词或“打开位置”授权。
- 不改数据库 schema。
- 不做 IPC 全量类型化；P4 处理。
- 不改 Media Session 的 latest-wins 竞态；本阶段只迁移其封面 URL，P5 再修竞态。
- 不新增 MIME 库或其他依赖。

## Task 1：先写资源 resolver 测试

在 `tests/mediaResourceRepository.test.ts` 先覆盖：

1. song ID 只能是正安全整数；0、负数、小数、NaN、Infinity、超出安全整数拒绝。
2. audio 按参数绑定 SQL 查询，未知 ID 返回 not found。
3. cover 按同一 song ID 查询，空 cover 返回 not found。
4. avatar 只从 `settings.avatarPath` 读取，不接受请求 path。
5. audio 必须是受支持扩展的普通文件，并位于注册 music root 的真实路径范围内。
6. cover 必须是 jpg/jpeg/png 普通文件，且是该 song 的受控 cover mapping；允许 `userData/covers` 或该歌曲目录中的本地封面。
7. avatar 必须是 jpg/jpeg/png 普通文件，`realpath` 后位于 `userData/avatar`。
8. 路径 containment 使用 path-aware 规则；`Music` 不匹配 `Music2`，symlink/junction 不能逃出允许范围。
9. 资源类型与扩展名不匹配时拒绝。

在 `electron/db/mediaResourceRepository.ts` 实现最小查询和授权，所有 SQL 参数绑定。不要把 Renderer 的路径重新包装成“token”后照样信任。

## Task 2：先写 Range 与请求解析测试

在 `tests/protocolPolicy.test.ts` 固定：

1. host 只接受 `audio/cover/avatar`。
2. `?path=`、未知 host、缺 id、非整数 id、avatar 非 `current` 返回 400/404，不接触文件流。
3. 只接受 GET/HEAD；其他 method 返回 405。
4. 无 Range：200、准确 Content-Length/Content-Type，含 `Accept-Ranges: bytes`。
5. `bytes=start-end`：start/end 都是非负安全整数，且 `start <= end < size`；`end >= size` 严格返回 416，禁止夹到文件尾。
6. `bytes=start-`：`0 <= start < size` 时到文件尾；`start >= size` 返回 416。
7. `bytes=-suffixLength`：只接受 `1 <= suffixLength <= size`，返回最后 suffixLength bytes；suffix 超过文件大小也返回 416。
8. 多段、非 bytes unit、NaN、负数、空 range、start > end、任一越界、suffix=0、零长度文件的 Range 返回 416。
9. 416 含 `Content-Range: bytes */<size>`，且不创建 read stream。
10. HEAD 与 GET 头一致但没有 body。

把纯解析放在 `electron/ipc/protocolPolicy.ts`，避免测试为一个 Range helper mock 整个 Electron。

## Task 3：实现可注入 handler

`electron/ipc/protocol.ts`：

- 导出可测试的 `createProtocolHandler(deps)`；`registerProtocol` 只负责 `protocol.handle`。
- 先解析 host/id，再调用 repository，最后才 `stat/realpath/createReadStream`。
- `stat.isFile()` 必须为 true。
- 使用异步 fs；不读 Base64，不把整文件放入内存。
- 对 resolver 结果选择明确 Content-Type，不由未知 host 猜测。
- 合法 Range 返回 206；非法/不可满足返回 416；资源不存在/越权返回不泄露绝对路径的 404。
- stream error 必须被记录并转为安全响应；日志不得把路径返回给 Renderer。
- 保持 `registerSchemesAsPrivileged` 在 `app.whenReady` 前的时序不变。

`tests/protocol.test.ts` 用 fake repository + 可控 fs/stream 验证 handler 整体顺序，至少证明拒绝请求不会调用 `createReadStream`。

## Task 4：原子迁移所有 URL 生产者/消费者

preload helpers 改为：

- `getAudioUrl(songId: number, mtime: number)`。
- `getCoverUrl(songId: number, mtime: number)`。
- `getAvatarUrl(avatarPath: string)`：只提取最后一个文件名作为 `v`；URL 固定 `id=current`。

迁移规则：

- Track 场景统一传 `track.id, track.mtime`。
- Albums 在前端分组时派生 `coverSongId/coverMtime`，或明确使用代表封面的第一首 song ID；不要把 cover path 放回 URL。
- `playlists:getAll` 同时查询代表封面的 `song_id` 和 `mtime`，`Playlist` 新增派生字段 `coverSongId: number | null`、`coverMtime: number | null`；不增加数据库列。
- Settings/MyProfile 只调用 `getAvatarUrl(avatarPath)`；不再直接拼 scheme。
- `mediaSession.ts` 本阶段改用 typed cover helper，但保持现有异步流程，P5 再做 generation。
- `tests/setup.ts` 的 mock 和全部字符串断言同步切到 ID URL。

协议、新 helper、类型、所有消费者和测试必须作为一个原子变更落地。不得出现一半 ID、一半 path 的可构建状态。

## Task 5：安全回归搜索

完成后以下搜索必须为 0 个可发布命中；历史文档可保留历史，但 SPEC 必须写新现状：

~~~powershell
rg -n "qinplayer://(audio|cover|avatar)\\?path=|searchParams\\.get\\(['\"]path['\"]\\)|getAudioUrl\\([^,]*filePath|getCoverUrl\\([^,]*coverPath" electron src tests SPEC.md
~~~

额外检查 `v` 从未用于数据库或文件路径解析。

## 自动验收

~~~powershell
npx vitest run tests/mediaResourceRepository.test.ts tests/protocolPolicy.test.ts tests/protocol.test.ts tests/preload.test.ts
npx vitest run tests/useAudioSync.test.tsx tests/MiniQueueView.test.tsx tests/PlaylistPanel.test.tsx tests/Playlists.test.tsx tests/Albums.test.tsx tests/Settings.test.tsx tests/MyProfile.test.tsx
npx tsc --noEmit
node harness/checks.js
npm test -- --reporter=dot
npm run build
git diff --check
~~~

## 真实 Electron 验收

1. 播放 MP3/FLAC/WAV/M4A/OGG 中项目现有样本；切歌、暂停恢复。
2. seek 到开头、中部、接近结尾；检查 206 和最终播放位置。
3. 检查本地音乐、歌词、PlayerBar、Mini、Mini queue、PlaylistPanel、专辑、歌单全部封面。
4. 更换头像后 Settings 立即刷新，进入“我的”仍显示新头像。
5. DevTools 请求旧 `?path=`、未知 ID、类型错配、多段和越界 Range，确认不能读文件且非法 Range 为 416。
6. 打包版本再做一次音频和 seek smoke。

## 文档闭环

- `SPEC.md`：把 path URL 改为 ID/current URL，准确描述 repository、允许范围和 Range。
- `harness/CONSTRAINTS.md`：删除“当前 path 实现尚未满足”的事实说明，保留 ID/受控映射和边界校验永久规则。
- `harness/DECISIONS.md`：记录为何保留 Track path 字段但取消协议 path 授权、`v` 仅缓存、单段 Range 的边界。
- `harness/TEST_CONVENTIONS.md`：protocol/repository/Range 作为主进程必测项。
- devlog：列出所有迁移调用点和真实 Electron 验证。

## Reviewer 阻断清单

- 任何生产路径仍接受 `?path=` 或隐藏兼容 fallback。
- `v` 参与文件解析。
- 仅校验扩展名、不校验 ID mapping/allowed scope/realpath。
- 未知 host 仍落入音频。
- Range 可产生 NaN、负 chunk、越界 stream 或非法 206。
- Playlist/Album 封面继续用绝对路径授权。
- 只改 handler 没有同步 preload、types、tests 和所有消费者。

## 回滚

- protocol handler、repository、preload helper、派生模型字段、所有 Renderer 消费点和测试必须整体回滚。
- 不保留长期双协议兼容作为回滚手段。
- 本阶段无 schema，代码回滚不需要数据恢复。
- 若实现失败，回到 P2 已审状态，不进入 P4。
