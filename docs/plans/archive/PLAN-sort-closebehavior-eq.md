# QinPlayer 排序、关闭行为与均衡器诊断实施方案

> **For Hermes Agent:** 本文件包含三个彼此独立的批次。严格按 A（排序）→ B（关闭行为）→ C（EQ 诊断）的顺序执行并分别验证；不得把三个批次揉成一个大 diff。主人确认本方案前不编码，EQ 修复在诊断报告和主人二次确认前不得实施，不自动 commit/push/打包。
>
> 创建：2026-07-12
> 修订：2026-07-12（Codex 初审后重写，并完成独立维护者视角二审）
> 状态：待主人确认

## 1. 初审结论

原方案描述了需求方向，但三项工作的风险等级差异很大，部分技术判断与当前源码不符，不能直接执行。

| 原方案内容 | 初审发现 | 本版处理 |
|---|---|---|
| SortMenu 把 `sortBy` 改成 `string` | 会丢失 Albums/Track 排序字段的编译期约束 | 改为泛型 `SortMenu<T extends string>`，字段数组与回调保持同一联合类型 |
| Props 同时增加 `fieldLabel` | 字段标签可从 fields 查得，额外 prop 会产生双重真相源 | 只传 `fields`，组件自行查找；非法值回退首项并在开发测试中暴露 |
| 复用固定 `MENU_ID` | 通用组件多实例时会产生重复 DOM id | 使用 React `useId()` 生成实例级 popup id |
| 打开菜单按 name/artist 硬编码焦点 | 泛化后 playCount 等字段会聚焦错误 | 用 fields 动态查找当前项索引，找不到时聚焦第一项 |
| “渲染前对 tracks 排序” | 未定义未知值、拼音、数字、并列项、是否修改输入 | 新建纯 `trackSort`，复用本地化 Collator，未知项固定末尾，稳定 tie-break，不修改输入 |
| 排序只影响界面 | `SongList` 会把收到的 tracks 设置为播放队列 | 明确：当前排序同时成为从该页面起播后的队列顺序 |
| close 事件发请求后等 renderer | Electron `close` 是同步可取消事件；不先 preventDefault 窗口已关闭 | 先同步阻止，再由主进程 CloseCoordinator 管理 request/result 状态机 |
| preload 只加 confirm-result | 主进程推送和 renderer 回传分别需要 ON/SEND 白名单与共享类型 | 增加 `close:request`、`close:ready`、`close:respond` 及 push/response 类型 |
| 询问结果无关联标识 | 重复关闭、旧响应或伪造响应可能执行错误动作 | 每次请求带 requestId，只接受当前窗口、当前 id、合法 action 的一次响应 |
| 未定义 Escape/重复关闭/renderer readiness | 会卡住 pending 状态、丢请求或发多次弹窗 | Escape 返回 cancel；pending 时忽略重复 close；renderer 先握手 ready，未 ready 时安全回退最小化 |
| tray=false 仍可最小化 | 隐藏后没有托盘入口，窗口可能无法恢复 | tray=false 时任何 closeBehavior 的有效行为都是直接退出，设置页禁用无效选项 |
| Q=1.4 太低，直接改 4.5 | 10 段中心频率近似一倍频程，Q≈1.4 有合理性；4.5 可能产生频段空洞 | Q 只作为诊断变量，禁止先改 |
| 只怀疑预设增益 | 当前 AudioEngine 还存在更强的结构性嫌疑 | 优先验证输出 headroom、稀疏 pending EQ、音量/淡入淡出共用 GainNode |
| “现有均衡器测试不变” | 当前没有 eqStore/AudioEngine/EQ IPC 测试 | 增加纯响应、Store、IPC、AudioEngine 图连接测试 |
| 三项一次性实施 | 排序是低中风险 UI，关闭是生命周期状态机，EQ 是音频诊断 | 拆为三个独立验证边界；C1 诊断后必须再次确认 C2 |

## 2. 背景

本轮包含三个用户可感知但工程性质不同的目标：

1. 本地音乐与我喜欢的页面增加统一排序菜单。
2. 允许用户选择关闭窗口时最小化、退出或每次询问。
3. 找出均衡器预设导致失真、发闷、发尖或响度异常的真实原因。

为了避免一个失败拖累全部改动，三个批次必须保持独立文件边界、测试记录与回滚路径。排序和关闭行为属于可直接设计的功能；均衡器属于诊断任务，不能把未经测量的 Q 值猜测写成既定修复。

