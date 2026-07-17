# QinPlayer 决策记录

> 新决策追加在顶部；既有历史分组保留原位置，被后续实现取代时更新状态说明

---

## 2026-07-16 IPC 采用三方向合同与唯一 typed Electron 边界

- **合同拆分**：主窗口 invoke、Mini 菜单 invoke、Renderer → main send、main → Renderer event 分别建模；当前计数为 40/3/10/10。每个 channel 保留真实 tuple 参数和 invoke 结果，不为了形式统一改写字符串参数或既有成功 payload。
- **runtime 表面**：四个共享常量同时约束类型与 preload allowlist。主 preload 只接受三个主窗口 surface；Mini preload 继续只暴露 `getInit`、`ready`、`resolve`，没有通用 Electron API。
- **主进程边界**：业务 `ipcMain.handle`、`ipcMain.on`、`webContents.send` 集中到 `typedIpc.ts`，Electron 的 untyped rest args 只在该文件以 `unknown` 窄化。正常结果原样返回，异常记录 channel 后转为固定中文错误。
- **失败语义**：业务 canceled/success union 不双重包装；扫描启动、扫描事件、数据库导出以及导入的 resolved failure 都不再把 `String(error)`、绝对路径或堆栈发送给 Renderer，原始诊断只留主进程日志。
- **机械门禁**：专用 TypeScript 合同测试固定错误 channel/参数/callback 必须编译失败；Harness 跨文件比较合同、注册、sender 与 preload，拒绝裸 IPC、动态 channel、漏项、额外项、重复项和方向错误，并追踪 Electron/typed wrapper/webContents 的常见导入与局部别名。
- **状态**：类型检查、Harness、67 files / 774 tests、生产构建与隔离 Electron 31/真实 SQLite/preload smoke 通过；首轮独立 Review 为 Blocker 0、Important 5、Suggestion 1，第一次短复审为 Blocker 0、Important 2、Suggestion 0，最终短复审 Blocker 0、Important 0、Suggestion 1，gate 通过。未用 deferred Promise 单独锁定旧刷新请求晚到不覆盖终态，作为非阻断测试增强项；OS 对话框、真实扫描 Worker、窗口/托盘副作用和 packaged smoke 仍为人工项。

## 2026-07-16 本地资源协议只接受受控 ID

- **授权模型**：audio/cover 只接受正安全整数 song ID，由主进程参数绑定查询数据库 mapping；avatar 固定 `id=current`，只读取 `settings.avatarPath`。Renderer 不能提供资源路径，也没有旧 path 兼容回退。
- **路径字段**：`Track.filePath/coverPath` 暂时保留给歌词、歌曲信息、打开位置和是否显示封面；字段存在不等于协议授权。Album/Playlist 额外携带代表封面的 song ID 与 mtime，不增加数据库列。
- **路径边界**：audio 必须在注册 music root；cover 只允许 `userData/covers` 或该歌曲目录；avatar 只允许 `userData/avatar`。授权统一要求受支持扩展、普通文件、真实目录 root 以及 `realpath` 后的 path-aware containment。
- **缓存**：`v` 只由歌曲 mtime 或头像文件名生成，用于缓存失效；不得参与 SQL、文件路径或授权。
- **Range**：只接受 GET/HEAD 与单段 bytes Range。显式 end、开放 end、suffix 的任一边界都必须在文件内；不做 clamp，越界和畸形请求统一 416，HEAD 不创建 body stream。
- **状态**：64 files / 728 tests、TypeScript、Harness、生产构建和 Electron 31 隔离真实 SQLite/文件流 smoke 通过；独立 Review 最终 Blocker 0、Important 0。完整 GUI 多格式播放、seek 与 packaged smoke 仍是人工项。

## 2026-07-16 数据库导入采用同卷可恢复发布状态机

