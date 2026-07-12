# QinPlayer — 纯本地音乐播放器

> 基于源码分析更新至：2026-07-11

---

## 项目概况

| 项目 | 说明 |
|------|------|
| 定位 | 纯本地音乐播放器，不联网 |
| 作者 | 秋月 + 衾衾 (Hermes Agent) + codex |
| 技术栈 | Electron + React + TypeScript + Zustand + electron-vite |
| 窗口 | 1000×680，可拉伸，适配 2K DPI，支持尺寸持久化 |
| 主题 | 亮色/暗色/跟随系统，暗色底色 #121212 |

---

## 目录结构

```
QinPlayer/
├── electron/                          # Electron 主进程
│   ├── main.ts                        # 主进程入口 (340行)
│   ├── preload.ts                     # 预加载脚本
│   ├── tray.ts                        # 系统托盘
│   ├── db/
│   │   └── database.ts                # SQLite 数据库 (180行)
│   ├── ipc/
│   │   ├── songs.ts                   # 歌曲 CRUD
│   │   ├── playlists.ts               # 歌单管理 (171行)
│   │   ├── scan.ts                    # 音乐扫描 (255行)
│   │   ├── eq.ts                      # 均衡器
│   │   ├── settings.ts                # 设置
│   │   ├── window.ts                  # 窗口控制
│   │   └── protocol.ts               # 协议处理
│   ├── windowBounds.ts                # 窗口 bounds 持久化 (152行)
│   ├── closeBehavior.ts               # 关闭窗口行为协调器
│   └── workers/
│       └── scanner.ts                 # 扫描 Worker (393行)
│
├── src/                               # React 渲染层
│   ├── main.tsx                       # React 入口
│   ├── App.tsx                        # 根组件
│   │
│   ├── components/                    # 共享组件
│   │   ├── PlayerBar.tsx              # 底部播放控制条 (379行)
│   │   ├── SongList.tsx               # 歌曲列表（共享）
│   │   ├── LyricsPanel.tsx            # 歌词滚动面板 (121行)
│   │   ├── MiniPlayer.tsx             # 迷你模式三视图壳层
│   │   ├── MiniLyricsView.tsx         # 迷你歌词紧凑视图
│   │   ├── MiniQueueView.tsx          # 迷你队列紧凑视图
│   │   ├── SortMenu.tsx               # 通用排序菜单
│   │   ├── CloseConfirmDialog.tsx      # 关闭窗口确认弹窗
│   │   ├── Equalizer.tsx              # 均衡器
│   │   ├── Sidebar.tsx                # 侧边栏导航
│   │   ├── TitleBar.tsx               # 标题栏
│   │   ├── Content.tsx                # 内容区路由
│   │   ├── ContextMenu.tsx            # 右键菜单
│   │   ├── PlaylistPanel.tsx          # 播放队列面板
│   │   ├── CreatePlaylistDialog.tsx   # 创建歌单弹窗
│   │   ├── SongInfoDialog.tsx         # 歌曲信息弹窗
│   │   ├── Icons.tsx                  # SVG 图标库
│   │   └── Equalizer.css              # 均衡器样式 (274行)
│   │
│   ├── pages/                         # 页面
│   │   ├── LocalMusic.tsx             # 本地音乐 (192行)
│   │   ├── Lyrics.tsx                 # 歌词页面
│   │   ├── Albums.tsx                 # 专辑页面
│   │   ├── Playlists.tsx              # 歌单页面 (337行)
│   │   ├── RecentlyPlayed.tsx         # 最近播放
│   │   ├── Liked.tsx                  # 我喜欢的
│   │   ├── MyProfile.tsx              # 我的（听歌统计）
│   │   ├── Search.tsx                 # 搜索结果
│   │   └── Settings.tsx               # 设置页面 (495行)
│   │
│   ├── stores/                        # Zustand 状态管理
│   │   ├── playerStore.ts             # 播放器状态与统一播放入口
│   │   ├── eqStore.ts                 # 均衡器状态 (198行)
│   │   └── uiStore.ts                 # UI 状态
│   │
│   ├── hooks/                         # React Hooks
│   │   ├── useAudioSync.ts            # 音频同步 (261行)
│   │   ├── useTrackLyrics.ts          # 曲目歌词加载与竞态隔离
│   │   └── useTheme.ts                # 主题切换
│   │
│   ├── utils/                         # 工具函数
│   │   ├── AudioEngine.ts             # 音频引擎 (459行)
│   │   ├── lrcParser.ts               # LRC 歌词解析 (196行)
│   │   ├── colorExtract.ts            # 封面取色
│   │   ├── featureFlags.ts            # 功能开关
│   │   ├── albumSort.ts               # 专辑本地化排序
│   │   ├── trackSort.ts               # 歌曲本地化稳定排序
│   │   ├── formatTime.ts              # 时间格式化
│   │   ├── currentTimeRef.ts          # 播放时间 ref
│   │   └── mediaSession.ts            # 系统媒体控制
│   │
│   ├── styles/                        # 样式
│   │   ├── global.css                 # 全局样式
│   │   ├── base.css                   # 基础变量
│   │   ├── themes.css                 # 主题变量
│   │   ├── lyrics.css                 # 歌词页面 (546行)
│   │   ├── playerbar.css              # 播放控制条 (354行)
│   │   ├── settings.css               # 设置页面 (290行)
│   │   ├── playlist-panel.css         # 播放队列面板 (237行)
│   │   ├── playlists.css              # 歌单页面 (196行)
│   │   ├── songlist.css               # 歌曲列表 (191行)
│   │   ├── sidebar.css                # 侧边栏
│   │   ├── titlebar.css               # 标题栏
│   │   ├── miniplayer.css             # 迷你模式固定壳层与三视图
│   │   ├── content.css                # 内容区
│   │   ├── localmusic.css             # 本地音乐 (163行)
│   │   ├── albums.css                 # 专辑页面
│   │   ├── sort-menu.css              # 通用排序菜单
│   │   ├── recent-liked.css           # 最近/喜欢
│   │   ├── search.css                 # 搜索
│   │   ├── contextmenu.css            # 右键菜单
│   │   └── dialog.css                 # 弹窗
│   │
│   └── types/                         # TypeScript 类型
│       ├── ipc.ts                     # IPC 通道 + FeatureFlags 类型 (218行)
│       ├── index.ts                   # 通用类型
│       └── electron.d.ts              # Electron API 类型
│
├── tests/                             # 测试 (22 个测试文件)
│   ├── playerStore.test.ts
│   ├── uiStore.test.ts
│   ├── useAudioSync.test.tsx
│   ├── featureFlags.test.ts
│   ├── lrcParser.test.ts
│   ├── formatTime.test.ts
│   ├── SongList.test.tsx
│   ├── Sidebar.test.tsx
│   ├── PlayerBar.test.tsx
│   ├── LyricsPanel.test.tsx
│   ├── LyricsFullscreen.test.tsx
│   ├── MiniPlayer.test.tsx
│   ├── MiniLyricsView.test.tsx
│   ├── MiniQueueView.test.tsx
│   ├── useTrackLyrics.test.tsx
│   ├── Playlists.test.tsx
│   ├── PlaylistPanel.test.tsx
│   ├── windowBounds.test.ts
│   ├── harnessChecks.test.ts
│   ├── albumSort.test.ts
│   ├── AlbumSortMenu.test.tsx
│   └── Albums.test.tsx
│
├── harness/                           # AI 工程约束
│   ├── SPEC.md
│   ├── CONSTRAINTS.md
│   ├── DECISIONS.md
│   └── TEST_CONVENTIONS.md
│
├── docs/                              # 文档
│   ├── devlog/
│   └── plans/
│
├── SPEC.md                            # 项目规格书
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
└── vitest.config.ts
```

