# QinPlayer「我的」页面：听歌时长与排行榜实施方案

> **For Hermes Agent:** 本任务跨越播放事件、日期统计、SQLite、IPC、feature flag、导航与 UI，属于中高风险功能。严格按 Task 顺序 TDD 实施；主人确认本方案前不得编码，不自动提交 Git。
>
> 创建：2026-07-12
> 修订：2026-07-12（Codex 初审后重写，并完成独立二审）
> 状态：主人已确认，可执行

## 1. 初审结论

原方案的布局方向可以保留，但数据口径、接线范围和测试设计不足，不能直接实施。

| 原方案内容 | 问题 | 完善后的处理 |
|---|---|---|
| 每 60 秒按 `isPlaying` 加 1 分钟 | `isPlaying` 是意图状态；加载失败、缓冲和拖动都可能误计，且不足 1 分钟全部丢失 | 从 AudioEngine 的真实 `timeupdate` 媒体时间增量采集，内存保留小数秒，整秒批量落库 |
| 采集放在 `playerStore.ts` | 播放 Store 不应拥有计时器、日期拆分和 SQLite 写入职责 | 新建独立 tracker；`useAudioSync` 只转发真实媒体事件和生命周期边沿 |
| `minutes INTEGER` | 精度过低，频繁暂停或退出会系统性漏计 | 保存非负整数 `seconds` |
| `toISOString().slice(0, 10)` | 使用 UTC 日期，中国时区凌晨会记入前一天 | 统一使用本地日历日期 helper，禁止用 UTC 字符串切日 |
| 日期减去 `86400000` | 夏令时地区并不总是 24 小时自然日 | 使用本地 `Date#setDate()` 与本地午夜边界 |
| “本周听歌占比 62%” | 没有分母，属于不可解释的展示数据 | 环形图改为“本周活跃”，显示本周有记录天数 `N/7` |
| `listening:getRanking week` 测试 | IPC 只有 `{ limit }`，初版又声明只有全部时间，前后矛盾 | 初版排行榜明确只使用已有 `songs.play_count` 的全部时间 Top 10 |
| 复用 `SongList` 显示播放次数 | 当前 `SongList` 固定为时长/收藏列，还会加载歌单和收藏、挂虚拟列表与右键菜单 | 不修改 `SongList`；在 MyProfile 内实现最多 10 行的独立语义表格，使用独立 CSS 命名 |
| “不改数据库 schema（只新增表）” | 新增表就是 schema 变更 | 明确为幂等、向后兼容的 additive schema migration |
| 只列 `src/types/ipc.ts` | 新 invoke 通道会被 preload 白名单拦截 | 同步更新 `electron/preload.ts` 和 IPC 类型测试 |
| 只改 Sidebar/Content | 现有导航受 feature flag 守卫；漏接会违反“完整禁用” | 新增 `profile` flag，并更新类型、默认值、解析、导航映射与消融测试 |
| Hero 四块固定横排 36px | 最小 800px 窗口的内容宽度不足，会溢出 | 1000×680 保留横排；800×600 自动重排为两列，不出现横向滚动 |
| 页面挂载时查询一次 | 页面停留期间统计不会更新 | 页面进入和每 30 秒刷新；刷新前请求 tracker flush，卸载时清理 timer |

## 2. 背景

QinPlayer 已有歌曲总播放次数，但没有“实际播放了多久”的日维度数据。新页面需要展示本地、可解释、可长期保存的个人听歌概览，同时保持播放器纯本地、不引入图表依赖、不污染高频 Zustand 状态。

HTML 预览 `docs/plans/preview-my-profile.html` 只作为构图参考；其中的模拟数字、硬编码颜色、10px 圆角、排行榜 Tab 和固定横排不直接复制到生产代码。

## 3. 当前状态