- **兼容策略**：只接受当前核心表、字段、关键 unique 和 cascade FK；`listening_stats` 可缺失并由初始化补建，已存在但不兼容则拒绝，不猜测未知旧版迁移。
- **生命周期**：数据库连接先保存在局部变量；WAL、外键、schema、听歌统计表和 covers 目录全部成功后才发布 singleton。失败关闭局部连接并允许重试，导入可关闭初始化弹窗由 importer 统一报告。
- **发布**：候选复制到 live DB 同目录唯一 stage，只读验证后写 `prepared`；完整 checkpoint 并关闭连接后依次同卷 rename `target → rollback`、`stage → target`，禁止 copy 覆盖 fallback。
- **恢复证据**：每个事务使用不可变 `prepared`、`old-moved`、`new-published`、`committed` marker。phase manifest 记录原 target stable identity，前三个 marker 形成 digest chain；`committed` 自含 manifest、候选 digest、各 marker digest、chain digest 和新 target stable identity，可在前三个 marker 已清理时独立验证。
- **身份合同**：Electron 31.7.7 / Node 20.18.0 的隔离 Windows 探针确认 `dev + ino` 非零，且 SQLite 文件经同卷 rename 与实际写入后保持不变，另一文件身份不同；因此终态不使用内容 hash、size 或 mtime 绑定可写 DB。
- **失败语义**：成功连接可查询且 `committed` 落盘前保留 rollback。新 target 失败时先清 sidecars 并 rename 到唯一 quarantine，再恢复 rollback；quarantine/restore/reopen 任一步失败即 fatal，保留 artifacts 并停止启动。
- **清理续跑**：rollback 回迁必须匹配 manifest 中的原 target identity；失败恢复后的物理 artifacts 先清理，phase marker 按逆序删除。任何残留事务存在时拒绝同进程创建第二事务，交给下次启动恢复。
- **测试边界**：Node Vitest 无法直接加载为 Electron ABI 构建的 `better-sqlite3`；schema 使用 `node:sqlite` 真实内存库，文件发布/恢复使用真实临时文件与注入故障，Electron ABI 的真实 validator 另做隔离 smoke，绝不使用唯一用户数据库。
- **状态**：59 files / 660 tests、TypeScript、Harness、生产构建与 Electron 隔离 smoke 通过；独立 Review 最终 Blocker 0、Important 0。完整 GUI 强制终止、真实文件锁与 packaged relaunch 仍是人工残余项。

## 2026-07-15 增量扫描采用 fail-closed 快照与终止门

- **问题**：旧增量扫描在 `toProcess=0` 时不发送现存路径，无法清理 deletion-only；目录访问失败又会静默形成不完整路径集合，主进程收到集合后立即做全库差集删除，可能级联移除收藏、歌单关联和最近播放。
- **决策**：把遍历与解析编排抽成可注入的纯 core，每轮发送注册 roots、确认存在路径和 unavailable scopes；主进程只在同一 Worker 的合法 snapshot、`done` 与 `exit(0)` 全部到齐且无 fatal 时提交对账。
- **路径安全**：删除仅限可信 root 内，使用 Windows 语义的 `resolve/relative/isAbsolute` 判断 containment；不可访问 root/subtree/entry 一律作为保护范围，root 外歌曲不参与本轮删除。
- **原子性**：删除候选在一个 better-sqlite3 transaction 内提交；任一删除失败整轮回滚。Worker 的 snapshot roots 还必须与启动该 Worker 时的 roots 集合一致。
- **计数**：full 的 total 为发现并尝试解析数，incremental 的 total 为新增/修改并尝试解析数；单文件解析失败仍计入，并保持非 fatal。
- **范围取舍**：保留现有逐条歌曲 upsert，不在本轮重写 schema、批量写入、扫描取消或并发调度；这些仍是独立技术债。
- **状态**：纯 core、删除策略和每 Worker 状态机已有定向测试；类型、Harness、56 files / 556 tests 和生产构建已通过，独立 Review 通过且 P1 Blocker = 0，残余非阻断项见同日 devlog。

## 2026-07-15 SPEC 与 Harness 采用事实/规范分层

