# Devlog — 2026-07-12 「我的」页面

## 改动内容

### 新增「我的」页面（MyProfile）
- 个人信息（头像、昵称"秋月"、累计听歌时长、起始日期）
- 本周活跃环形图（N/7，纯 CSS conic-gradient）
- 今日/本周/本月/连续听歌时长
- 近 7 天听歌趋势柱状图（纯 CSS）
- 总计/本月/本周/今日时长统计卡片
- 全部时间播放排行 Top 10（私有表格，不修改 SongList）
- `profile` feature flag 控制入口和数据采集

### 真实播放时间采集
- 从 AudioEngine timeupdate 取真实媒体时间增量
- `Math.min(mediaDelta, wallDelta)` 计算，防止 seek 虚增
- 秒级精度，30 秒批量落库
- 跨本地午夜按墙钟区间拆分
- flush 串行化，失败批次精确回补

### 新增文件
- `electron/db/listeningRepository.ts` — SQLite repository
- `electron/ipc/listening.ts` — IPC handler
- `src/utils/listeningStats.ts` — 日期统计纯函数
- `src/utils/listeningTracker.ts` — 播放时间采集器
- `src/pages/MyProfile.tsx` — 页面组件
- `src/styles/myprofile.css` — 页面样式
- `tests/listeningRepository.test.ts`
- `tests/listeningIPC.test.ts`
- `tests/listeningStats.test.ts`
- `tests/listeningTracker.test.ts`
- `tests/MyProfile.test.tsx`

### 修改文件
- `electron/db/database.ts` — 调用幂等 schema helper
- `electron/main.ts` — import listening IPC
- `electron/preload.ts` — invoke 白名单
- `src/types/ipc.ts` — 类型定义 + 三个通道
- `src/utils/featureFlags.ts` — `profile` flag
- `src/hooks/useAudioSync.ts` — 接入 tracker
- `src/components/Icons.tsx` — 新增 IconUser
- `src/components/Sidebar.tsx` — 新增导航项
- `src/components/Content.tsx` — 新增路由分支
- `src/styles/global.css` — 导入 myprofile.css

## 验证
- npm run verify：Harness、生产构建、39 文件 / 384 测试全绿
- 深浅主题和 800×600 视觉检查待补

## 决策记录
- 环形图改为"本周活跃 N/7"（主人已确认）
- 昵称初版固定为"秋月"（主人已确认）
- 排行榜只做全部时间（现有 play_count）
- 详见 harness/DECISIONS.md
