# QinPlayer 产品规格

> 当前实现基线：QinPlayer 1.2.0，2026-07-15。
> 本文件只记录当前代码已经实现的事实；历史取舍见 `harness/DECISIONS.md`，工程规范见 `harness/CONSTRAINTS.md`。

---

## 一、项目定位与平台边界

| 项目 | 当前实现 |
|------|----------|
| 定位 | 纯本地音乐播放器；曲库、歌词、封面、设置和统计均在本机处理 |
| 桌面平台 | Windows，发布目标为 NSIS x64 |
| 技术栈 | Electron 31、React 18、TypeScript、Zustand 5、better-sqlite3、electron-vite |
| 进程安全 | Renderer 禁用 Node.js 集成，启用 context isolation，通过 preload 白名单访问 Electron 能力 |
| 实例模型 | 单实例应用；第二次启动会激活已有窗口 |
| 主题 | 暗色、亮色、跟随系统；暗色主背景为 `#121212` |

### 窗口

- 主窗口为无边框窗口，使用自定义标题栏；默认尺寸 `1000×680`，最小尺寸 `800×600`，可拉伸。
- `windowSizePersist` 开启时保存主窗口尺寸、位置以及最大化/最小化状态，并在恢复时校正到可见显示器范围。
- Mini 模式使用固定 `400×150` 壳层，不可拉伸；歌曲、歌词、队列三个视图切换时不改变窗口尺寸。
- 歌词页支持置顶；Mini 模式退出后恢复主窗口的可拉伸状态。`windowSizePersist` 开启时恢复已保存 bounds/state，关闭时回到默认主窗口尺寸并居中。

---

## 二、当前用户能力

### 1. 曲库扫描

- 用户可添加、移除音乐文件夹，并从“本地音乐”触发全量扫描。
- 应用启动后会对已保存文件夹执行增量扫描；文件遍历与元数据解析在 scanner Worker 中完成，SQLite 写入留在主进程。
- 当前识别 `.mp3`、`.flac`、`.wav`、`.m4a`、`.ogg`、`.aac`、`.wma`、`.opus`。
- 扫描结果包含绝对路径、文件名、歌名、歌手、专辑、时长、封面、修改时间；标签缺失时使用文件名、未知歌手和未知专辑作为显示兜底。
- 封面可来自音频内嵌图片或歌曲目录中的图片，提取结果缓存到应用 `userData`。

### 2. 播放与队列

- 支持播放、暂停、上一首、下一首、进度跳转、音量和静音。
- 支持顺序播放、单曲循环、随机播放；音量、播放模式、上次曲目和上次进度会持久化。
- 支持淡入淡出，淡入淡出增益与用户音量增益相互独立。
- “下一首播放”写入会话级 `priorityQueue`：同一歌曲去重并提升到队首，连续选择采用 LIFO，优先于来源列表和自然结束的 loop。
- 优先队列消费完成后通过恢复锚点回到原来源列表；从会话播放列表移除当前曲或锚点时，以短生命周期 detached 游标衔接下一次切歌。
- 队列面板展示优先待播与当前来源列表，并支持播放、移除和提升到下一首。

### 3. 均衡器

- 10 段均衡器覆盖 32 Hz 到 16 kHz，每段范围为 -12 dB 到 +12 dB。
- 内置流行、摇滚、古典、低音增强、人声突出五个预设，也支持自定义曲线。
- EQ 状态由 `useEqStore` 管理并防抖保存；主进程拒绝非有限值、越界值或非 10 段输入。
- 正增益曲线会计算 headroom 补偿，平坦曲线保持单位增益。

### 4. 歌词

- 读取与音频同目录、同文件名的 `.lrc` 文件，不进行在线歌词搜索。
- 支持普通时间标签、同时间戳双行和翻译行；歌词偏移可在设置中调整。
- 提供沉浸歌词页和 Mini 歌词视图；普通跟随使用 `scrollTo({ behavior: 'smooth' })`，切歌定位使用 `behavior: 'auto'`。
- 歌词页集成封面、歌曲信息、播放控制、音量、播放模式和置顶控制。