- **SPEC 职责**：根 `SPEC.md` 记录当前代码已实现的产品、数据和运行时事实，并保留带日期的验证快照与文档职责；不再混入历史 Phase、未来设想、文件行数、完整目录树或逐测试文件清单。
- **Harness 职责**：`CONSTRAINTS.md` 继续表达长期工程目标。代码尚未满足的禁止 `any`、IPC 类型与错误处理、测试覆盖、批量事务、受控本地资源映射等规则不因现状而放宽，差异按技术债处理。
- **协议口径**：本条已被 2026-07-16 P3 受控 ID 协议实现取代；保留用于说明此前 SPEC/Harness 事实与规范分层的背景。
- **历史保留**：`DECISIONS.md` 保留旧决策及其当时背景；后续实现改变结论时标记“已被取代”，不反向删除历史。
- **范围**：本次只校准 `SPEC.md`、`harness/CONSTRAINTS.md` 和本文件，不改变源码、IPC、数据库 schema、Feature Flag 类型或运行时行为。

---

## 2026-07-13 Mini 主题子窗口菜单与 UI 修复

- **Mini 菜单**：主窗口继续通过单一 `context-menu:show-track` 调用菜单。主进程优先创建透明、沙箱隔离的短生命周期子窗口，专用 preload 仅暴露 `getInit`、`ready`、`resolve`；主进程固定标签并校验主/子 sender、主题、减少动画、action 与 enabled，保证单 pending 和单次 settle。
- **回退与取消**：子窗口创建、加载或 ready 超时失败时回退原生 Menu；Escape、失焦、切换视图、关闭 Mini 与取消操作只结算 `null`，不误触发回退菜单。
- **界面行为**：优先播放项显示完整曲目信息；“我喜欢的”空状态使用星标图标；歌单详情的“播放全部”仅在歌曲已加载、非空且允许播放时写入该歌单并播放首曲，旧异步响应不能覆盖新选择。
- **窗口**：进入 Mini 后设为不可拉伸，退出 Mini 前恢复可拉伸，仍使用固定 `400×150` 壳层。
- **状态**：Harness、生产构建、类型检查和 53 个测试文件/518 个测试通过；真实 Electron 的菜单越界、主题、DPI 与多显示器行为待人工验收。

---

## 2026-07-13 下一首提升、detached 游标与 Mini 原生菜单

- **下一首语义**：保留 `priorityQueue`、恢复锚点、已消费 ID 与内部 `commitTrack`；`insertNext` 对歌曲去重后提升到队首，连续选择采用 LIFO。本决策只替代 2026-07-12 决策中的 FIFO 排序，不替代其恢复状态机。
- **来源移除**：从播放列表移除只修改会话内 playlist，不删除曲库或数据库歌单关系；移除当前曲或恢复锚点后，以非持久化 `detachedPlaylistIndex` 保存 successor，消费后立即清理。
- **自然结束**：待播、恢复锚点、detached 或当前曲已不在来源列表时先走 `nextTrack()`；loop 只在这些状态都不存在时重播原曲。
- **Mini 菜单**：此处的受限 action、固定中文标签、单 pending 与 `action | null` 返回约束继续有效；渲染载体由上方 2026-07-13 决策替代。
- **状态**：原生菜单的真实 Electron 验收已由上方主题子窗口菜单验收替代。

## 2026-07-12 待播队列使用 FIFO 与恢复锚点

- **决策**：只保存未消费的 `priorityQueue`，不引入 queueIndex；首次插队记录来源歌曲 ID，自动播放使用内部提交函数，用户手动播放或切换来源才清空待播状态。
- **优先级**：待播和恢复锚点高于 sequential、shuffle 及自然结束的 loop；队列不进入 settings 持久化。
- **状态**：自动化门禁通过；真实 Electron 的循环、随机和 Mini 交互待主人验证。

## 2026-07-12 EQ 使用完整状态与独立增益职责