## 3. 当前状态

### 排序

- `AlbumSortMenu` 只接受 `AlbumSortBy = 'name' | 'artist'`，字段、aria-label、焦点索引和 popup id 均带专辑语义。
- 样式 `.album-sort-menu__*` 位于 `albums.css`，不适合跨页面长期复用。
- `sortAlbums()` 已具备拼音/数字 Collator、未知项固定末尾和非原地排序。
- LocalMusic 与 Liked 把源 tracks 直接交给 SongList；当前无页面排序测试。

### 关闭行为

- BrowserWindow close 在 `flags.tray && !isQuitting` 时同步 preventDefault + hide。
- 托盘“退出”先设置 `isQuitting` 再 `app.quit()`，这条路径必须继续绕过询问。
- `window:close` 最终仍走 BrowserWindow close 事件；迷你播放器自己的关闭按钮只是退出迷你模式，不等于退出应用。
- settings 表可保存字符串，但没有 closeBehavior 类型、规范化、主进程协调器或 renderer 根级弹窗。
- App 在歌词、普通、迷你三种壳层间切换；关闭确认弹窗必须挂在三者之外，不能放在 Settings 页面。

### 均衡器

- 信号链是 `source → 10×peaking(Q=1.4) → gainNode → destination`。
- 同一个 gainNode 同时承担用户音量和 fade 自动化；`fadeIn()` 默认回到 1，可能覆盖用户音量。
- 预设大多为正增益，低音增强最高 +10dB；没有独立 EQ headroom 节点。
- `_pendingEqGains` 初始为空；首次播放前只改一个频段会形成稀疏数组，初始化时可能把 `undefined` 写入其他 filter gain。
- `applyPreset()` 逐段调用 `setEqGain()`，未来若每段重算补偿会产生 10 次中间状态。
- `eq:save` 只判断 `typeof number`，未拒绝 NaN、Infinity 和越界值；Store 防抖保存存在空 catch。
- 当前没有 AudioEngine、eqStore 或 EQ IPC 的专项测试。

## 4. 总体目标

1. SortMenu 在 Albums、LocalMusic、Liked 三处复用且保持类型安全、键盘导航和 reduced motion。
2. Track 排序语义确定、稳定、不修改源数组；本地音乐和喜欢页行为一致。
3. closeBehavior 默认保持现有 minimize 行为，三种模式持久化且主进程安全执行。
4. ask 模式不丢请求、不重复执行，只有 renderer 明确 ready 后才发请求，并覆盖托盘关闭、系统退出、mini mode 和 tray=false。
5. EQ 先形成可复现证据，再按单变量顺序修复；flat 0dB 应接近旁路，任何预设或自定义增益不应因输出削波产生明显失真。
6. 三批均有自动验证、手动验收、独立回滚和审查交接。

## 5. 非目标

- 不新增 npm 依赖，不修改 package.json 或 tsconfig。
- 不把排序状态持久化到数据库；页面重新挂载时恢复默认“歌名升序”。
- 不修改 SongList、后端 songs 查询顺序或专辑详情歌曲源顺序。
- 不修改托盘菜单结构或迷你播放器关闭按钮的既有语义。
- 不使用 `window.confirm`、Electron 原生 messageBox 代替正常 ask UI；原生弹窗只允许作为 renderer 尚未可用时的诊断手段，不进入最终路径。
- 不在 EQ 诊断前承诺 Q=4.5、具体新预设或固定补偿 dB。
- 不增加可视化频谱器、均衡器开关、preamp 手动滑块或新预设数量。
- 不声称单元测试可以替代真实音频 A/B。

## 6. 批次与确认门

| 批次 | 内容 | 实施许可 |
|---|---|---|
| A | 通用 SortMenu + LocalMusic/Liked 排序 | 主人确认本方案后可实施 |
| B | closeBehavior 主进程状态机 + 设置 UI + 自定义确认弹窗 | 主人确认本方案后可实施 |
| C1 | EQ 基线、复现、结构测试与诊断报告 | 主人确认本方案后可执行 |
| C2 | EQ 音频图/预设/Q 修复 | **C1 报告完成且主人二次确认后**才可实施 |

每批完成后先运行定向测试，再进入下一批。需要本地 commit 时仍须主人明确同意。

## 7. 批次 A：通用排序

### A1. 通用组件契约

将 `AlbumSortMenu.tsx` 重命名为 `SortMenu.tsx`，接口保持泛型：

