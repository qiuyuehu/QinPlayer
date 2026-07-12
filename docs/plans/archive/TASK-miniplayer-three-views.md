# Codex 任务包：迷你播放器三视图

## 背景
- QinPlayer 纯本地音乐播放器，Electron + React + TypeScript
- 当前迷你模式只有默认视图（封面+进度条+控制按钮），没有歌词和播放队列视图
- 参考图显示迷你模式可以切换三种视图，底部按钮亮着的就是当前视图

## 目标
- 实现迷你播放器三视图：歌曲、歌词、队列
- 统一播放入口 `playerStore.playTrack()`，消除重复记账
- 抽取共享歌词加载 Hook `useTrackLyrics`
- 固定 400×150 窗口，不随视图切换跳动

## 非目标
- 不把全尺寸 LyricsPanel/PlaylistPanel 嵌入迷你窗口
- 不新增歌词缓存、联网搜索、队列拖拽排序
- 不改变播放模式、淡入淡出、窗口 bounds 持久化
- 不新增 feature flag
- 不修改 `package.json` 依赖

## 相关文件
- `C:\Users\秋月\Desktop\QinPlayer\docs\plans\PLAN-miniplayer-three-views.md` — 完整方案，必须先读
- `C:\Users\秋月\Desktop\QinPlayer\src\components\MiniPlayer.tsx`（263行）— 迷你播放器主组件
- `C:\Users\秋月\Desktop\QinPlayer\src\styles\miniplayer.css`（184行）— 迷你播放器样式
- `C:\Users\秋月\Desktop\QinPlayer\src\pages\Lyrics.tsx`（494行）— 歌词页面（歌词加载逻辑在此）
- `C:\Users\秋月\Desktop\QinPlayer\src\components\PlaylistPanel.tsx`（149行）— 播放队列面板
- `C:\Users\秋月\Desktop\QinPlayer\src\stores\playerStore.ts` — 播放状态管理
- `C:\Users\秋月\Desktop\QinPlayer\src\components\Icons.tsx`（273行）— SVG 图标库
- `C:\Users\秋月\Desktop\QinPlayer\electron\ipc\window.ts` — 迷你模式窗口尺寸

## 约束
- 不新增依赖、不新增 IPC、不修改 preload
- 不把歌词放进 Zustand
- 不动态改变三种视图的窗口尺寸
- 代码加中文注释
- 不要自动 git commit

## 当前方案
方案文件 `docs/plans/PLAN-miniplayer-three-views.md` 经 Codex 审查并重写，包含：
- 7 个 TDD 任务，按顺序执行
- 共享 `useTrackLyrics` Hook（A→B→A 竞态保护）
- 统一 `playerStore.playTrack()` 消除重复记账
- 三段选择器（歌曲/歌词/队列）
- 固定 400×150 壳层
- Feature flag 状态矩阵

## 需要 Codex 做什么
按方案逐 Task 实现：
1. Task 0：基线与保护（git status + 定向测试）
2. Task 1：统一播放入口（playerStore.playTrack）
3. Task 2：抽取共享歌词加载 Hook（useTrackLyrics）
4. Task 3：实现两个紧凑视图与图标（MiniLyricsView + MiniQueueView）
5. Task 4：接入 MiniPlayer 三视图
6. Task 5：布局、主题、拖拽与窗口尺寸
7. Task 6：SPEC/文档更新 + 最终验证

每个 Task 完成后单独跑 `npx vitest run` 相关测试。

## 已验证
- `npx tsc --noEmit` 当前通过
- `npm test`：12 文件 / 145 测试全绿
- `npm run build` 通过

## 需要特别注意
- **竞态保护**：`useTrackLyrics` 必须有 request token，A→B→A 快速切歌时迟到结果不能覆盖
- **播放记账统一**：`playTrack` 必须原子完成（currentTrack + duration + isPlaying + recordPlay + updatePlayCount）
- **RAF 共享**：一个 RAF 同时更新进度条和歌词索引，不重复注册
- **Feature flag 回退**：`lyrics=false` 时歌词按钮隐藏，若当前为歌词视图自动回到歌曲视图
- **拖拽区域**：所有按钮和队列行必须 `no-drag`，其余壳层保留 drag
- **主题变量**：只使用 `themes.css` 已有 token，不用 `rgba(255, 255, 255, ...)`

## 返回格式

```
## 结论
已完成 / 需要返工 / 需要主人确认

## 变更
- 改了哪些文件
- 改了什么行为

## 验证
- 每个 Task 的测试结果
- 最终 npm run verify 结果
- 哪些没跑，为什么

## 风险
- 仍需注意的问题

## 需要主人确认
- UI/体验/产品取舍
```