- **背景**：单段调整在首次播放前会形成 sparse gains；同一 GainNode 同时承担 EQ 后音量与淡入淡出，且正增益预设没有输出补偿
- **决策**：始终维护 10 段有限 gains，预设一次性提交；信号链拆为 `EQ → eqHeadroomGain → fadeGain → volumeGain`，EQ 补偿由 256 个对数频点的级联峰值计算
- **边界**：Q 固定为 1.4，预设曲线不变；平坦响应 headroom 为 1；IPC 拒绝 NaN、Infinity、越界和错误长度
- **状态**：专项单测、类型检查和全量门禁通过；真实曲目 A/B、削波与音色仍待主人验证

## 2026-07-12 关闭窗口使用主进程协调器与关联请求

- **背景**：Electron `close` 事件必须同步决定是否阻止，renderer 弹窗无法直接承担窗口生命周期；重复关闭、旧响应和 renderer reload 还会产生竞态
- **决策**：主进程 CloseCoordinator 统一读取偏好、同步阻止关闭并用唯一 `requestId` 关联 renderer 响应；只接受当前主窗口 webContents 的一次合法结果
- **回退**：renderer 未 ready、不可发送或发送失败时安全最小化；tray 关闭时任何偏好都直接退出
- **退出边界**：托盘退出、before-quit 和系统退出先进入 quitting 状态并绕过询问；迷你播放器关闭按钮继续只退出 mini mode
- **持久化**：ask 模式只有勾选“不再询问”并选择最小化或退出时才保存，保存失败不阻断本次决定
- **状态**：自动化验证通过；`1000×680` 与 `400×150` Electron smoke 通过，系统会话结束等 OS 级退出仍由主人最终确认

## 2026-07-11 动态效果使用全局 token 与独立组合属性

- **背景**：各页面动画时长、按压强度和 reduced-motion 处理分散，按钮 `transform` 还可能覆盖播放 pulse 或虚拟列表定位
- **决策**：motion token 只在 `:root` 定义；按钮按压使用独立 `scale`，装饰位移使用独立 `translate`，定位与既有 pulse/range 允许继续使用 `transform`
- **状态归属**：手动 `reducedMotion` 只放 `uiStore` 并显式持久化，不进入 `playerStore`、AudioEngine 或 feature flags
- **一致性**：CSS 使用 `data-reduced-motion`/系统 media query，JS 使用统一 helper；两种偏好采用 OR 规则
- **退出协议**：Dialog 与 QueuePanel 使用幂等 Hook，在根 `animationend` 后卸载，并以 fallback、微任务降级和 StrictMode 生命周期测试兜底
- **权衡**：普通页面和集合只做入场，只有歌词层、overlay 和 panel 承担退场状态，避免为所有内容引入常驻生命周期复杂度
- **状态**：自动化实现完成，最终 Electron 视觉体感待主人验证

## 2026-07-11 播放器按活跃状态调度与 dirty-key 持久化

- **背景**：三个播放器在暂停时仍持续 RAF，document 拖拽缺少统一异常清理，MiniPlayer 顶层订阅 playlist，任意 store 更新都会重排并固定写入三项设置
- **决策**：RAF 由可见性、播放和拖拽状态驱动；document drag 使用统一 cleanup hook；Mini queue 以条件 connector 隔离 playlist selector；播放器设置按 dirty key 在首个 500ms 窗口合并保存
- **原因**：直接消除可测的空闲调度、无关提交、listener 生命周期风险和 SQLite 写放大，同时保留暂停拖拽、歌词点击和崩溃恢复语义
- **权衡**：增加两个小 Hook 和一个 queue connector；暂停状态需要在 duration、seek、歌词变化时显式执行一次同步
- **边界**：保留 5 秒 `lastCurrentTime` 安全网；不改 React.lazy、AudioEngine、useAudioSync、数据库 schema；songs snapshot 与 React.memo 未达到门槛，不实施
- **指标**：不以 memo/effect 数量作为性能指标，只接受 RAF、listener、Profiler、IPC 与 settings write 的可复现结果
- **状态**：自动化验证通过，真实 Electron CPU 与视觉交互待主人验证

