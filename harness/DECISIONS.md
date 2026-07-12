# QinPlayer 决策记录

> 按时间倒序，最新的在最前面

---

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
- **状态**：已验证

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
- **状态**：已验证

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
- **状态**：主人已确认

---

*决策做出后立即记录，状态必须更新。*