- `useAudioSync` 已在 AudioEngine `timeupdate` 回调中取得真实 media time，并写入模块级 `currentTimeRef`。
- `playerStore.isPlaying` 表示播放意图，不能单独证明音频时间正在前进。
- `songs.play_count` 已由现有播放入口维护，可用于全部时间排行榜；项目没有逐次播放事件表，无法正确计算本周/本月播放次数。
- `SongList` 的列和行为固定为歌曲浏览场景，不支持播放次数列，也不适合仅 10 行的统计表。
- 数据库在 `initDatabase()` 中通过 `CREATE TABLE IF NOT EXISTS` 做幂等 additive migration。
- 所有 renderer invoke 通道必须同时进入 `IpcChannels` 和 preload `INVOKE_CHANNELS`。
- 导航受 `FeatureFlags`、`NAV_FLAG_MAP` 与 `isNavAllowed()` 统一保护。
- 当前工作区存在用户正在进行的计划归档和 `package.json` 修改。本任务不得恢复、覆盖或夹带这些改动。

## 4. 已确定的产品语义

### 4.1 什么算听歌时长

只有媒体播放位置真实向前推进的时间才计入：

- 播放且 media time 前进：计入。
- 暂停、加载、缓冲、播放失败：不计。
- 向前拖动：不能把跳过的歌曲区间计入；只允许计入两次事件之间真实经过的墙钟时间。
- 向后拖动、切歌、循环回到 0：重置采样基线，不产生负数或额外时长。
- 静音但媒体仍在播放：计入；统计的是播放时长，不判断用户是否真的听见。
- 隐藏到托盘继续播放：计入。

每个采样区间使用：

```ts
countedSeconds = Math.min(positiveMediaDelta, positiveWallClockDelta)
```

media delta 为 0/负数或任一时间无效时，只重置基线，不累计。跨本地午夜的区间按墙钟区间比例拆到两个自然日。

### 4.2 日期与周期

- 日期键：用户系统本地日期 `YYYY-MM-DD`。
- 一周：周一 00:00 到当前时刻。
- 一月：本地时间当月 1 日 00:00 到当前时刻。
- 近 7 天：今天以及之前 6 个本地自然日，缺失日期补 0。
- 连续听歌：每天累计至少 1 秒即算活跃。今天有记录则从今天倒数；今天尚无记录但昨天有记录，则从昨天倒数，避免每天刚开始时把连续记录显示成 0。
- “开始记录”：`listening_stats` 最早非零日期；无记录时显示“尚无记录”。

### 4.3 环形图

初版不展示没有分母的百分比。保留环形视觉，但语义改为：

- 标题：`本周活跃`
- 中心：`N/7`
- 环形进度：本周活跃自然日数 / 7
- 辅助文本：`活跃天数`

### 4.4 排行榜

- 初版仅显示“全部时间 Top 10”，不显示本周/本月 Tab。
- 数据来源是现有 `songs.play_count`，不是 `listening_stats`。
- 只显示 `play_count > 0` 的歌曲；排序为 `play_count DESC, id ASC`，保证并列时稳定。
- 列为名次、标题、歌手、播放次数。
- 播放功能开启时，双击或键盘 Enter 播放该曲，并把 Top 10 结果设为当前队列；播放关闭时列表只读。

### 4.5 个人信息

- 初版昵称固定显示预览已确认的“秋月”，不可编辑，不新增账户或资料设置。
- 头像使用现有 SVG 人物图标和 CSS 背景，不读取网络或本地私人图片。
- “自某日开始”来自第一条统计记录，不伪造安装日期。

## 5. 目标行为

1. 侧边栏新增“我的”，点击进入统计页面。
2. 页面展示个人摘要、本周活跃环、今日/本周/连续天数、近 7 天趋势、总/月/周/日四项时长和全部时间 Top 10。
3. 统计基于真实媒体时间前进，不因暂停、缓冲、seek 或切歌虚增。
4. 秒级数据按本地自然日聚合，跨午夜、月初、周一和 DST 日历操作正确。
5. 每累计 30 秒触发一次批量写入；暂停、切歌和页面刷新时主动 flush，不创建 tracker 常驻 interval。profile/playback 被关闭时立即丢弃未落库 pending 并 reset，保证禁用后 0 IPC。
6. IPC 写失败不会丢掉尚未持久化的整秒，失败批次合并回待写队列，等待下次 flush。
7. `profile=false` 时隐藏导航、阻止路由并停止新增统计；历史数据保留。
8. 亮色、暗色、1000×680 和最小 800×600 均无重叠或横向滚动。