## 2026-07-10 迷你播放器三视图共用固定壳层

- **背景**：歌曲、歌词和队列视图的内容高度不同，动态调整 BrowserWindow 会造成切换抖动和位置漂移
- **决策**：三种迷你视图共用固定 `400×150` 窗口；歌词复用 `useTrackLyrics`，播放复用 `playerStore.playTrack()`，不嵌入全尺寸页面组件
- **原因**：固定壳层保持窗口稳定，共享数据入口避免重复歌词请求和重复播放记账，紧凑子组件可独立控制溢出
- **权衡**：紧凑视图只展示核心信息，歌词限制为当前句和下一句，队列不提供拖拽排序
- **状态**：自动化验证通过，视觉与拖拽体验待主人验证

## 2026-07-10 歌词滚动改用 scrollTo

- **背景**：原决策（2026-06-10）使用 `transform: translateY()` 实现歌词滚动
- **决策**：改用 `scrollTo()` + `behavior: 'smooth'`（普通滚动）或 `behavior: 'auto'`（切歌跳转）
- **原因**：`scrollTo()` 更简单，浏览器原生支持平滑滚动，无需手动计算 transform 偏移
- **权衡**：失去 GPU 硬件加速，但现代浏览器对 scrollTo 优化足够
- **状态**：已验证
- **替代**：原 2026-06-10 决策（transform 方案）已被此决策替代

## 2026-06-11 封面主色 HSL 亮度过滤

- **背景**：纯 RGB 通道值判断浅色不准确，某些色调（浅黄、浅蓝）漏判
- **决策**：改用 HSL 亮度 L 过滤，L > 0.70 跳过，L < 0.08 跳过，L > 0.35 自动压暗
- **原因**：HSL 亮度覆盖所有色调，比 RGB 更准确
- **权衡**：计算量略增（RGB→HSL 转换），但可忽略
- **状态**：已验证

## 2026-06-10 歌词滚动用 transform 替代 scrollTop

- **背景**：歌词逐行滚动用 `scrollTop` 在某些机器上掉帧
- **决策**：改用 CSS `transform: translateY()` + `will-change: transform` 开启 GPU 硬件加速
- **原因**：transform 走合成器线程，不触发主线程重排
- **权衡**：需要手动计算偏移量，代码复杂度略增
- **状态**：已被 2026-07-10 决策替代

## 2026-06-10 歌词背景用封面主色纯色，不用模糊

- **背景**：低分辨率封面拉伸后模糊感很重（主人反感）
- **决策**：歌词背景用封面主色纯色背景
- **原因**：纯色干净，不依赖素材分辨率
- **权衡**：视觉效果不如模糊丰富
- **状态**：已验证

## 2026-06-09 自定义协议替代 Base64 IPC

- **背景**：音频文件通过 IPC 传 Base64 导致内存暴涨和通道拥塞
- **决策**：注册 `qinplayer://` 自定义协议，主进程拦截请求直接返回文件流
- **原因**：绕过 CORS，支持 Range Requests，零拷贝
- **权衡**：需要在 `app.whenReady` 之前注册特权协议
- **状态**：已验证

## 2026-06-09 currentTime 降级处理

- **背景**：播放秒数放 Zustand Store 导致每秒触发全局 re-render
- **决策**：currentTime 用 `useRef` + `timeupdate` 事件直接更新 DOM
- **原因**：进度条是高频更新（每秒 ~4次），不适合全局状态
- **权衡**：进度条状态与 Zustand 脱离，拖拽时才派发 Action
- **状态**：已验证

## 2026-06-09 scanProgress 不放 Zustand

- **背景**：扫描进度是临时状态，扫描结束后就不需要了
- **决策**：scanProgress 用组件内部 useState 管理
- **原因**：避免 Zustand Store 膨胀，临时状态不应全局化
- **权衡**：无法从其他组件访问扫描进度（但也不需要）
- **状态**：已验证

## 2026-06-09 SQLite 多线程安全