```ts
export interface SortField<T extends string> {
  value: T
  label: string
}

export interface SortMenuProps<T extends string> {
  fields: readonly SortField<T>[]
  sortBy: T
  sortOrder: SortOrder
  ariaLabel: string
  onSortByChange: (value: T) => void
  onSortOrderChange: (value: SortOrder) => void
}
```

约束：

- fields 至少 1 项；调用点使用模块级 `as const` 常量，避免每次 render 新建数组。
- fieldLabel 由 fields 查找，不再单独传入。
- popup id 使用 `useId()`；aria-controls 与实例 id 一致。
- 打开后聚焦当前 field；非法值时聚焦第一个 field，不硬编码索引。
- ArrowUp/Down、Home/End、Escape、Tab、外部 pointerdown、focus 离开行为保持。
- popup `aria-label` 使用调用方语义，不再固定“专辑排序”。
- CSS 从 `albums.css` 移到 `sort-menu.css`，类名改为 `sort-menu__*`；`global.css` 在页面样式之后、motion.css 之前导入。

### A2. Track 排序语义

新建 `src/utils/trackSort.ts`：

```ts
export type TrackSortBy = 'title' | 'artist' | 'playCount'
export function sortTracks(
  tracks: readonly Track[],
  sortBy: TrackSortBy,
  order: SortOrder,
): Track[]
```

规则：

- title/artist 使用与专辑相同配置的中文拼音、numeric、ignorePunctuation Collator。
- 空字符串和“未知歌手”在升降序都固定末尾；title 已有文件名兜底，但仍防御空值。
- playCount 非有限值视为未知并固定末尾；正常值按数值排序。
- 字符串主键相同：title → artist → id 均升序作为稳定 tie-break。
- playCount 相同：title → artist → id 均升序。
- 返回副本，不修改输入 Track 或源数组。

默认：LocalMusic 与 Liked 都是 `title + asc`。

### A3. 页面接入

- Albums 更新为通用 SortMenu，专辑字段仍为“专辑名/歌手”，排序结果不变。
- LocalMusic 使用 `useMemo(sortTracks)`；header actions 顺序为 SortMenu 在左、“选择文件夹”在右。
- Liked 增加标准 header/actions，使用相同 SortMenu。
- 两页把 `sortedTracks` 传给 SongList，因此用户从该页双击起播时，当前排序就是播放队列顺序；这是明确目标，不是副作用。
- 扫描增量、收藏数据重新加载时只更新源 tracks，useMemo 自动派生，不覆写 sort state。
- 空列表/加载中不显示无意义 popup；标题布局不因按钮出现跳动。

### A4. 文件范围

Create：

- `src/components/SortMenu.tsx`
- `src/styles/sort-menu.css`
- `src/utils/trackSort.ts`
- `tests/SortMenu.test.tsx`
- `tests/trackSort.test.ts`
- `tests/LocalMusic.test.tsx`
- `tests/Liked.test.tsx`

Modify：

- `src/pages/Albums.tsx`
- `src/pages/LocalMusic.tsx`
- `src/pages/Liked.tsx`
- `src/styles/albums.css`
- `src/styles/localmusic.css`
- `src/styles/recent-liked.css`
- `src/styles/global.css`
- `tests/Albums.test.tsx`

Delete after migration：

- `src/components/AlbumSortMenu.tsx`
- `tests/AlbumSortMenu.test.tsx`

### A5. 测试

1. SortMenu 泛型调用能编译；动态 2/3 字段、summary、aria-label 正确。
2. 多实例 popup id 唯一。
3. 当前字段聚焦、非法值 fallback、Arrow/Home/End/Escape/Tab/外部点击/焦点离开。
4. title/artist 拼音、大小写、数字、标点、未知项、升降序、稳定 tie-break。
5. playCount 数值排序、并列、0、非法值固定末尾。
6. 输入数组和 Track 对象未修改。
7. LocalMusic 扫描事件更新后排序保持；选择文件夹按钮行为不回归。
8. Liked loading/empty/error 与排序保持。
9. 双击排序后的首曲，playlist 顺序等于 sortedTracks。
10. Albums 原有 name/artist 行为和详情歌曲顺序不变。

Run：

```bash
npx vitest run tests/SortMenu.test.tsx tests/trackSort.test.ts tests/Albums.test.tsx tests/LocalMusic.test.tsx tests/Liked.test.tsx
npx tsc --noEmit
```

## 8. 批次 B：关闭窗口行为

### B1. 产品语义