## 6. 非目标

- 不新增图表库或 npm 依赖，不修改 `package.json`。
- 不实现头像上传、昵称编辑、账号、云同步或联网能力。
- 不从既有 `play_count` 反推历史听歌时长；统计从本功能启用后开始，没有可靠历史数据就不回填。
- 不实现本周/本月歌曲排行；这需要独立的逐曲播放事件模型。
- 不修改现有 `SongList`、播放记账规则、AudioEngine、`currentTimeRef` 所有权或 5 秒恢复进度安全网。
- 不把高频 media time 或统计秒数放入 Zustand。
- 不新增“清空统计”操作；歌曲库清空后日时长历史保留，排行榜因 songs 被删除而为空。
- 不把预览中的模拟数字、硬编码颜色或排行榜 Tab 带入生产代码。

## 7. 数据模型与迁移

### 7.1 新表

```sql
CREATE TABLE IF NOT EXISTS listening_stats (
  local_date TEXT PRIMARY KEY,
  seconds INTEGER NOT NULL DEFAULT 0 CHECK (seconds >= 0)
) WITHOUT ROWID;
```

- `local_date` 由 renderer 的本地日期 helper 生成，主进程再次严格校验真实日历日期。
- `seconds` 只接受 `1..300` 的整数增量；超范围、NaN、非法日期直接拒绝并记录中文错误。
- 单次 flush 若某日期累计超过 300 秒，tracker 必须拆成多个不超过 300 秒的顺序增量，不能把超限值直接交给 IPC。
- 主键已满足按日期读取，无需额外索引。
- 迁移只新增表，不修改已有表和数据。
- 整库导出自然包含新表；导入旧版数据库并重启后，`initDatabase()` 会补建该表。

### 7.2 数据层边界

新建 `electron/db/listeningRepository.ts`，负责：

```ts
ensureListeningStatsTable(db): void
incrementListeningSeconds(db, input): void
getListeningDays(db): ListeningDay[]
getListeningRanking(db, limit): ListeningRankingEntry[]
```

IPC handler 只做 feature flag/参数校验、调用 repository 和错误日志，不在 handler 内散落 SQL。repository 接受数据库实例，便于用 in-memory SQLite 做真实查询测试。tracker 核心通过 factory/class 注入 `persist(date, seconds)`，单测创建隔离实例；生产环境只导出一个绑定 IPC 的单例和显式 flush/reset API。

## 8. IPC 契约

共享类型放入 `src/types/ipc.ts`：

```ts
interface ListeningDay {
  date: string
  seconds: number
}

interface ListeningRankingEntry {
  track: Track
  playCount: number
}
```

| 通道 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `listening:addSeconds` | `{ date: string; seconds: number }` | `void` | 原子 UPSERT 累加整秒 |
| `listening:getDays` | `void` | `ListeningDay[]` | 按日期升序返回全部日记录 |
| `listening:getRanking` | `{ limit: number }` | `ListeningRankingEntry[]` | 全部时间稳定排序，limit 限制为 1..50 |

三个通道必须同步加入 `electron/preload.ts` 的 `INVOKE_CHANNELS`。`registerListeningIPC()` 接收主进程 feature flag getter：读取通道要求 `profile=true`，写入通道同时要求 `profile=true && playback=true`；否则在访问 repository 前拒绝。不能只依赖 renderer 不发请求。不新增专用 contextBridge 方法，renderer 继续使用统一 typed invoke 入口。

## 9. 运行时数据流