### 5. 曲库浏览与组织

- “本地音乐”支持按歌名、歌手、播放次数排序，并可切换升序/降序。
- Sidebar 顶部搜索框使用 300 ms 防抖；输入后临时进入搜索结果页，清空时恢复先前页面。
- 搜索匹配歌名、歌手和专辑，结果按播放次数降序返回。
- “最近播放”展示最近播放记录；“我喜欢的”使用星标收藏与取消收藏。
- “专辑”按专辑字段聚合曲库，支持按专辑名或代表歌手进行本地化稳定排序，并可进入专辑歌曲列表。
- “歌单”支持创建、重命名、删除、添加/移除歌曲，以及按添加顺序或播放次数排序；非空歌单可播放全部。

### 6. Mini、托盘与系统媒体控制

- Mini 模式提供歌曲、歌词、队列三个紧凑视图，共用固定窗口壳层。
- Mini 曲目菜单优先使用独立透明子窗口；该窗口使用专用 preload、固定动作和单次结算协议，失败时回退 Electron 原生菜单。
- 托盘菜单始终提供显示主窗口和退出；`playback` 开启时另提供播放/暂停、上一首和下一首。
- Media Session 同步歌名、歌手、专辑和封面，并接管 Windows 媒体面板及键盘多媒体键的播放控制。

### 7. 个人统计

- “我的”页面显示昵称和头像（在设置页编辑）、累计听歌时长、播放次数、本周活跃天数、近期每日时长和常听歌曲排行。
- 听歌时长按真实媒体时间增量累计，按本地自然日拆分，并以 30 秒批次写入数据库。
- 常听歌曲排行使用曲库中的累计播放次数。

---

## 三、真实设置项

| 分区 | 设置或操作 | 当前行为 |
|------|------------|----------|
| 个人信息 | 昵称、头像 | 昵称最长 20 个字符；头像复制到 `userData/avatar` 并保存路径 |
| 通用 | 主题 | 暗色、亮色、跟随系统 |
| 通用 | 关闭窗口时 | 托盘开启时可选最小化、退出、每次询问；托盘关闭时强制直接退出 |
| 通用 | 减少动画 | 手动偏好与系统 `prefers-reduced-motion` 采用 OR 语义 |
| 通用 | 开机自启动 | 通过 Electron 登录项设置控制 |
| 播放 | 音频输出设备 | 枚举输出设备、切换设备并保存选择 |
| 播放 | 淡入淡出 | 控制切换曲目时的音频淡入淡出 |
| 播放 | 均衡器 | 五个预设、10 段自定义增益和重置 |
| 曲库 | 音乐文件夹 | 添加、移除扫描根目录 |
| 歌词 | 时间轴偏移 | 在 -0.5 s 到 +0.5 s 之间调整 |
| 数据 | 导出备份 | WAL checkpoint 后导出 SQLite 数据库副本 |
| 数据 | 导入备份 | 选择 `.db` 文件、确认后替换当前数据库并重载或重启 |
| 数据 | 清空歌曲库 | 二次确认后删除歌曲、播放记录和收藏等关联数据 |

---

## 四、数据与持久化

### 1. 固定数据位置

- 主数据库固定为 `app.getPath('userData')/qinplayer.db`；设置页面只能管理扫描目录，不能更改数据库位置。
- 封面缓存目录固定为 `app.getPath('userData')/covers`。
- 头像目录固定为 `app.getPath('userData')/avatar`。
- 可选 Feature Flag 覆盖文件为 `app.getPath('userData')/feature-flags.json`。

### 2. 持久化层职责