```ts
export type CloseBehavior = 'minimize' | 'exit' | 'ask'
export type CloseDecision = 'minimize' | 'exit' | 'cancel'
```

- 默认/缺失/非法设置：`minimize`，保持现有行为。
- minimize：有 tray 时 preventDefault + hide；tray=false 时直接退出，绝不隐藏成无法恢复的窗口。
- exit：不询问，设置 quitting 后执行 app.quit/允许 close。
- ask：有 tray 且 renderer 可用时显示自定义弹窗。
- ask 选择 minimize/exit 后，勾选“不再询问”才把 closeBehavior 保存为对应动作；cancel 不保存。
- Escape = cancel，保留窗口；overlay 点击不关闭，避免误操作。
- tray 菜单“退出”、应用 before-quit、系统退出绕过 ask。
- MiniPlayer 自身右上角仍只是退出 mini mode；Alt+F4/系统 close 才进入 closeBehavior。

### B2. 主进程 CloseCoordinator

新建 `electron/closeBehavior.ts`，把状态机从 main.ts 提取出来。通过依赖注入接受：读取/保存设置、读取 flags、hide、quit、sendRequest 和校验 sender，便于无 Electron 窗口的单元测试。

状态：

```ts
interface PendingCloseRequest {
  requestId: string
}
```

close 处理顺序：

1. 先保存正常窗口 bounds；isQuitting 为 true 时直接放行。
2. 读取并 normalize closeBehavior。
3. tray=false：直接进入 exit，不弹窗。
4. minimize：同步 preventDefault 后 hide。
5. exit：设置 quitting 后放行/quit。
6. ask：同步 preventDefault；已有 pending 时不发送第二次请求。
7. renderer 必须先通过 `close:ready` 标记根级 listener 已挂载；尚未 ready、webContents destroyed 或 send 抛错时安全回退 minimize，且不创建 pending。
8. 成功发送 `{ requestId }` 后保持 single pending，等待用户明确选择；禁止用任意超时替用户自动最小化或退出。

响应规则：

- `close:ready` 与 `close:respond` 都只接受当前 mainWindow.webContents 发来的事件；其他窗口、旧 webContents 或伪造 sender 全部忽略。
- requestId 必须与当前 pending 完全一致；旧 id、重复结果、非法 action 全部忽略并记录。
- 收到合法结果先 clear pending，再执行动作，避免 quit 重入重复处理。
- remember 写设置失败时记录中文错误，但仍执行用户本次选择。
- cancel 只清状态并保持窗口；minimize hide；exit 设置 quitting 后 app.quit。
- `app.on('before-quit')` 统一设置 quitting 并清理 pending。
- `did-start-loading`、render-process-gone、destroyed、closed 时把 rendererReady 复位并清理 pending；新 renderer 根 listener 挂载后重新发送 ready，旧响应不影响新窗口。

### B3. IPC 与 renderer 弹窗

共享类型加入 `src/types/ipc.ts`：

```ts
IpcPushChannels['close:request'] = { requestId: string }

interface CloseResponse {
  requestId: string
  decision: CloseDecision
  remember: boolean
}
```

- preload `ON_CHANNELS` 增加 `close:request`。
- preload `SEND_CHANNELS` 增加 `close:ready`、`close:respond`。
- App 在任何 hydration/普通/歌词/mini 壳层之外注册一次 listener，listener 挂载后发送 `close:ready`，并渲染 `CloseConfirmDialog`。
- 新请求覆盖不得发生；只有当前 requestId 可操作。
- dialog 选择后只 send 一次，立即清本地状态；重复点击由 ref/state 锁阻止。
- 弹窗复用现有 dialog token 和 reduced-motion 规则，但不能依赖退场动画完成后才回主进程。
- 400×150 mini 窗口下提供紧凑布局且不溢出；正常窗口使用标准宽度。

### B4. 设置页

- 通用区域新增“关闭窗口时”分段控件：最小化到托盘 / 直接退出 / 每次询问。
- 使用 `role="radiogroup"`、每项 `role="radio"`/`aria-checked`，保存期间禁用。
- mount 时读取 settings:get(closeBehavior)，统一 normalize。
- 变更先 await settings:set，成功再更新选中状态；失败保留旧值并显示/记录错误，不能静默乐观成功。
- tray=false 时界面显示有效行为“直接退出”，minimize/ask 禁用但保留数据库原值，重新启用 tray 后可恢复原偏好。

### B5. 文件范围

Create：