```text
AudioEngine timeupdate
  → useAudioSync 确认 playback/profile 开启、同一曲目且 engine.playing
  → listeningTracker.observe(mediaTime, wallClockMs)
  → 计算真实向前增量并按本地午夜拆分
  → 内存 Map<localDate, fractionalSeconds>
  → 累计满 30 秒 / 暂停 / 切歌 / 页面刷新时 flush
  → profile/playback 关闭时 discard pending + reset，0 IPC
  → 逐日 listening:addSeconds
  → SQLite UPSERT

MyProfile mount / 30 秒刷新
  → 先等待 tracker 当前 flush 完成
  → Promise.all(listening:getDays, listening:getRanking)
  → 纯函数计算总/月/周/日、连续天数、活跃天数、近 7 天
  → 页面渲染
```

flush 必须串行化：正在写入时的新增秒数进入下一批；失败的整秒合并回对应日期，不覆盖期间新累计的数据。每个日期不足 1 秒的余数留在内存中，不能提前取整丢失。每个日期的大批次按最大 300 秒切块，某块失败时只回补该块和其未发送后续块，不能重复回补已成功块。

## 10. 文件改动范围

### 新建

- `electron/db/listeningRepository.ts`
- `electron/ipc/listening.ts`
- `src/utils/listeningStats.ts`
- `src/utils/listeningTracker.ts`
- `src/pages/MyProfile.tsx`
- `src/styles/myprofile.css`
- `tests/listeningRepository.test.ts`
- `tests/listeningIPC.test.ts`
- `tests/listeningStats.test.ts`
- `tests/listeningTracker.test.ts`
- `tests/MyProfile.test.tsx`

### 修改

- `electron/db/database.ts` — 调用幂等 schema helper。
- `electron/main.ts` — import 并调用 `registerListeningIPC(() => currentFeatureFlags)`。
- `electron/preload.ts` — invoke 白名单。
- `src/types/ipc.ts` — feature flag、共享统计类型和三个通道。
- `src/utils/featureFlags.ts` — `profile` 默认值、key 列表和导航映射。
- `src/hooks/useAudioSync.ts` — 在既有事件和生命周期边沿调用 tracker，不重写音频逻辑。
- `src/components/Icons.tsx` — 新增与现有 stroke 风格一致的 `IconUser`。
- `src/components/Sidebar.tsx` — 新增 `profile` 导航项。
- `src/components/Content.tsx` — 新增受守卫的 MyProfile 分支。
- `src/styles/global.css` — 导入 `myprofile.css`，顺序位于页面样式区、`motion.css` 之前。
- `tests/useAudioSync.test.tsx`
- `tests/featureFlags.test.ts`
- `tests/Sidebar.test.tsx`
- `tests/uiStore.test.ts`
- `tests/ContentMotion.test.tsx`
- `SPEC.md`
- `harness/DECISIONS.md`

明确不修改：`package.json`、tsconfig、AudioEngine、playerStore、SongList、已有数据库表、播放次数记账、5 秒 currentTime 保存。

## 11. 实施步骤

## Task 0：隔离工作区并建立基线

1. 运行 `git status --short`，登记计划归档、`package.json` 和预览文件等已有改动的归属。
2. 不提交、不恢复、不移动任何用户已有文件；本任务 diff 只允许出现第 10 节文件。
3. 运行：

```bash
npm run verify
```

记录当前 Harness、构建、测试数量与已有失败。基线失败时先停止，不把旧失败混入本功能。

## Task 1：先实现纯日期统计与 tracker

**Tests first:** `tests/listeningStats.test.ts`、`tests/listeningTracker.test.ts`

日期统计覆盖：

1. 本地日期格式化不使用 UTC；模拟 UTC+8 凌晨不落到前一天。
2. 周一起点、月初、跨年和闰日。
3. 近 7 天缺失补 0，最大值为 0 时所有柱高为 0，不产生 NaN。
4. 总/月/周/日秒数聚合。
5. 连续记录从今天或昨天开始，两者都无记录时为 0。
6. 活跃环为 `activeDays / 7`，结果 clamp 到 0..1。
7. 时长格式化覆盖 0 秒、59 秒、60 秒、超过 100 小时。

