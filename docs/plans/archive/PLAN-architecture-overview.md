# 方案：SPEC.md 增加架构总览

## 背景

SPEC.md 功能完整但缺少一张让 AI 和人快速理解项目核心运行机制的架构地图。GPT 建议在 SPEC.md 的「技术架构」前增加 ~80 行的架构总览，包含四部分。同时修复已发现的文档漂移。

## 改动

### 文件：`SPEC.md`

在「技术架构」章节前新增「架构总览」，包含：

#### 1. 运行时架构图（ASCII）

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

#### 2. 核心播放数据流

```
用户点击歌曲
    ↓
playerStore.setCurrentTrack()
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

#### 3. 状态所有权表

| 状态 | 唯一负责人 | 不允许谁管理 |
|------|-----------|-------------|
| 当前歌曲 | playerStore | React 局部 state |
| 播放队列 | playerStore | AudioEngine 自行维护 |
| 当前播放时间 | currentTimeRef | Zustand |
| 播放/暂停 | playerStore.isPlaying | AudioEngine 内部状态 |
| EQ 参数 | eqStore | UI 组件 |
| 主题/迷你模式 | uiStore | playerStore |
| 歌曲数据库 | Electron 主进程 + SQLite | Renderer 直接操作 |
| 音频播放 | AudioEngine 单例 | React 组件创建第二个实例 |
| 歌词数据 | Lyrics.tsx 局部 state | playerStore |

#### 4. 进程与模块边界

```
Renderer Components → 可依赖 → Stores / Hooks / Utils
Stores → 可依赖 → 纯工具模块、类型
AudioEngine ✗ 不依赖 React 组件 ✗ 不直接操作 UI
Renderer ✗ 不直接访问 SQLite ✗ 不用 Node.js fs
Worker ✗ 不直接写 SQLite ✓ 仅扫描+解析
Main Process ✓ 负责 SQLite、文件系统、窗口、IPC
```

### 文档漂移修复

1. **目录结构**：`tests/` 注释从"14 个测试文件"改为"15 个测试文件"
2. **进度条描述**：从"PlayerBar 内部用 useRef + timeupdate 直接更新 DOM"改为"useAudioSync + currentTimeRef + RAF 循环驱动"

## 不做什么

- 不创建独立的 ARCHITECTURE.md
- 不写组件层级图（变化太快容易过期）
- 不手写 IPC 通道清单（从 ipc.ts 自动生成，不额外维护）
- 不写完整模块依赖关系图（规模还不够大）

## 验证

- 确认架构图与实际代码一致
- 确认状态所有权表无遗漏
- 确认文档漂移修复后 SPEC.md 内部一致