- `electron/closeBehavior.ts`
- `src/components/CloseConfirmDialog.tsx`
- `tests/closeBehavior.test.ts`
- `tests/CloseConfirmDialog.test.tsx`

Modify：

- `electron/main.ts`
- `electron/preload.ts`
- `src/App.tsx`
- `src/types/ipc.ts`
- `src/pages/Settings.tsx`
- `src/styles/dialog.css`
- `src/styles/settings.css`
- `tests/AppMotionHydration.test.tsx`
- `tests/Settings.test.tsx`
- `tests/MiniPlayer.test.tsx`（只锁定 mini 关闭按钮语义不变）
- `tests/harnessChecks.test.ts`（若现有通道检查需要扩展）

### B6. 测试矩阵

1. 缺失/非法设置归一为 minimize。
2. minimize + tray=true：prevent + hide；tray=false：exit，不 hide。
3. exit：不发 request，quitting 只设置一次。
4. ask：先 prevent，再发送唯一 requestId。
5. pending 时重复 close 不发送第二个 request。
6. sender/id/action 非法、旧响应、重复响应均无副作用。
7. minimize/exit/cancel 三结果；remember 只保存前两者。
8. 保存失败仍执行本次选择且有日志。
9. renderer 未 ready/unavailable/send throw 均安全回退 minimize，且不创建 pending。
10. before-quit、tray exit、reload/render-process-gone/closed/destroyed 清 pending/readiness 并绕过 ask。
11. App listener StrictMode 下只有一个有效订阅，发送 ready，unmount cleanup。
12. Dialog 两按钮、checkbox、Escape cancel、overlay 不关闭、重复点击防护。
13. 400×150 DOM 无按钮溢出；真实视觉交给 Electron smoke。
14. Settings 三态读取/保存/失败回滚/tray=false 禁用。
15. MiniPlayer 关闭按钮仍调用 setMiniMode(false)，不触发 close:respond。

Run：

```bash
npx vitest run tests/closeBehavior.test.ts tests/CloseConfirmDialog.test.tsx tests/Settings.test.tsx tests/AppMotionHydration.test.tsx tests/MiniPlayer.test.tsx tests/harnessChecks.test.ts
npx tsc --noEmit
```

## 9. 批次 C：均衡器诊断与条件修复

### C1. 诊断阶段（可执行）

创建 `docs/diagnostics/EQ-20260712.md`，只记录可复现事实。

#### C1.1 临时诊断 harness

- 先确认当前 `npm run verify` 基线全绿。
- 允许创建临时 `tests/eqDiagnosis.temp.test.ts` 或 DevTools instrumentation 来验证结构性假设，但该文件不属于最终测试套件。
- 临时断言可以有预期红灯，用于证明 sparse pending、非法 IPC、fade/volume 耦合等现状；每个失败都必须写入报告并标明当前源码位置。
- C1 收工前删除临时测试与 instrumentation，重新确认生产代码和正式测试套件没有残留修改或失败。若 C2 未获批准，仓库不能因诊断长期红灯。

临时诊断至少检查：

1. 单段 setEqGain 前未初始化时，pending 是否出现 sparse/undefined。
2. setAllEqGains 与 eq:save 是否接受 NaN、Infinity、越界或错误长度。
3. applyPreset 是否逐段制造 10 个中间状态。
4. flat bypass 与 EQ=0 的图连接和响度是否存在差异。
5. fade 自动化后用户 volume 参数是否被改写。
6. 现有预设的链路 peak magnitude 是否超过 1。

#### C1.2 真实 Electron 基线

固定条件：同一输出设备、关闭系统音效、同一音量、同一首动态范围较小的响亮歌曲 + 一首人声歌曲。

依次记录：

1. EQ feature flag 关闭的旁路。
2. EQ 开启但 10 段 0dB。
3. 每个现有预设。
4. 自定义单段 +6dB、+12dB。
5. fade 开/关切歌后音量是否从用户值跳到 1。
6. 首次播放前只改一个频段后开始播放，是否报错/失真。

使用临时诊断 instrumentation 或 DevTools WebAudio/Analyser 记录峰值、是否出现连续接近满幅、节点图和主观 A/B。临时代码不得进入最终提交。单测不能声称证明听感。

#### C1.3 诊断判定