---

## 功能范围

### 播放
- 播放/暂停/上一首/下一首/进度条/音量
- 播放模式：顺序播放、单曲循环、随机播放
- 切歌淡入淡出（独立 `fadeGain` 实现，不覆盖用户 `volumeGain`）

### 均衡器
- 10 段参数均衡器（32Hz ~ 16kHz，BiquadFilterNode 实现）
- 5 个预设：流行、摇滚、古典、低音增强、人声突出
- 自定义增益调节（-12dB ~ +12dB），防抖保存到数据库
- 引擎始终维护完整的 10 段有限增益状态；IPC 拒绝非有限、越界或错误长度输入
- 信号链为 `source → EQ → eqHeadroomGain → fadeGain → volumeGain → destination`；EQ 补偿按频响峰值计算，平坦响应保持 1

### 歌单
- 手动创建歌单，支持增删改重命名
- 歌曲排序：按添加顺序 / 按播放次数，升序/降序

### 搜索
- 按歌名、歌手搜索

### 本地音乐
- 默认按歌名拼音/本地化字母序升序，可切换歌名、歌手、播放次数及升序/降序
- 排序仅在页面内派生且不持久化；从当前页面起播时，播放队列使用当前排序

### 歌词
- 读取本地 .lrc 文件，逐行滚动，当前行高亮
- 支持三种双语格式：同时间戳双行（原文+翻译）、｜分隔、空格分隔
- 歌词界面：左右分屏，左封面+歌曲信息，右歌词滚动
- 无歌词时歌词区域显示空白（不显示提示文字）
- 单语歌词默认显示约 6 行（关闭 lyricsMoreLines 后回退 3 行），双语歌词始终显示约 3 行
- 背景：封面主色纯色背景（HSL 亮度过滤，自动压暗到安全范围）
- 歌词时间轴偏移设置（±0.5s），兼容不准的 LRC 文件