tracker 覆盖：

1. 首次样本只建基线，不计时。
2. 正常播放按 `min(mediaDelta, wallDelta)` 累计。
3. pause/stall、负 delta、向前/向后 seek、切歌和循环归零不会虚增。
4. 跨本地午夜按两个日期拆分，不用固定 86400000ms。
5. 小数秒余数跨多次 flush 仍保留。
6. 累计 30 秒阈值只触发一条串行 flush 链，tracker 本身不创建 setInterval。
7. flush 期间继续累计不会被旧批次清空。
8. 单日写失败会合并回队列，其他日期仍可成功；同日某块失败后跳过该日后续块但继续其他日期，禁止空 catch。
9. 超过 300 秒的单日 pending 正确切块；中间块失败时不重发已成功块。
10. reset/disable/StrictMode replay 不重复样本或 flush；生产单例和测试实例均可显式 reset。

Run：

```bash
npx vitest run tests/listeningStats.test.ts tests/listeningTracker.test.ts
npx tsc --noEmit
```

## Task 2：实现 schema、repository 与 IPC

**Tests first:** `tests/listeningRepository.test.ts`、`tests/listeningIPC.test.ts`

1. 使用 `new Database(':memory:')` 验证建表幂等，不依赖 Electron userData。
2. 同一天多次 increment 原子累加，不覆盖。
3. 非法日期、0、负数、小数、NaN、Infinity、超过 300 秒和非法 limit 被拒绝。
4. 日记录按 `local_date ASC` 返回。
5. 排行榜只含 play_count > 0，按 count DESC/id ASC，limit 生效。
6. 删除歌曲后排行榜消失，但 listening_stats 保留。
7. handler 每个异常路径输出中文上下文并 reject，不吞异常；profile=false 时三个通道均不访问 repository，playback=false 时 addSeconds 不访问 repository。
8. `database.ts` 初始化调用 schema helper；旧数据库缺表时可补建。
9. 三个通道同时更新 IpcChannels 和 preload 白名单。

Run：

```bash
npx vitest run tests/listeningRepository.test.ts tests/listeningIPC.test.ts tests/harnessChecks.test.ts
npx tsc --noEmit
```

## Task 3：接入真实播放事件

**Files:** `src/hooks/useAudioSync.ts`、`src/utils/listeningTracker.ts`、对应测试。

1. 保持现有 `currentTimeRef`、duration、ended、seek 和淡入淡出逻辑原样。
2. `onTimeUpdate` 只有在 `playback && profile && engine.playing`、非 track transition 时调用 observe；由于引擎回调只注册一次，必须通过 `useUIStore.getState()` / `usePlayerStore.getState()` 读取实时 flag、曲目与播放状态，禁止捕获首次 render 的旧闭包。
3. observe 同时接收稳定 track key；发现 key 变化时先结束旧样本，新曲第一帧只建基线。
4. currentTrack 变化前 flush + reset；新曲第一帧只建基线。
5. isPlaying true→false 时 flush + reset；profile/playback true→false 时 discard pending + reset，不调用 listening IPC。
6. 播放恢复只重建样本，不补算暂停间隔。
7. 生产 tracker 为模块级单例且不创建常驻 interval；React StrictMode effect replay 不能重复注册采样或 flush。
8. 应用异常退出最多丢失未 flush 的 30 秒；不得声称异步 beforeunload 可以保证零丢失。

在 `tests/useAudioSync.test.tsx` 增加：正常推进、缓冲不动、seek、切歌、暂停、功能关闭、StrictMode、失败恢复。使用 fake timers 和可控 media/wall time，不等待真实 30 秒。

Run：

```bash
npx vitest run tests/useAudioSync.test.tsx tests/listeningTracker.test.ts
```

## Task 4：接入 feature flag 与导航