| 证据 | 结论 |
|---|---|
| bypass 与 flat 0dB 已明显不同 | 优先查连接/音量接管，不改 preset/Q |
| fade 切歌后 volume 节点变为 1 | GainNode 职责耦合成立，优先拆分 volume/fade |
| 正增益预设峰值明显超过 1 或削波 | 需要独立 EQ headroom |
| 单段首次播放触发 undefined/NaN | pending sparse 根因成立，改为完整 current gains |
| headroom 后仍发闷/发尖 | 再做预设曲线 A/B，不能用响度差冒充音色改善 |
| 频响测量显示相邻频段过度重叠/空洞 | 才允许单独实验 Q；一次只测一个 Q 值 |

C1 完成后把报告交给主人，明确列出“已证实 / 已排除 / 未测量”。**到此停止，等待 C2 确认。**

收尾：

```bash
npm run verify
git status --short
```

Expected：除诊断报告外没有 C1 生产/测试残留，正式门禁仍为 0 failed。

### C2. 条件修复（需二次确认）

只有对应证据成立才实施相应项：

#### C2.0 重新进入 TDD

根据获批修复项先创建正式失败测试，不一次性加入未采用方案的测试：

- `tests/AudioEngine.test.ts`
- `tests/eqStore.test.ts`
- `tests/eqIPC.test.ts`
- `src/utils/eqResponse.ts` + `tests/eqResponse.test.ts`（仅 headroom 获批时）

正式测试覆盖对应诊断结论：完整有限 gains、IPC 严格校验、单次 preset 原子提交、flat 响应、节点职责隔离、headroom 数学与参数平滑。先确认测试因目标缺失而失败，再实施最小修复。

#### C2.1 完整 EQ 状态（预期高概率）

- `_pendingEqGains` 替换为始终长度 10 的 `_currentEqGains`，初始全 0。
- setEqGain 校验 index/value 后更新完整数组；setAll 原子替换。
- WebAudio 初始化统一应用完整数组，不遍历稀疏 holes。

#### C2.2 拆分 GainNode（若 fade/volume 耦合成立）

信号链改为：

```text
source → EQ filters → eqHeadroomGain → fadeGain → volumeGain → destination
```

- setVolume 只控制 volumeGain。
- fadeIn/fadeOut 只控制 fadeGain 0..1。
- EQ 补偿只控制 eqHeadroomGain。
- 接入 WebAudio 前后的音量交接必须实机比较，不能同时让 media element volume 和 volumeGain 双重衰减。
- 参数变化使用短 `setTargetAtTime`/明确 cancel，避免 preset/slider 切换爆音。

#### C2.3 自动 headroom（若削波证据成立）

- 通过每个 BiquadFilterNode 的 `getFrequencyResponse()`，在 20Hz 到 `sampleRate / 2 × 0.95` 之间取 256 个对数采样点，计算链路总 magnitude。
- `headroomGain = min(1, 1 / peakMagnitude)`；flat 0dB 保持 1，不无故整体降音量。
- 每次完整 gains 变化后只重算一次，并平滑更新 eqHeadroomGain。
- helper 测试响应矩阵；AudioEngine mock 测试节点更新；真实 A/B 验证补偿后无明显削波。

#### C2.4 预设/Q（仅在 headroom 后仍有问题）

- 先在相同 loudness 下逐个调整预设，优先把“全正增益”改成围绕 0dB 的 boost/cut 曲线。
- 每轮只调整一组 preset，记录前后数组和主人听感。
- Q 默认保留 1.4；只有频响证据支持时才单独试验，不与 preset/headroom 同轮修改。
- 不把“更响”判为“更好”，也不为了防削波把所有预设简单整体压低后宣称解决音色。

#### C2.5 条件文件范围

- `src/utils/AudioEngine.ts`
- `src/stores/eqStore.ts`
- `electron/ipc/eq.ts`
- `src/utils/eqResponse.ts`（仅 headroom 获批时）
- `src/components/Equalizer.tsx`（只有预设/UI 文案确需变化时）
- 获批修复项对应的专项测试
- `SPEC.md`、`harness/DECISIONS.md`、EQ 诊断报告与 devlog

## 10. 总验证流程

### Task 0 基线

```bash
git status --short
npm run verify
```

当前仅本方案文件未跟踪；实施前若状态变化，逐项登记归属，不覆盖用户改动。基线失败先停止。

### 每批后

1. 运行该批定向测试。
2. 运行 `npx tsc --noEmit`。
3. 检查 `git diff --check` 和该批文件清单。
4. 记录实际测试数、失败与未测量项。

### 全部获准批次完成后

```bash
npm run verify
git diff --check
```

