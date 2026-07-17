# 2026-07-16 resource protocol safety

## 目标

- 取消 Renderer 通过绝对路径授权本地文件。
- 用数据库/设置中的受控 ID mapping、真实路径范围和严格单段 Range 提供音频、封面与头像。
- 原子迁移 preload、类型、歌单/专辑派生数据和所有 Renderer URL 消费点。

## 修改

- 新增 `mediaResourceRepository`：audio 以 song ID 查询 `file_path` 并限制在注册 music root；cover 以同一 ID 查询 `cover_path`，只允许 `userData/covers` 或歌曲目录；avatar 只读取 `settings.avatarPath` 并限制在 `userData/avatar`。
- 三类资源都要求受支持扩展、普通文件、真实目录 root、`realpath` 和 Windows path-aware containment；SQL 全部参数绑定。
- 新增纯 `protocolPolicy`：host allowlist、GET/HEAD、严格 query 与正安全整数 ID；支持完整响应和三种单段 bytes Range，任一畸形或越界严格返回 416，不 clamp。
- `protocol.ts` 改为可注入 handler；拒绝请求与 HEAD/416 不创建 stream，流打开错误只返回固定安全错误，打开后的读取错误也由包装流记录原始错误并只向消费者暴露固定消息。`registerProtocol` 仅登记 handler，特权 scheme 注册时序未变。
- preload helper 改为 `getAudioUrl(songId, mtime)`、`getCoverUrl(songId, mtime)`、`getAvatarUrl(avatarPath)`；avatar 路径只提取最后一个文件名作为缓存版本。
- `useAudioSync`、Media Session、Lyrics、MiniPlayer、MiniQueueView、PlayerBar、PlaylistPanel、Albums、Playlists、Settings 与 MyProfile 已全部迁移到 ID/current URL。
- Album 在前端分组时保存代表歌曲 ID/mtime；`playlists:getAll` 通过现有关系查询代表封面的 song ID/mtime，无 schema 变更。

## TDD

- Red：4 个新核心测试文件因 repository/policy/handler/helper 不存在或旧 path helper 而全部失败。
- Green：repository、请求/Range、handler、preload 与歌单映射 5 files / 65 tests passed。
- Renderer 迁移定向 7 files / 77 tests passed，覆盖 audio、队列/面板、歌单、专辑和头像 URL。
- 边界覆盖非法 ID、未知 host、旧 path、URL userinfo/path segment、method、Music/Music2、realpath 逃逸、root 非目录、资源类型错配、多段/反向/越界/suffix/零长度 Range、HEAD 错误响应、普通歌单创建映射和 stream 打开失败。

## 自动验证

- `npx tsc --noEmit`：通过。
- `node harness/checks.js`：通过，扫描 electron=23、workers=2、src=59。
- P3 核心：5 files / 65 tests passed。
- P3 Renderer：7 files / 77 tests passed。
- 全量：64 files / 728 tests passed；仅有既有 Vite 配置警告。
- `npm run build`：通过，main、preload 与 Renderer bundle 均生成成功。

## Electron 隔离 smoke

- Electron 31.7.7 / Node 20.18.0 / 真实 `better-sqlite3` / 系统临时目录。
- 临时 SQLite 参数查询成功解析 audio、cover、avatar；真实 `realpath/stat` 和目录范围授权通过。
- 真实文件流 `bytes=2-5` 返回 206、`Content-Range: bytes 2-5/10` 和字节 `[2,3,4,5]`。
- `bytes=0-10` 返回 416 与 `bytes */10`；旧 path 请求返回 400；cover HEAD 返回 200 且 body 为 null。
- 音频原文件未改变；临时数据库、资源目录、入口源码和 bundle 已删除，未触碰用户 profile。

## 未做与风险

- 未在完整 Electron GUI 中逐一播放 MP3/FLAC/WAV/M4A/OGG、拖动 seek 并检查所有页面图片；自动测试覆盖 URL 生产者，真实 handler smoke 覆盖 MP3 文件流。
- 未执行打包版本音频/seek/relaunch smoke。
- symlink/junction 逃逸由可注入 realpath 测试覆盖，隔离 smoke 未创建真实 Windows junction。

## Reviewer

- 首审：Blocker 0、Important 1、Suggestion 2。Important 指出已打开 stream 的后续读取错误会传播底层绝对路径；另建议补齐测试 fixture，并将歌单代表封面查询固化为真实 SQLite 自动测试。
- 已增加 post-open 读取错误脱敏包装与回归测试，并补齐 `Playlist` fixture；真实 SQL 语义已有 Electron 隔离 smoke 和 Reviewer 独立内存 SQLite 验证，自动化测试建议保留为后续增强。
- 短复审：Blocker 0、Important 0、Suggestion 0；确认背压、取消、终止竞态和错误脱敏合同成立，P3 Review gate 通过。