### 专辑
- 网格视图展示所有专辑（封面 + 专辑名 + 歌手）
- 默认按专辑名的拼音/本地化字母序升序排列，可切换按代表歌手排序及升序/降序
- 专辑名、歌手、升序、降序收在同一层排序菜单中，触发器持续显示当前字段和方向；专辑总数保持只读文本
- 当前排序字段为空或为未知值时，该专辑在升序和降序中都位于末尾
- 排序只改变网格卡片顺序，不改变专辑详情中的歌曲源顺序
- 专辑仍只按名称分组；卡片代表歌手取该分组遇到的第一首歌曲
- 点击专辑进入歌曲列表

### 最近播放
- 记录 50 首

### 我喜欢的
- 列表里每首歌旁心形按钮标记
- 默认按歌名升序，可切换歌名、歌手、播放次数及升序/降序
- 空值、未知歌手和非法播放次数在升降序中都固定末尾；并列项按歌名、歌手、歌曲 ID 升序决胜

### 我的
- 个人信息（头像、昵称，可在设置页编辑；累计听歌时长、起始日期）
- 本周活跃环形图（本周有播放记录的天数 N/7）
- 今日/本周/本月/连续听歌时长
- 近 7 天听歌趋势柱状图（纯 CSS 实现）
- 总计/本月/本周/今日时长统计卡片
- 全部时间播放排行 Top 10（复用 songs.play_count，不修改 SongList）
- 统计基于真实媒体时间增量（AudioEngine timeupdate），不按 isPlaying 定时计
- 数据按本地自然日聚合，秒级精度，30 秒批量落库
- `profile` feature flag 控制入口和数据采集

### 迷你模式
- 固定 `400×150` 壳层，歌曲、歌词、队列三种视图切换时不改变窗口尺寸或位置
- 歌曲视图显示封面、歌名、歌手/专辑、进度与时长；歌词视图显示当前句和下一句；队列视图支持滚动、当前项定位与点击播放
- 音量、置顶、展开位于工具栏左侧（窗口控制）；上一首、播放/暂停、下一首居中（播放控制）；视图选择和播放方式位于右侧（内容切换）；关闭按钮固定在右上角
- `playback` 或 `miniMode` 关闭时不渲染；`lyrics` / `queuePanel` 关闭时隐藏对应入口，并从失效视图安全回退到歌曲视图
- 主窗口按钮触发；进入前保存正常 bounds，退出时恢复，视图切换不发送窗口 IPC

### 系统托盘
- 关闭窗口行为可选：最小化到托盘、直接退出、每次询问；缺失或非法设置默认最小化
- 每次询问使用 renderer 自定义弹窗，Escape 取消，勾选“不再询问”后才保存本次最小化/退出选择
- tray feature flag 关闭时所有关闭偏好都按直接退出执行，避免窗口隐藏后无法恢复
- 右键菜单：上一首/播放暂停/下一首/显示主窗口/退出
- 托盘“退出”、before-quit 和系统退出绕过询问弹窗