1. 新增 `FeatureFlagKey = 'profile'`，默认 true。
2. `FEATURE_FLAG_KEYS`、`FeatureFlags`、默认值和 normalize 同步更新。
3. `NAV_FLAG_MAP.profile = 'profile'`。
4. Sidebar 使用 `IconUser`，顺序为“我喜欢的”之后、“设置”之前。
5. Content 只有 resolvedNav 为 profile 且 flag 开启时渲染 MyProfile；关闭时统一回退 local，并在 `tests/ContentMotion.test.tsx` 锁住路由行为。
6. `profile=false` 同时验证：入口隐藏、直接设 nav 被守卫、tracker 0 写、主进程 listening handler 0 repository 调用、其他 16 个 flag 不受影响；`playback=false` 时读取统计可用但 addSeconds 被主进程阻止。

Run：

```bash
npx vitest run tests/featureFlags.test.ts tests/Sidebar.test.tsx tests/uiStore.test.ts tests/ContentMotion.test.tsx
```

## Task 5：实现页面与样式

### 数据加载

- mount 时执行一次 `refreshDashboard()`；先 flush tracker，再并行读取 days/ranking。
- 页面可见期间每 30 秒刷新，unmount 清 timer。
- 使用 request generation 或 mounted guard，旧 Promise 不得覆盖新结果或在卸载后 setState。
- 分离 loading、error 和有数据但排行榜为空三种状态；失败显示简短错误和重试按钮。
- 时长全为 0 时仍渲染完整骨架数值；排行榜显示“暂无播放记录”。

### 页面结构

- 页面标题“我的”。
- Hero 为无外框布局，不套装饰卡片；头像、活跃环、核心时长、趋势按预览顺序。
- 四个统计项是同级重复卡片，圆角不超过 8px，不嵌套卡片。
- 排行榜是页面内独立表格，使用 `profile-ranking__*` 类，不复用或覆盖 `song-list__*`。
- 表格行在 playback 开启时支持双击和 Enter 播放；焦点样式清晰。

### 响应式与主题

- 1000×680：Hero 单行，保持四块 36px 的视觉间距。
- 800×600：Hero 自动变为 2×2；统计卡片变为 2 列；排行榜歌手列可收窄但不与播放次数重叠。
- 不按 viewport 缩放字体；使用稳定 grid track、minmax、tabular-nums 和文本省略。
- 所有颜色来自现有 CSS 变量；预览中的棕色/金色硬编码不复制。
- 入场只复用全局 motion token；reduced motion 下无柱子/环形补间等待。
- 环和柱图必须有文本值/`aria-label`，不能只靠颜色表达。

`tests/MyProfile.test.tsx` 覆盖：

1. loading、error/retry、零数据和完整数据。
2. 固定昵称、首条记录日期、四周期统计、连续天数、N/7 环和 7 根柱。
3. 缺失日期补 0，柱高无 NaN/Infinity。
4. Top 10 稳定顺序、播放次数列、空排行。
5. playback 开启时双击/Enter 设置队列并播放；关闭时只读。
6. 30 秒刷新、flush 顺序、旧请求竞态和 unmount timer cleanup。

Run：

```bash
npx vitest run tests/MyProfile.test.tsx tests/ContentMotion.test.tsx
npx tsc --noEmit
```

## Task 6：全量验证、UI smoke 与项目记忆

### 自动验证

```bash
npm run verify
git diff --check
```

Expected：Harness、main/preload/renderer build、全量 Vitest 全绿，0 failed。

### Electron UI smoke

1. 深色和亮色各截图 1000×680、800×600。
2. 检查 Hero、卡片、排行榜无横向滚动、重叠、截字或跳动。
3. 检查正常 motion、手动 reduced motion、系统 reduced motion。
4. 键盘进入排行榜行并按 Enter，焦点可见且播放正确。
5. profile flag 关闭后入口消失，已有 profile nav 启动时回退 local。

### 数据 smoke

1. 正常播放 35 秒后暂停，今日统计约增加 35 秒，不要求等待整分钟。
2. 暂停 30 秒、缓冲模拟、向前/向后 seek 均不虚增。
3. 隐藏到托盘播放超过 30 秒后返回，时长继续增加。
4. 跨本地午夜播放，两个日期均得到合理秒数。
5. 重启后统计保留；导出并导入当前数据库后保留。
6. 导入不含新表的旧数据库并重启，页面正常显示 0 数据。
7. 清空歌曲后日时长仍在，排行榜为空。