| 层 | 当前保存内容 |
|----|--------------|
| SQLite | 歌曲与扫描文件夹、歌单关系、收藏、播放次数、听歌统计、EQ、主题、关闭行为、减少动画、淡入淡出、歌词偏移、昵称/头像路径、音量、播放模式、上次曲目/进度、窗口 bounds/state 等设置 |
| `feature-flags.json` | 可选功能开关覆盖；文件缺失、损坏或字段无效时回退为默认值 |
| Renderer `localStorage` | 当前音频输出设备 ID |
| Windows 登录项 | 开机自启动 |
| 仅会话状态 | 来源播放列表、优先队列、恢复锚点、detached 游标、当前导航/搜索状态、Mini 当前视图、扫描进度 |

SQLite 使用 WAL 和外键约束。scanner Worker 只返回纯数据；主进程接收每条结果后执行歌曲 upsert，Worker 不直接访问数据库。

### 3. 当前本地资源协议

Renderer 当前使用以下 URL 读取本地资源：

```text
qinplayer://audio?path=<编码后的绝对路径>
qinplayer://cover?path=<编码后的绝对路径>
qinplayer://avatar?path=<编码后的绝对路径>
```

主进程从 `path` 参数直接解析文件路径，异步检查可读性与文件信息，再以文件流返回；带 `Range` 请求时返回 `206` 和对应范围。当前实现不通过歌曲 ID 查询数据库后再解析路径。

---

## 五、运行时架构

| 层 | 当前职责 |
|----|----------|
| Electron main | 单实例与应用生命周期、主窗口/Mini bounds、关闭协调、托盘、SQLite、扫描调度、本地协议、IPC handler、Mini 菜单子窗口 |
| 主 preload | 使用 send/invoke/on 白名单隔离 Renderer 与 Electron，并提供音频/封面 URL helper |
| React renderer | 页面与组件、Zustand 状态、AudioEngine 驱动、歌词/队列/Mini 交互；不直接访问 Node.js |
| scanner Worker | 递归读取文件系统、解析媒体标签和封面，通过 `postMessage` 返回纯 JSON；不访问 SQLite |
| Mini 菜单 renderer/preload | 独立的短生命周期菜单 UI，只能读取初始化数据、通知 ready、返回受限 action 或取消 |

### 1. Renderer 启动顺序

`App` 先从主进程水合 Feature Flags，再恢复播放状态、主题、歌词偏移、淡入淡出和减少动画，并按 `equalizer` 开关启动 EQ 水合。水合完成前显示骨架；完成后普通壳层、沉浸歌词壳层和 Mini 壳层互斥渲染。

### 2. 状态所有权

- `usePlayerStore`：当前曲目、来源列表、优先队列及恢复状态、播放意图、音量、播放模式、淡入淡出、歌词偏移和播放状态持久化。
- `useUIStore`：导航、搜索、主题、Mini 状态、减少动画和 Feature Flags。
- `useEqStore`：10 段增益、预设选择、加载状态和防抖持久化；EQ 是否启用由 `equalizer` Feature Flag 驱动。
- 页面查询结果、扫描进度、弹窗和菜单生命周期等局部数据保留在对应组件或 Hook 中。

---

## 六、播放链路

### 1. 控制流

```text
页面/组件
  → usePlayerStore 写入播放意图
  → useAudioSync 统一同步副作用
  → AudioEngine
  → HTMLAudioElement / Web Audio
```

`playTrack` 是用户播放的统一入口；内部自动切歌通过共享提交逻辑更新当前曲目、播放意图和播放记账，避免重复副作用。

### 2. 音频图

`AudioEngine` 以单个 `HTMLAudioElement` 作为媒体源，并按需接入 Web Audio：

```text
MediaElementSource
  → 可选 10 段 Biquad EQ
  → eqHeadroomGain
  → fadeGain
  → volumeGain
  → AudioContext.destination
```

- `eqHeadroomGain` 只负责 EQ 输出补偿。
- `fadeGain` 只负责淡入淡出包络。
- `volumeGain` 只负责用户音量。
- Web Audio 尚未接入时，基础音量由 `HTMLAudioElement.volume` 承担；接入后同步到 `volumeGain`。