### 系统媒体控制
- Media Session API 接管 Windows 任务栏媒体控制
- 响应键盘多媒体按键（播放/暂停/切歌）

### 窗口尺寸持久化
- 退出时保存窗口位置和尺寸，下次启动恢复
- 迷你模式进入前保存正常 bounds，退出时恢复
- 最大化/最小化状态保存与恢复
- 多显示器变化时自动 clamp 到可见区域，标题栏至少 60px 可见
- feature flag `windowSizePersist` 控制，默认开启

---

## UI 设计

### 风格
Apple Music 风，精致克制。

### 主窗口布局（左右分栏）
- 左侧导航栏：搜索、最近播放、本地音乐、专辑、歌单、我喜欢的、我的、设置
- 右侧内容区：歌曲列表 / 专辑网格 / 歌词界面 / 搜索结果
- 底部固定：播放控制条

### 歌曲列表
列表视图：序号、歌名、歌手、专辑、时长

### 歌词界面
左右分屏：左侧大封面 + 歌曲信息 + 播放控制，右侧歌词逐行滚动。背景用封面主色纯色。支持全屏切换、置顶、音量调节、播放方式切换。所有元素用 vw/vh 视口单位适配不同分辨率。

**歌词界面播放控制**：
- 进度条：8px 点击热区 + 4px 轨道/填充（和主页面一致）
- 播放方式按钮：单曲循环/顺序播放/随机播放（复用主页面逻辑）
- 音量按钮：折叠弹窗，竖向音量条，可拖动调节
- 布局：[播放方式] [上一首] [播放/暂停] [下一首] [音量]

### 主题系统
- 亮色主题
- 暗色主题（中性灰黑 #121212）
- 跟随系统
- 切换方式：设置页面 + 三选项

---

## 交互规则

| 行为 | 方案 |
|------|------|
| 歌曲导入 | 选文件夹扫描，启动时自动检测新增 |
| 歌曲信息 | ID3 标签读取，标签缺失用文件名兜底 |
| 歌词来源 | 同目录同名 .lrc 文件 |
| 无封面 | 显示默认占位图 |
| 新建歌单 | 导航栏"歌单"旁 + 按钮 |
| 右键菜单 | 播放、添加到歌单、从歌单移除、打开文件所在目录、歌曲信息 |
| 关闭窗口 | 按设置最小化到托盘、直接退出或每次询问；无托盘时直接退出 |
| 迷你模式 | 主窗口按钮触发 |

---

## 数据存储

- **数据库** — SQLite（better-sqlite3，同步 API，性能高）
- **路径** — 默认 AppData/QinPlayer，可在设置里自定义文件夹
- **备份** — 设置里支持导入/导出数据
- **持久化内容** — 歌单、播放记录、歌曲元数据、设置、上次播放位置

---

## 设置页面

| 分类 | 内容 |
|------|------|
| 个人信息 | 昵称编辑（≤20字符）、头像更换（jpg/png，复制到 userData） |
| 通用 | 主题切换（亮色/暗色/跟随系统）、关闭窗口行为、减少动画、开机自启动 |
| 播放 | 音频输出设备、默认播放模式、淡入淡出开关 |
| 文件管理 | 音乐文件夹路径（多目录）、歌词搜索规则、歌词时间轴偏移（±0.5s） |
| 数据 | 存储位置自定义、导入/导出数据 |
| 关于 | 版本号、GitHub 链接、检查更新 |

---

## 架构总览

### 运行时架构