### 文档

- `SPEC.md`：新增 profile flag、页面行为、统计口径和数据保留语义。
- `harness/DECISIONS.md`：记录真实媒体增量、本地日期、30 秒批量 flush 和排行榜沿用 play_count 的决策。
- 新建 `docs/devlog/devlog-20260712-my-profile.md`：记录实际排查、错误假设、测试与 UI 截图结果。

## 12. 验收标准

1. `npm run verify` 全绿，0 failed。
2. 三个 listening invoke 通道均有类型、白名单、handler 和测试。
3. schema migration 幂等，旧库升级不丢数据。
4. 正常媒体推进计时；暂停、缓冲、seek、切歌、循环和播放失败不虚增。
5. 跨本地午夜、周一、月初、闰日统计正确，不使用 UTC 日期切片或固定 86400000ms。
6. flush 串行、超限切块、失败批次精确回补，不丢并发新增秒数，不产生 StrictMode 重复采样。
7. `profile=false` 时入口、路由、renderer 采集和主进程 listening IPC 全部关闭；`playback=false` 时统计只读且 addSeconds 被阻止；其他 flags 不受影响。
8. 页面所有数字有明确来源；不显示无法解释的 62%。
9. 排行榜只显示全部时间 Top 10，播放次数来自现有 play_count，未伪装成本周/本月排行。
10. 1000×680 和 800×600、亮/暗主题无重叠或横向滚动。
11. 统计图有文本和无障碍标签，reduced motion 正确降级。
12. 未修改 package.json、AudioEngine、playerStore、SongList、已有表或 5 秒进度安全网。

## 13. 手动验收（主人）

1. 确认环形图从“无定义百分比”改为“本周活跃 N/7”是否符合预期。
2. 确认昵称初版固定为“秋月”、头像不可编辑是否可接受。
3. 观察 1000×680 的四块 Hero 是否仍接近已确认预览，800×600 重排是否自然。
4. 实际播放、暂停、拖动、切歌、托盘播放后核对数字变化是否符合直觉。
5. 检查排行榜播放交互、亮暗主题和 reduced motion 体感。

## 14. 风险与控制

| 风险 | 影响 | 控制措施 |
|---|---|---|
| 把播放意图当真实播放 | 缓冲/失败仍增长 | 只从实际 media time delta 采集，并取 media/wall delta 最小值 |
| seek 或循环造成大跳变 | 时长瞬间暴涨 | 负 delta/reset；正向 delta 受 wall delta 上限约束 |
| 时区、午夜和 DST | 记错日期或连续天数 | 本地日历 helper、午夜拆分、禁止 UTC slice/固定毫秒减日 |
| flush 并发、超限或失败 | 秒数丢失、重复写、IPC 拒绝 | 单链串行、300 秒切块、精确失败回补、余数保留测试 |
| renderer 异常退出 | 最多丢失尚未 flush 的数据 | 30 秒周期 + 生命周期 flush；明确接受最多 30 秒，不作零丢失承诺 |
| 页面轮询竞态 | 旧结果覆盖新结果或卸载警告 | generation/mounted guard + timer cleanup |
| 新 IPC 漏白名单 | 页面运行时报通道拒绝 | 类型、preload、handler 三点清单和构建测试 |
| 新 flag 只隐藏 UI | 后台仍采集或可直接调用 IPC | profile=false 消融覆盖导航、路由、tracker、主进程 handler；playback=false 阻止 addSeconds |
| 强行复用 SongList | 额外 IPC、错误列、共享 CSS 回归 | 保持 SongList 不变，Top 10 使用页面私有语义表格 |
| 最小窗口布局不足 | Hero/排行榜重叠 | 800×600 2×2 grid 和 Electron 截图验收 |

## 15. 回滚方式

