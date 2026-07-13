# Codex 任务包：QinPlayer「我的」页面

## 背景
- QinPlayer 纯本地音乐播放器，Electron + React + TypeScript + Zustand
- 需要新增"我的"页面，展示听歌时长统计和排行榜
- 方案已经过初审+独立二审，主人已确认两个产品选择

## 方案文件
`C:\Users\秋月\Desktop\QinPlayer\docs\plans\PLAN-my-profile.md` — **必须先完整读取**，本任务包只是摘要

## 主人已确认的产品选择
1. **环形图**：改为"本周活跃 N/7"（本周有播放记录的天数/7），不显示无分母的百分比
2. **昵称**：初版固定为"秋月"，不可编辑，头像用现有 SVG 图标

## 约束
- 不新增 npm 依赖、不引入图表库
- 不改 package.json、tsconfig
- 不改 AudioEngine、playerStore、SongList、已有数据库表
- 不改播放次数记账规则、5 秒 currentTime 安全网
- 不把高频 media time 放入 Zustand
- 统计使用本地自然日，禁止 UTC 日期切片
- 注释用中文
- 不要自动 git commit

## 执行顺序

严格按 Task 0 → 1 → 2 → 3 → 4 → 5 → 6 顺序执行。

### Task 0：隔离工作区并建立基线
- `git status --short` 登记已有改动
- `npm run verify` 记录基线
- 不提交、不恢复、不移动用户文件

### Task 1：纯日期统计与 tracker（TDD）
- 新建 `src/utils/listeningStats.ts`（日期格式化、周/月/日聚合、连续天数、活跃天数、近7天、时长格式化）
- 新建 `src/utils/listeningTracker.ts`（真实媒体时间增量采集、30秒批量 flush、跨午夜拆分、StrictMode 安全）
- 新建 `tests/listeningStats.test.ts` + `tests/listeningTracker.test.ts`
- 关键：使用 `Math.min(mediaDelta, wallDelta)` 计算真实播放时间，不按 isPlaying 定时加分钟

### Task 2：schema、repository 与 IPC（TDD）
- 新建 `electron/db/listeningRepository.ts`（建表、increment、getDays、getRanking）
- 新建 `electron/ipc/listening.ts`（三个 IPC handler + feature flag 守卫）
- 修改 `electron/db/database.ts`（调用幂等 schema helper）
- 修改 `electron/main.ts`（import listening IPC）
- 修改 `electron/preload.ts`（invoke 白名单）
- 修改 `src/types/ipc.ts`（类型定义 + 三个通道）
- 新建 `tests/listeningRepository.test.ts` + `tests/listeningIPC.test.ts`
- 关键：`seconds` 字段（不是 minutes），单次增量 1..300，超限切块

### Task 3：接入真实播放事件
- 修改 `src/hooks/useAudioSync.ts`（在 timeupdate 回调中调用 tracker.observe）
- 关键：回调内用 `getState()` 读取实时 flag，不捕获旧闭包
- flush 时机：累计30秒/暂停/切歌/页面刷新
- discard 时机：profile/playback 关闭时
- 扩展 `tests/useAudioSync.test.tsx`

### Task 4：接入 feature flag 与导航
- 新增 `profile` feature flag（默认 true）
- 修改 `src/utils/featureFlags.ts`（key、默认值、导航映射）
- 修改 `src/components/Icons.tsx`（新增 IconUser）
- 修改 `src/components/Sidebar.tsx`（新增导航项）
- 修改 `src/components/Content.tsx`（新增路由分支）
- 消融测试：profile=false 时入口隐藏、路由回退、tracker 0 写、IPC 0 调用

### Task 5：实现页面与样式
- 新建 `src/pages/MyProfile.tsx`（Hero+卡片+排行表格+数据加载）
- 新建 `src/styles/myprofile.css`（响应式布局、环形图、柱状图、排行表格）
- 修改 `src/styles/global.css`（导入 myprofile.css）
- 排行榜使用页面私有 `profile-ranking__*` 类名，不复用 SongList
- 800×600 响应式：Hero 2×2 重排、卡片 2 列
- 30秒刷新 + flush 竞态处理

### Task 6：全量验证与文档
- `npm run verify` 全绿
- Electron UI smoke：深浅主题、1000×680 + 800×600
- 数据 smoke：正常播放、暂停、seek、跨午夜、托盘、旧库迁移
- 更新 SPEC.md + DECISIONS.md + devlog

## 验证命令
```bash
# 完整验证
npm run verify

# 定向测试
npx vitest run tests/listeningStats.test.ts tests/listeningTracker.test.ts tests/listeningRepository.test.ts tests/listeningIPC.test.ts tests/MyProfile.test.tsx tests/useAudioSync.test.tsx tests/featureFlags.test.ts
```

## 需要特别注意
1. **真实播放时间**：从 AudioEngine timeupdate 取 media delta，不是 isPlaying 定时器
2. **本地日期**：用系统本地日期，禁止 UTC slice
3. **flush 串行**：30秒批量写入，失败回补不丢数据
4. **StrictMode 安全**：模块级单例，effect replay 不重复注册
5. **feature flag 全链路**：导航+路由+tracker+IPC handler 都要守卫
6. **不改 SongList**：排行榜用独立表格
7. **800×600 响应式**：Hero 重排，不溢出
8. **旧库兼容**：additive migration，导入旧库重启后补建

## 返回格式
同标准任务包格式：结论、变更、验证、风险、需要主人确认