### 3. 高频播放时间

`currentTimeRef` 是模块级共享 ref，由 `useAudioSync` 根据媒体时间更新，不写入 Zustand。PlayerBar、沉浸歌词页和 MiniPlayer 在播放或拖拽期间通过 RAF 消费该值，从而避免高频全局状态更新触发整棵组件树重渲染；`playerStore` 另在播放中每 5 秒读取它保存恢复进度，并在恢复状态时写回。

---

## 七、Feature Flags

当前共有 17 个 Feature Flags，默认全部开启：

| Flag | 控制范围 |
|------|----------|
| `playback` | 播放器壳层、播放入口与音频副作用 |
| `equalizer` | EQ 界面与音频链 EQ 生效 |
| `lyrics` | 歌词入口、歌词页和歌词加载 |
| `albums` | 专辑导航与页面 |
| `recent` | 最近播放导航、页面，以及播放提交时的最近记录写入 |
| `liked` | 收藏入口、星标状态与收藏页面 |
| `profile` | “我的”导航、统计采集与统计页面 |
| `search` | Sidebar 搜索和搜索结果页 |
| `miniMode` | Mini 模式入口和壳层 |
| `tray` | 托盘、依赖托盘的窗口行为与 Mini 入口 |
| `playlists` | 歌单导航、页面和添加到歌单入口 |
| `settings` | 设置导航与页面 |
| `fadeEffect` | AudioEngine 淡入淡出效果 |
| `mediaSession` | 系统媒体元数据与动作处理 |
| `queuePanel` | 主播放器与 Mini 的队列入口、Mini 队列视图及关闭后的视图回退 |
| `lyricsMoreLines` | 歌词面板的扩展上下文行样式 |
| `windowSizePersist` | 主窗口 bounds 和最大化/最小化状态持久化 |

现有组合语义：

- 从主窗口进入 Mini 的可见入口实际需要 `playback && miniMode && tray`。已处于 Mini 时，`miniMode` 或 `tray` 关闭会清理 Mini 状态；`playback=false` 只让 MiniPlayer 不渲染内容，不会主动清理 `isMiniMode`。
- 导航型 Flag 会隐藏入口并阻止对应页面成为有效导航目标。
- 例如 `fadeEffect=false` 时，Settings 中的淡入淡出控件仍可见且可写入偏好，但切歌淡入淡出效果会被 Flag 拦截；这是当前行为，不代表永久产品设计。
- `feature-flags.json` 只接受上述键的布尔值；未知键和非布尔值被忽略。

---

## 八、质量门与文档职责

### 1. 自动验证快照

2026-07-15 基于当前源码验证：

- `npx tsc --noEmit`：通过。
- `node harness/checks.js`：通过。
- `npm test -- --reporter=dot`：53 个测试文件、520 个测试通过。

该数字是带日期的验证快照，不是要求文档长期保持的固定清单；测试增删后以实际运行结果为准。

### 2. 自动与桌面验收边界

- Vitest/jsdom 覆盖状态机、组件结构、Hook、排序、解析、IPC helper 和 Harness 规则，但不能证明真实桌面窗口、硬件音频或操作系统集成。
- AudioContext、输出设备切换、Media Session、托盘/关闭行为、透明菜单子窗口、DPI、多显示器和最终 CSS 视觉需要真实 Electron 环境验收。
- 文档-only 改动的常规门为类型检查、Harness、全量测试和 `git diff --check`；不因此宣称已完成真实 Electron UI smoke。

### 3. 文档职责

- `SPEC.md`：只记录当前已实现的产品、数据和架构事实。
- `harness/CONSTRAINTS.md`：记录长期工程约束；可以比当前代码更严格，未满足项视为技术债，不通过修改文字伪装为已合规。
- `harness/DECISIONS.md`：保留按时间发生的决策历史；被替代的条目标记为已取代，不删除历史背景。
- `harness/TEST_CONVENTIONS.md`：记录测试组织、运行入口和覆盖目标。