```
┌─────────────────────────────────────────┐
│            React Renderer               │
│                                         │
│  App → Sidebar / Content / PlayerBar    │
│              ↓                          │
│     Zustand Stores（3 个）              │
│     playerStore / uiStore / eqStore     │
│              ↓                          │
│     useAudioSync（状态→引擎同步）       │
│              ↓                          │
│     AudioEngine（HTMLAudio + Web Audio）│
│              ↓                          │
│     Web Audio API（GainNode / EQ）      │
└────────────────┬────────────────────────┘
                 │ IPC（invoke / send / on）
┌────────────────▼────────────────────────┐
│         Electron Main Process           │
│                                         │
│  IPC Handlers（songs/playlists/settings）│
│       ↓                                 │
│  SQLite（better-sqlite3，同步 API）      │
│  Window Bounds / Tray / Protocol        │
│       ↓                                 │
│  Scanner Worker（ID3 解析，不写库）      │
└─────────────────────────────────────────┘
```

### 核心播放数据流

```
用户点击歌曲
    ↓
playerStore.playTrack()（原子更新曲目、时长、播放状态与播放记账）
    ↓
useAudioSync 监听 currentTrack 变化
    ↓
AudioEngine.load() → Web Audio API
    ↓
timeupdate 事件（250ms 节流）
    ↓
currentTimeRef（模块级 ref，不触发 re-render）
    ├──→ RAF 循环 → PlayerBar 进度条 DOM 直接操作
    └──→ RAF 循环 → 歌词索引二分查找 → LyricsPanel
```

### 状态所有权

| 状态 | 唯一负责人 | 不允许谁管理 |
|------|-----------|-------------|
| 当前歌曲 | playerStore | React 局部 state |
| 播放队列 | playerStore | AudioEngine 自行维护 |
| 当前播放时间 | currentTimeRef | Zustand |
| 播放/暂停 | playerStore.isPlaying | AudioEngine 内部状态 |
| EQ 参数 | eqStore | UI 组件 |
| 主题/迷你模式 | uiStore | playerStore |
| 歌曲数据库 | 主进程 + SQLite | Renderer 直接操作 |
| 音频播放 | AudioEngine 单例 | React 组件创建第二个实例 |
| 歌词数据 | useTrackLyrics 的组件局部 state | playerStore |

### 进程与模块边界

```
Renderer Components → 可依赖 → Stores / Hooks / Utils
Stores → 可依赖 → 纯工具模块、类型
AudioEngine ✗ 不依赖 React 组件 ✗ 不直接操作 UI
Renderer ✗ 不直接访问 SQLite ✗ 不用 Node.js fs
Worker ✗ 不直接写 SQLite ✓ 仅扫描+解析
Main Process ✓ 负责 SQLite、文件系统、窗口、IPC
```

---

## 技术架构

### 核心播放引擎

**弃用纯 `<audio>` 标签，引入 Web Audio API**

- 使用 Web Audio API（可结合 Howler.js 或自行封装轻量级 AudioNode 图）
- 淡入淡出：`GainNode.gain.linearRampToValueAtTime()` 实现毫秒级平滑过渡
- 音频输出设备切换：`AudioContext.setSinkId()` 稳健切换
- 预留 `AnalyserNode` 接口，未来可扩展频谱图

### 媒体库扫描（Worker Threads）

> ⚠️ 绝对不要在主进程主线程同步读取和解析大量音频文件的 ID3 标签，会导致 UI 卡顿甚至白屏。

- 使用 Node.js `worker_threads` 模块创建独立扫描线程
- 推荐库：`music-metadata`（解析 ID3/FLAC 等元数据）
- 扫描线程通过 `postMessage` 实时发送进度给主进程，再由 IPC 推送给渲染进程更新 UI

### 增量扫描策略

- SQLite 中记录文件绝对路径 + `mtime`（最后修改时间）
- 启动时对比文件系统与数据库记录，仅对新增/修改的文件触发 Worker 解析，实现秒级启动

### 本地资源安全加载（Custom Protocol）

> ⚠️ 严禁将本地几十 MB 的音频文件读取为 Base64 通过 IPC 传给前端，会导致内存暴涨和 IPC 通道拥塞。

- 注册自定义协议 `qinplayer://`
- 流程：前端请求 `qinplayer://audio?id=1024` → 主进程拦截 → 查询 SQLite 获取物理路径 → 读取文件流响应
- 绕过浏览器本地文件安全限制（CORS），原生支持 Range Requests（拖动进度条缓冲）

### Zustand 状态管理

**Store 切片（性能隔离）**

