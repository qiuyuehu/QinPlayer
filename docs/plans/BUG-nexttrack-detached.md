# 修复：nextTrack() 处理 currentTrack 不在 playlist 中的情况

## 审查结论

| 问题 | 当前源码事实 | 本版修正 |
|------|-------------|---------|
| nextTrack()在currentTrack不在playlist中时直接return | `removeFromPlaylist()`移除当前歌曲后，currentTrack不在playlist中，currentIndex=-1，nextTrack()直接return | nextTrack()在currentIndex < 0时检查detachedPlaylistIndex，从successor恢复 |

## 问题

`removeFromPlaylist()` 移除当前歌曲后，currentTrack 不在 playlist 中。歌曲播放结束时：
1. ended 检测到 `currentIsDetached`，调用 `nextTrack()`
2. `nextTrack()` 检查 `currentIndex = playlist.findIndex(...)` 得到 -1
3. `if (currentIndex < 0) return` — 直接返回，不播放下一首

## 根因

`nextTrack()` 没有处理 `currentIndex < 0` 的情况。之前的代码不需要处理这个场景，因为 currentTrack 总是在 playlist 中。这次新增的 `removeFromPlaylist()` 引入了这个场景。

## 契约：nextTrack() 在 currentTrack 不在 playlist 中时的行为

```text
前提：currentIndex = playlist.findIndex(t => t.id === currentTrack.id) < 0

规则：
1. detachedPlaylistIndex !== null && playlist.length > 0
   → 从 playlist[detachedPlaylistIndex] 恢复，清空 detachedPlaylistIndex
2. detachedPlaylistIndex !== null && playlist.length === 0
   → 清空所有状态，不播放
3. detachedPlaylistIndex === null
   → 不播放（现有行为）
```

## 约束

- 不新增依赖
- 不改 database schema、IPC 通道、feature flags
- 不改 useAudioSync 的 ended 逻辑
- 不改其他组件（SongList、PlaylistPanel、MiniQueueView 等）
- 注释用中文
- 不要自动 git commit

## 改动范围

| 类型 | 文件 | 改动 |
|------|------|------|
| Modify | `src/stores/playerStore.ts` | nextTrack() 增加 currentIndex < 0 分支处理 |
| Modify | `tests/playerStore.test.ts` | 补充测试：移除当前歌曲后 ended 恢复 |

明确不修改：useAudioSync.ts、其他组件、数据库、IPC

## 实现

```typescript
// 当前代码（有问题）：
const currentIndex = playlist.findIndex((track) => track.id === currentTrack.id)
if (currentIndex < 0) return

// 修复后：
const currentIndex = playlist.findIndex((track) => track.id === currentTrack.id)
if (currentIndex < 0) {
  // currentTrack 已被移出 playlist，尝试从 detached 恢复
  if (detachedPlaylistIndex !== null && playlist.length > 0) {
    const successorIndex = normalizePlaylistIndex(detachedPlaylistIndex, playlist.length)
    commitTrack(playlist[successorIndex], {
      priorityResumeTrackId: null,
      priorityConsumedTrackIds: [],
      detachedPlaylistIndex: null,
    })
  }
  return
}
```

## 测试

补充 `tests/playerStore.test.ts`：

1. 移除当前歌曲后，nextTrack() 从 detachedPlaylistIndex 恢复
2. 移除当前歌曲且 playlist 为空时，nextTrack() 不执行
3. 移除当前歌曲且 detachedPlaylistIndex 为 null 时，nextTrack() 不执行

## 验收标准

1. `npx vitest run tests/playerStore.test.ts` 全绿
2. `npx tsc --noEmit` 通过
3. `npm run verify` 全绿
4. 手动验证：移除当前歌曲后，歌曲播放结束时自动播放下一首

## 手动测试

1. 播放歌曲A，打开播放队列
2. 右键歌曲A → "从播放列表移除"
3. 等歌曲A播放结束
4. 预期：自动播放下一首歌曲，不卡住

## 独立程序员视角自审

| 自审问题 | 处理结果 |
|---------|---------|
| nextTrack()在currentIndex < 0时会做什么？ | 按契约：有detachedPlaylistIndex就恢复，没有就不播放 |
| detachedPlaylistIndex在什么情况下有效？ | removeFromPlaylist()移除当前歌曲或恢复锚点时设置 |
| 修复后会不会影响其他场景？ | 不会，只在currentIndex < 0时触发，之前这个分支直接return |
| 需要改useAudioSync的ended逻辑吗？ | 不需要，ended已经正确检测currentIsDetached并调用nextTrack() |

**自审结论：** 方案已具备可实施性；无剩余风险。改动范围小（10行代码），只在currentIndex < 0分支增加detachedPlaylistIndex检查。

## 验证

```bash
npx vitest run tests/playerStore.test.ts
npx tsc --noEmit
npm run verify
```