Expected：Harness、main/preload/renderer build、全量 Vitest 0 failed。

## 11. UI 与手动验收

### 排序

1. 亮/暗主题下检查 Albums、LocalMusic、Liked 的 SortMenu 尺寸、位置、焦点和文本不溢出。
2. 1000×680 与 800×600 下 header actions 不重叠。
3. 逐个验证歌名/歌手/播放次数升降序，未知值始终末尾。
4. 排序后从中间歌曲起播，下一首顺序符合当前排序。

### 关闭行为

1. minimize、exit、ask 三态分别重启应用验证持久化。
2. ask 的两按钮、checkbox、Escape、连续点两次关闭、renderer ready 前 fallback。
3. 标题栏关闭、Alt+F4、任务栏关闭、托盘退出、系统退出分别验证。
4. 普通、歌词、mini 三种壳层验证；mini 400×150 弹窗不溢出。
5. tray=false 验证不会隐藏成无法恢复窗口。
6. 亮/暗/reduced motion 下弹窗正常。

### 均衡器

1. bypass 与 flat 0dB 响度/音色接近。
2. 同音量逐一 A/B 五个预设，检查削波、发闷、发尖和音量跳变。
3. fade 开关切歌后用户音量保持。
4. 首次播放前调整单段、连续拖动、重置、重启恢复均正常。
5. 只报告实际听到和测到的结果，未完成 A/B 不写“已修复”。

## 12. 验收标准

1. SortMenu 类型安全、实例 id 唯一、键盘与焦点行为无回归。
2. LocalMusic/Liked 三字段升降序正确，未知值末尾，输入数组不变。
3. 排序后的可见列表与从该页起播后的队列顺序一致。
4. closeBehavior 默认 minimize，非法值安全回退。
5. ask 在 close 事件中先同步 prevent，request/result 只有一次有效执行。
6. tray=false 不隐藏；tray exit/before-quit 绕过询问。
7. renderer ready 前、重复 close、旧 response、Escape cancel 均不会卡死或误退出；弹窗显示后不以超时替用户决策。
8. ON/SEND 白名单、push/response 类型和 cleanup 完整。
9. EQ C1 报告区分已证实、排除、未测量；未确认前没有 C2 残留代码。
10. EQ gains/IPC 不接受 sparse、NaN、Infinity、越界或错误长度。
11. 若实施 C2：flat 不被无故衰减，用户 volume/fade/EQ headroom 互不覆盖，预设无明显输出削波。
12. `npm run verify` 全绿，0 failed；未新增依赖，未修改无关功能。

## 13. 风险与控制

| 风险 | 影响 | 控制 |
|---|---|---|
| SortMenu 用 string 泛化 | 调用方传非法字段 | 泛型 fields/union 同源，编译与动态 fallback 测试 |
| comparator 不确定 | 同值抖动、未知项跑到前面 | Collator + 固定 tie-break + 未知项不随方向反转 |
| 排序改变播放队列 | 用户听到意外下一首 | 明确作为目标语义并做回归测试/手动验收 |
| close 异步设计错误 | 窗口先关、请求丢失 | 同步 prevent + 主进程 coordinator |
| 重复/旧 close 响应 | 多次 hide/quit 或错误退出 | requestId、sender 校验、single pending、先清状态后执行 |
| tray=false 仍隐藏 | 应用无法恢复 | effective behavior 强制 exit，UI 禁用无效选项 |
| renderer listener 尚未挂载 | push 丢失并留下 pending | `close:ready` 握手；未 ready/send 失败时不建 pending并回退 minimize |
| dialog 依赖页面壳层 | 歌词/mini 时收不到 | App 根级订阅与渲染，400×150 smoke |
| 直接把 Q 改 4.5 | 频段空洞、音色更差 | Q 只在 C1 频响证据后单变量试验 |
| 正增益削波 | 失真、刺耳 | 响应测量 + 条件 headroom 节点 |
| gainNode 职责耦合 | fade 覆盖用户音量 | 失败测试后条件拆成 headroom/fade/volume 三节点 |
| pending sparse | 首播时 undefined/NaN | 完整 10 段 current gains + 非有限值测试 |
| 主观听感当自动结论 | 假修复 | 同响度 A/B + 主人最终验收，未测量如实标记 |
| 三批互相污染 | 难回滚、难定位 | 独立文件清单、定向测试、分批 review gate |

## 14. 回滚方式