- `usePlayerControlStore`：播放/暂停、当前曲目、播放列表、音量、模式（低频）
- `useUIStore`：侧边栏折叠、迷你模式状态、主题（低频）

**进度条状态降级处理**

- `currentTime`（当前播放秒数）不放入 Zustand 全局 Store
- `useAudioSync` 监听 AudioEngine 的 `timeupdate` 事件（250ms 节流），写入模块级 `currentTimeRef`
- RAF 循环读取 `currentTimeRef`，直接操作进度条 DOM + 歌词索引二分查找
- Zustand 仅在用户主动拖拽进度条时，派发 Action 修改播放引擎时间

### 歌词滚动

- 普通行切换使用 `scrollTo()` + `behavior: 'smooth'` 平滑滚动
- 切歌或大跨度跳转使用 `behavior: 'auto'` 立即定位，并隐藏原生滚动条

### 歌曲列表表头对齐

- 表头放在滚动容器内部，`position: sticky; top: 0` 固定
- 解决滚动条宽度导致表头与数据列错位的问题

### 封面主色提取（HSL 亮度）

- 用 HSL 亮度 L 过滤：L > 0.70 跳过（太浅），L < 0.08 跳过（太暗）
- 提取后如果 L > 0.35，自动按比例压暗到 L ≈ 0.30
- 比纯 RGB 通道值判断更准确，覆盖所有色调的浅色

### LRC 双语歌词解析

- 同时间戳双行格式：第一条原文，第二条翻译
- 兼容 ｜ 分隔和空格分隔的双语格式

### 无边框窗口交互防冲突

- 使用 `-webkit-app-region: drag` 实现顶部拖拽时，必须严格排查子元素
- 搜索框、按钮、歌词滚动区域必须显式声明 `-webkit-app-region: no-drag`，防止点击和选中文本失效

---

## 开发里程碑

### Phase 1：骨架期（MVP Core）
- 跑通 electron-vite + Electron + React + TS 基础工程
- 实现无边框窗口及自定义拖拽
- 实现 `protocol.handle` 自定义协议（特权注册 + Range Requests）与 Web Audio API 基础播放/暂停
- 主进程使用 TypeScript，通过 electron-vite 编译为 CommonJS
- IPC 通道在 `src/types/ipc.ts` 中定义强类型映射

### Phase 2：数据与扫描期（Data Layer）
- 引入 better-sqlite3
- 完成 Worker 线程后台扫描与 ID3 解析
- 实现基础歌单 CRUD、搜索与 UI 渲染

### Phase 3：灵魂注入期（UX Polish）
- 接入 Media Session API
- 打磨 LRC 歌词 GPU 滚动算法
- 实现切歌淡入淡出、主题切换及所有细节动画
- 打包测试（electron-builder）与兼容性修复

---

## 已知约束

- 不联网，纯本地
- 不做全局快捷键（暂时）
- 不导入 .m3u 歌单，只手动建
- 窗口关闭默认最小化到托盘，也可设置直接退出或每次询问；无托盘时必须退出
- 单实例锁：不允许重复打开多个窗口
- 主进程必须用 TypeScript + electron-vite（端到端类型安全）
- 自定义协议必须在 app.whenReady 之前注册为特权协议
- Worker 线程不能直接写 SQLite（只解析不写库）
- 主进程不能用同步 I/O（readdirSync/statSync 会卡死窗口）
- `currentTime` 不放 Zustand（高频更新用模块级 ref）

---

## 测试覆盖

- 框架：Vitest + @testing-library/react
- 用例数：404 个（44 个测试文件）
- 覆盖范围：formatTime、lrcParser、albumSort、trackSort、playerStore、uiStore、PlayerBar、LyricsPanel、LyricsFullscreen、MiniPlayer、MiniLyricsView、MiniQueueView、SortMenu、CloseCoordinator、CloseConfirmDialog、Albums、LocalMusic、Liked、Settings、SongList、PlaylistPanel、featureFlags、Sidebar、useAudioSync、useTrackLyrics、windowBounds、Harness checks
- Feature Flags 消融验证：16 个 flag 逐个关闭不影响其他 flag

---

## 界面动态效果