- **背景**：better-sqlite3 是同步阻塞的，不支持多线程同时写入
- **决策**：Worker 线程只负责文件扫描和 ID3 解析，通过 postMessage 发纯 JSON 给主进程，主进程开启事务批量 INSERT
- **原因**：避免数据库锁竞争和数据损坏
- **权衡**：主进程承担写入压力，但批量事务性能足够
- **状态**：Worker 不访问 SQLite 仍符合当前实现；批量事务部分已偏离为逐条 upsert，严格目标继续保留在 `CONSTRAINTS.md`

## 2026-06-08 选型：electron-vite + better-sqlite3

- **背景**：需要端到端类型安全的 Electron 构建方案
- **决策**：electron-vite 编译 TypeScript → CommonJS，better-sqlite3 同步 API
- **原因**：electron-vite 专为 Electron 设计，better-sqlite3 性能高
- **权衡**：better-sqlite3 需要原生编译（electron-rebuild）
- **状态**：已验证

## 2026-06-08 主进程用 TypeScript

- **背景**：外部 Mentor 建议端到端类型安全
- **决策**：主进程用 TypeScript，通过 electron-vite 编译为 CommonJS
- **原因**：主进程与渲染进程共享 `src/types/` 目录，IPC 类型编译期检查
- **权衡**：构建链多一步编译，但 electron-vite 自动处理
- **状态**：已验证

## 2026-06-08 IPC 强类型约束

- **背景**：裸字符串 IPC 通道名容易拼错，any 返回值丢失类型信息
- **决策**：所有 IPC 通道在 `src/types/ipc.ts` 的 `IpcChannels` 接口中定义
- **原因**：编译期类型安全，IDE 自动补全
- **权衡**：新增通道需要同步更新接口定义
- **状态**：已被 2026-07-16 三方向合同与唯一 typed Electron 边界取代

---

## 2026-07-12 「我的」页面数据采集与展示

- **背景**：需要展示用户实际听歌时长，但现有 play_count 只记录次数不记录时长
- **决策**：从 AudioEngine timeupdate 取真实媒体时间增量，`Math.min(mediaDelta, wallDelta)` 计算，秒级精度，30 秒批量落库
- **原因**：isPlaying 是意图状态，缓冲/加载/拖拽都会误计；只有媒体真正前进的时间才算听歌
- **权衡**：异常退出最多丢失未 flush 的 30 秒数据，不作零丢失承诺
- **状态**：已实施

- **决策**：日期统计使用本地自然日，禁止 UTC 切片
- **原因**：中国时区 UTC+8，凌晨用 UTC 会记入前一天
- **权衡**：跨时区用户可能不适用，但本项目是纯本地播放器
- **状态**：已实施

- **决策**：排行榜初版只用现有 songs.play_count 做全部时间排行，不新增播放事件表
- **原因**：本周/本月排行需要逐次播放事件模型，复杂度高，初版不值得
- **权衡**：用户可能期待时间范围筛选，但全部时间排行已满足基本需求
- **状态**：已实施，后续可扩展

- **决策**：环形图显示"本周活跃 N/7"（活跃天数/7），不显示无分母的百分比
- **原因**：62% 这种百分比没有明确分母，用户无法理解含义
- **权衡**：视觉上没有百分比直观，但语义更清晰
- **状态**：主人已确认

- **决策**：昵称初版固定为"秋月"，不支持编辑
- **原因**：减少初版复杂度，不做账号/资料系统
- **权衡**：用户无法自定义昵称，但初版够用
- **状态**：已被当前昵称与头像编辑能力取代；本条仅保留为初版历史

---

## 2026-07-17 播放失败、恢复进度与 Media Session 竞态

- **背景**：媒体加载/播放失败只写 console，恢复 seek 可能在 metadata 前丢失，快速切歌的旧封面请求可能覆盖新歌。
- **决策**：失败后停在当前歌曲并显示固定中文提示，不自动跳过或无限重试。
- **原因**：坏文件和临时设备错误应由用户决定重试或跳过，避免队列被静默推进。
- **权衡**：播放会保持停止状态直到用户操作。
- **状态**：已实施