1. 禁止整仓 reset/checkout；只按批次文件清单撤销本批 diff。
2. A 失败：恢复 AlbumSortMenu 文件/样式/测试，撤销 LocalMusic/Liked 派生排序，不动 B/C。
3. B 失败：恢复 main 原有 `flags.tray && !isQuitting` close 分支，删除 coordinator/dialog/新通道，保留 settings 表中无害的 closeBehavior 键也可；不动 A/C。
4. C1 诊断工具失败：删除临时测试与 instrumentation，只在诊断报告中保留失败证据，不实施 C2。
5. C2 任一方案 after 更差：只撤销对应单变量（headroom、gain split、preset 或 Q），不要同时回滚其他已证明修复。
6. 文档只记录实际落地结果；撤销时同步修正 SPEC/DECISIONS，并在 devlog 记录错误假设与回退结果。
7. 未经主人确认，不 commit、push、打包或发布。

## 15. 项目记忆更新

每批完成后更新：

- `SPEC.md`：实际排序字段、closeBehavior 语义；EQ 只写已实施结论。
- `harness/DECISIONS.md`：通用 SortMenu 接口、close coordinator、经证实的 EQ 决策。
- `docs/devlog/devlog-20260712-sort-closebehavior.md`：A/B 实际改动、测试、UI 结果。
- `docs/devlog/devlog-20260712-eq-diagnosis.md`：C1 复现、错误假设、证据和 C2 决定。
- 上下文不足时由 Hermes Agent 生成 handoff。

## 16. 实施后独立审查包

每批独立提供：

- 本方案与该批验收条目。
- `git status --short`、该批 diff 和文件清单。
- 定向测试、`npm run verify`、`git diff --check` 摘要。
- A：排序矩阵与三页面截图。
- B：close state matrix、通道白名单、普通/歌词/mini/tray=false 结果。
- C：诊断报告、节点图、峰值/频响证据、同响度 A/B 和主人确认。

审查输出按：结论 → 严重级别问题（文件:行号）→ 验证情况 → 需要主人确认。

## 17. 独立维护者视角二审

审查身份：未参与方案编写、负责后续维护的 Electron 生命周期与音频工程师。

### 二审发现与处理

| 二审问题 | 处理结果 |
|---|---|
| 三项是否应该一次实现？ | 否；已拆 A/B/C，C2 另设二次确认门 |
| 通用排序是否丢类型？ | 泛型 fields 与 sortBy 同源，不降级为裸 string |
| 多实例菜单会不会 id 冲突？ | 使用 useId，增加双实例测试 |
| 排序与播放队列关系是否清楚？ | sortedTracks 既是显示列表也是该页起播队列，明确验收 |
| close 能否等待异步 renderer？ | 不能；改为同步 prevent + coordinator 后续决策 |
| ask pending 时再关一次怎么办？ | 保持单 pending，不重复请求 |
| renderer 崩溃/未加载怎么办？ | ready 握手；未 ready/send 失败回退 minimize，render-process-gone 清 pending |
| 托盘关闭和系统退出会不会再询问？ | isQuitting/before-quit 提前旁路并清 pending |
| tray=false 是否会失联？ | 强制 effective exit，不允许 hide |
| mini 关闭按钮是否被误改？ | 明确不改；专项回归锁定 |
| Q=1.4 真是根因吗？ | 证据不足且理论上合理；禁止预改 4.5 |
| 当前还有哪些高概率 EQ 根因？ | 正增益无 headroom、volume/fade 共用节点、pending sparse |
| 自动补偿如何避免拍脑袋？ | 条件使用实际 getFrequencyResponse 总峰值，不写固定 -XdB |
| flat EQ 会不会被补偿变小？ | peak≤1 时 headroom=1，验收 flat 不无故衰减 |
| preset 与 Q 是否会同时动？ | 禁止；headroom 后仍异常才逐变量 A/B |
| 单测能否证明听感？ | 不能；只锁图和数学，最终由真实 Electron 同响度 A/B 验收 |
| 回滚是否会互相伤害？ | 每批独立回滚，C2 每个变量也可单独撤销 |

### 二审结论

**有条件通过。** A 与 B 在主人确认本方案后可按 TDD 实施；C1 可执行临时诊断并形成报告，收工前必须移除临时测试与 instrumentation；C2 获批后才以正式失败测试重新进入 TDD，AudioEngine、预设或 Q 修改必须等待诊断报告和主人二次确认。当前方案已具备背景、现状、目标/非目标、分步实施、自动与手动验收、风险、回滚和独立审查交接，未确认前保持计划状态。