- 全局 motion token 定义在 `:root`，覆盖 fast、standard、slow、page 四档时长、两种 easing、两档位移和统一按压比例。
- 所有原生按钮通过独立 `scale` 属性获得按压反馈；播放 pulse、range thumb 和虚拟列表定位继续使用各自的 `transform`，互不覆盖。
- 普通页面、歌曲首批可见行、专辑/歌单卡片、菜单、迷你播放器三视图只提供入场；歌词层、Dialog 和 QueuePanel 同时支持可靠退场。
- SongList 的 inline `transform: translateY()` 只负责虚拟定位，行入场仅动画 opacity 和独立 `translate`。
- 设置页“减少动画”是手动偏好，保存在 SQLite 并由 `uiStore` 水合；手动偏好与系统 `prefers-reduced-motion` 使用 OR 规则，任一开启即降级动态效果。
- CSS 通过 `motion.css` 统一降级；歌词滚动、歌词层退出和 overlay/panel 退出通过同一 reduced-motion helper 同步降级，不保留可见等待。
- Dialog 和 QueuePanel 在根动画结束后卸载，并以幂等 fallback 防止 `animationend` 丢失；创建歌单提交期间禁止重复确认或提前关闭。

---

## 性能与生命周期不变量

- PlayerBar、Lyrics、MiniPlayer 仅在可见且正在播放或拖拽进度时运行 RAF；暂停空闲时不保留 RAF，暂停拖拽和恢复播放会重新启用。
- App 的普通、歌词、迷你三种壳层互斥挂载，任意时刻最多存在一条播放器进度 RAF。
- document 级拖拽统一由 `useDocumentMouseDrag` 管理；重新开始、功能关闭、视图离开和卸载均先清理 listener。
- MiniPlayer 只有 queue 视图挂载 playlist connector；default/lyrics 不订阅 playlist 数组。
- `volume`、`playMode`、`lastTrackId` 仅在实际变化时按 dirty key 合并保存；状态恢复不回写刚读取的值。
- 播放中每 5 秒保存 `lastCurrentTime` 的安全网必须保留；无关状态不能重启该 interval 的边沿逻辑。
- 性能优化以可复现计数和真实环境门槛为准，不以 memo、effect 或组件数量作为收益指标。

---

## Feature Flags 机制

- 配置文件：`%APPDATA%/QinPlayer/feature-flags.json`（可选覆盖，改 JSON 重启即生效）
- 默认值：代码内 `DEFAULT_FEATURE_FLAGS`，全部 true（全开）
- 读取时机：App.tsx 水合第一步，先于播放状态和均衡器加载
- 关闭行为：导航栏隐藏入口 + 功能逻辑完全禁用 + 所有入口点统一拦截
- 16 个 flag：playback、equalizer、lyrics、albums、recent、liked、search、miniMode、tray、playlists、settings、fadeEffect、mediaSession、queuePanel、lyricsMoreLines、windowSizePersist
- 类型安全：`FeatureFlagKey` / `FeatureFlags` 强类型，IPC 通道 `config:getFeatureFlags`
- 限制：虚拟列表（react-virtual）和颜色提取（Canvas API）需真实浏览器环境验证

---

## Harness 工程

```
harness/
├── CONSTRAINTS.md        ← 代码约束（10 大类，200 行）
├── DECISIONS.md          ← 决策记录（11 条）
├── TEST_CONVENTIONS.md   ← 测试规范
├── SPEC.md               ← Harness 工程规范
├── checks.js             ← AST 自动约束检查
└── checks-whitelist.json ← 历史违规精确白名单
```

详见 `harness/CONSTRAINTS.md`。

---

## 文档说明

- `SPEC.md` — 项目规格书（唯一真相源）
- `harness/` — 约束体系（约束 + 决策 + 测试规范）
- `docs/plans/` — 各阶段执行方案
- `docs/archive/PLAN.md` — 早期执行方案（已归档）
- `docs/ARCHITECTURE.md` — 已删除（内容已整合到 SPEC 和 harness）

---

*创建于 2026-06-08*
*更新于 2026-07-02：建立 harness 约束体系、补全测试、类型安全修复*
*技术补充来源：外部 Mentor 技术评审*