- **决策**：Retry 直接重载同一 Track，恢复 `currentTimeRef` 中最后一个有限、非负位置，不调用 `playTrack`。
- **原因**：避免重复最近播放/播放次数记账、清队列或改变来源游标。
- **权衡**：底层错误持续存在时 Retry 仍会再次失败并继续展示提示。
- **状态**：已实施

- **决策**：pending seek 绑定 Track key，在 metadata 后 clamp、只消费一次，并先于 autoplay 应用。
- **原因**：防止从 0 先播放再跳转，以及旧曲 seek 串到新曲。
- **权衡**：metadata 未就绪前不直接写入媒体位置。
- **状态**：已实施

- **决策**：Media Session 采用 generation + AbortController；文字 metadata 先提交，封面 loader 只拥有自己创建的 Blob，最新请求接管后才释放上一有效 Blob。
- **原因**：仅 abort 不能覆盖不响应取消或已进入 Blob 创建阶段的迟到请求。
- **权衡**：一次切歌会产生文字和封面两次 metadata 提交。
- **状态**：已实施

---

## 2026-07-17 Renderer 恢复页与 Liked 即时刷新

- **背景**：Renderer render/lifecycle 异常会留下空白界面，Liked 页取消收藏后仍保留已删除行。
- **决策**：在 `React.StrictMode` 外层放置根级 Error Boundary，fallback 只显示固定中文信息，“重新加载”执行完整页面 reload。
- **原因**：Boundary 必须包住整个 `App` 才能捕获其 render/lifecycle 异常；完整 reload 是最小且可预测的恢复路径。
- **权衡**：不捕获异步 rejection、事件 handler、Electron main 或音频错误，也不做局部组件恢复和远程上报。
- **状态**：已实施

- **决策**：`SongList` 对每首歌曲设置独立的进行中锁，只在 like/unlike IPC 成功后更新内部星标并通知调用方；Liked 页面收到 `liked=false` 后只过滤自己的查询结果。
- **原因**：数据库是收藏事实来源，同时需要让当前页面即时反映成功操作。
- **权衡**：不做乐观更新、不重新请求全列表、不引入全局收藏 Store，也不修改当前会话的播放来源列表。
- **状态**：已实施

---

## 2026-07-17 Tray 可测试边界与零框架警告

- **背景**：Tray 缺少 callback/flag/生命周期直接测试，Vitest 配置同时触发 Vite CJS 和不兼容 React plugin 选项警告。
- **决策**：Tray 保留现有模块入口，在内部使用可注入 controller adapter；测试直接验证菜单模板、动作路由、窗口恢复和 create/destroy/create 生命周期。
- **原因**：避免 Vitest 依赖真实 Windows Tray，同时覆盖文本之外的行为合同。
- **权衡**：真实系统托盘图标、右键弹出和 Windows 生命周期仍需 Electron 人工 smoke。
- **状态**：已实施

- **决策**：Vitest 配置迁为 ESM `.mts`，alias 使用 `import.meta.url`，测试链不加载 `@vitejs/plugin-react`；production `electron.vite.config.ts` 保持原 React plugin。
- **原因**：测试不需要 Fast Refresh，移除跨 Vite 主版本加载的 plugin 即可消除四类框架 warning，不必调整依赖。
- **权衡**：测试 TSX 依赖 Vitest/Vite 默认转换；由 `@/components/SongList` 定向测试和 production build 双重验证。
- **状态**：已实施；`package.json` 与 lockfile 未修改

- **决策**：测试 setup 只把 React `not wrapped in act` / `wrap-tests-with-act` 警告升级为失败，其他 `console.error` 原样转发。
- **原因**：让异步测试未 settle 的回归立即阻断，同时保留业务错误测试的诊断输出。
- **权衡**：React 若更改 warning 文案，需要按测试规范更新窄范围 matcher。
- **状态**：已实施

---

*决策做出后立即记录，状态必须更新。*