1. 不做整仓 reset/checkout。先用 Task 文件清单区分本功能与用户已有归档、`package.json` 修改。
2. UI/导航失败时只撤销 Task 4-5；统计表和历史数据保持不动，避免误删用户数据。
3. tracker 正确性无法证明时，关闭 `profile` 默认值并撤销 Task 3 接线，保留 repository 测试和数据库表；`CREATE TABLE IF NOT EXISTS` 的空表无需破坏性 DROP。
4. schema/IPC 失败时停止后续实现，撤销新 handler、注册、白名单和类型；不删除已产生的数据库文件或其他表。
5. 文档只记录实际落地内容；撤销某 Task 时同步移除尚未成立的 SPEC/DECISIONS 描述，并在 devlog 记录原因。
6. 未经主人确认，不 commit、push、打包或发布。

## 16. 实施后独立审查包

实现完成后另开 Codex 对话，提供：

- 本方案及主人对第 13 节第 1-2 项的确认。
- `git status --short` 与仅本任务 diff。
- `npm run verify`、`git diff --check` 摘要。
- repository/tracker/date/useAudioSync/MyProfile 测试结果。
- 1000×680、800×600 的亮暗主题截图。
- 正常播放、pause、seek、跨午夜、托盘、旧库迁移和写失败回补的验证记录。

重点审查：统计是否虚增/漏计、flush 是否竞态、日期是否本地化、IPC 是否完整、flag 是否真正禁用、是否误伤 SongList/播放状态流、是否改了无关文件。

## 17. 独立视角二审

审查身份：未参与方案编写的 Electron 数据一致性与 UI 工程师。

### 二审发现与处理

| 二审问题 | 处理结果 |
|---|---|
| 真实播放时间从哪里取？ | 使用既有 AudioEngine timeupdate，不新增第二音频实例，不读取 Zustand 高频时间 |
| 背景节流会不会漏计？ | 以 media delta 为主、wall delta 为上限；事件稀疏时仍可累计实际前进量，需真实托盘 smoke |
| seek 会不会冒充听歌？ | 正向跳转最多只计真实墙钟间隔，反向/归零只重置基线 |
| 午夜跨日怎么分？ | tracker 按本地午夜拆分区间，不把整段扔给结束日期 |
| flush 失败时数据去哪？ | 整秒批次合并回 pending；并发新增保留在下一批，单日失败不阻塞其他日 |
| React StrictMode 会不会重复采样？ | 模块级生产单例、可注入测试实例和 StrictMode 回归，不让 effect setup 重复注册或 flush |
| 单次失败积压超过 IPC 上限怎么办？ | 每日 pending 按 300 秒切块；只回补失败块和未发送块，不重复成功块 |
| 一次注册的引擎回调会不会读旧 flag？ | 回调内使用 store getState 读取实时 flag/track/play state，不捕获水合前默认值 |
| 新表是否兼容旧备份？ | additive migration；导入旧库重启后补建，列入 smoke |
| 排行榜周/月是否名不副实？ | 删除 Tab 和 week 测试，明确全部时间 play_count |
| SongList 能否真的复用？ | 不能在不扩展契约的情况下显示次数；方案明确不修改它 |
| 环形百分比是否有意义？ | 改成有分母的本周活跃 N/7，等待主人体验确认 |
| 页面停留时是否刷新？ | 30 秒刷新前 flush；处理竞态和 cleanup |
| feature flag 是否完整？ | key/default/normalize/nav/route/tracker/main handler 全链路消融；关闭时 discard pending，保证 0 IPC |
| UI 在 800×600 是否装得下？ | Hero 和卡片重排，必须提交真实 Electron 截图 |
| 回滚会不会删用户统计？ | 回滚优先断开入口/采集，不执行 DROP TABLE，不整仓恢复 |

### 二审结论

**有条件通过→已确认。** 工程边界、数据一致性、测试和回滚已达到可实施水平；主人已确认两个产品选择：环形图使用“本周活跃 N/7”，昵称初版固定为“秋月”且不支持编辑。
