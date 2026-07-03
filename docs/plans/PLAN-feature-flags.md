# QinPlayer Feature Flags 执行方案

> 创建：2026-07-02
> 审查：Codex（2026-07-02）— 已合并 7 项硬边界修正
> 状态：待确认

---

## 当前状态

QinPlayer 所有功能默认开启，无开关机制。新增功能时无法灰度或按需裁剪。

## 目标行为

- 13 个功能全部有独立开关，通过 `feature-flags.json` 统一管理
- 关闭某功能 = 导航栏隐藏入口 + 功能逻辑完全禁用 + 所有入口点统一拦截
- 默认全部开启，不影响现有行为

## 非目标

- 运行时可覆盖：JSON 放在 `app.getPath('userData')` 目录（即 `%APPDATA%/QinPlayer/feature-flags.json`），安装后改 JSON 重启即可生效，不需要重新打包
- 开发时方便调试：改 JSON → 重启 app → 立即生效
- 不做用户级开关（纯开发者工具）
- 不做渐进式启用（要么开要么关）

---

## 功能清单

| 序号 | flag key | 功能 | 默认值 |
|------|----------|------|--------|
| 1 | `playback` | 播放/暂停/切歌 | true |
| 2 | `equalizer` | 均衡器 | true |
| 3 | `lyrics` | 歌词显示 | true |
| 4 | `albums` | 专辑页面 | true |
| 5 | `recent` | 最近播放 | true |
| 6 | `liked` | 我喜欢的 | true |
| 7 | `search` | 搜索 | true |
| 8 | `miniMode` | 迷你模式 | true |
| 9 | `tray` | 系统托盘 | true |
| 10 | `playlists` | 歌单管理 | true |
| 11 | `settings` | 设置页面 | true |
| 12 | `fadeEffect` | 淡入淡出 | true |
| 13 | `mediaSession` | 系统媒体控制 | true |

---

## 技术方案

### 1. 打包策略（Codex 修正 #1）

`package.json` 的 `build.files` 只有 `out/**/*`，根目录的 JSON 不会进 asar。

**方案**：默认 flags 编进代码常量（`electron/ipc/settings.ts`），JSON 文件作为可选覆盖。打包后没有 JSON 也能正常工作。

```typescript
// electron/ipc/settings.ts
const DEFAULT_FLAGS: FeatureFlags = {
  playback: true,
  equalizer: true,
  lyrics: true,
  // ... 全部 13 个
}

let featureFlags: FeatureFlags = { ...DEFAULT_FLAGS }

function loadFeatureFlags(): void {
  // 尝试从文件读取覆盖（开发时方便，打包后可选）
  try {
    const flagsPath = path.join(app.getPath('userData'), 'feature-flags.json')
    if (fs.existsSync(flagsPath)) {
      const data = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'))
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        // 只接受已知 key + boolean 值，忽略非法值
        const cleaned: Partial<FeatureFlags> = {}
        for (const [k, v] of Object.entries(data)) {
          if (k in DEFAULT_FLAGS && typeof v === 'boolean') {
            cleaned[k as FeatureFlagKey] = v
          }
        }
        featureFlags = { ...DEFAULT_FLAGS, ...cleaned }
      }
    }
  } catch {
    // 文件不存在或损坏，使用默认值（全开）
  }
}
```

### 2. 默认值策略（Codex 修正 #2）

**缺失/损坏/解析失败 → 默认全 true（全开）**。只有显式设置 `false` 才关闭。

### 3. 类型定义 + 快照读取（Codex 修正 #3）

```typescript
// src/types/ipc.ts
export type FeatureFlagKey =
  | 'playback' | 'equalizer' | 'lyrics' | 'albums'
  | 'recent' | 'liked' | 'search' | 'miniMode'
  | 'tray' | 'playlists' | 'settings' | 'fadeEffect'
  | 'mediaSession'

export interface FeatureFlags {
  playback: boolean
  equalizer: boolean
  lyrics: boolean
  albums: boolean
  recent: boolean
  liked: boolean
  search: boolean
  miniMode: boolean
  tray: boolean
  playlists: boolean
  settings: boolean
  fadeEffect: boolean
  mediaSession: boolean
}

// IpcChannels 新增：
'config:getFeatureFlags': { args: void; return: FeatureFlags }
```

渲染进程一次性读取完整快照，存入 uiStore，不逐个查询。

### 4. preload 白名单（Codex 修正 #3）

`electron/preload.ts` 的 `INVOKE_CHANNELS` 需要加 `'config:getFeatureFlags'`，否则会被拦截。

### 5. 导航禁用兜底（Codex 修正 #4）

**启动顺序（关键）**：flags 必须先于 restorePlayerState 和 eqStore.loadFromDb() 生效，否则 playback=false / equalizer=false / fadeEffect=false 可能在水合过程中读到默认全开。

```typescript
// App.tsx hydrate 逻辑 — 顺序不可调
async function hydrate() {
  // 1. 先读 flags（最高优先级）
  const flags = await window.electronAPI.invoke('config:getFeatureFlags')
  useUIStore.getState().setFeatureFlags(flags)

  // 2. 兜底：当前页面被关了，回退到 local
  const currentNav = useUIStore.getState().activeNav
  if (!isNavAllowed(currentNav, flags)) {
    useUIStore.getState().setActiveNav('local')
  }

  // 3. 再恢复播放状态（依赖 flags）
  const [, savedTheme, ...] = await Promise.all([
    restorePlayerState(),       // playback=false 时内部 guard 跳过
    // ...
  ])

  // 4. 均衡器加载（依赖 flags）
  if (flags.equalizer) {
    useEqStore.getState().loadFromDb()
  }

  // 5. 迷你模式兜底
  if (!flags.miniMode && useUIStore.getState().isMiniMode) {
    useUIStore.getState().setMiniMode(false)
  }
}
```

Content.tsx 也要加守卫：渲染页面前检查对应 flag，关闭则不渲染。

### 6. playback=false 统一拦截（Codex 修正 #5）

**所有播放入口**：

| 入口 | 拦截方式 |
|------|----------|
| PlayerBar 播放按钮 | 不渲染 PlayerBar |
| SongList 双击 | `handlePlay` 内 guard |
| SongList 右键"播放" | 菜单项不渲染 |
| MiniPlayer 控制按钮 | 不渲染 MiniPlayer |
| 托盘菜单"播放/暂停/上一首/下一首" | 不创建托盘菜单项 |
| Media Session 回调 | 不注册 Media Session |
| useAudioSync 自动下一首 | `onEnded` 回调内 guard |
| songs:recordPlay | 不调用 IPC |

**统一 guard 函数**（uiStore 或独立 utils）：

```typescript
export function canPlay(flags: FeatureFlags): boolean {
  return flags.playback === true
}
```

### 7. 各 flag 关闭行为细化（Codex 修正 #6）

| flag | 关闭时的具体行为 |
|------|-----------------|
| `playback` | PlayerBar 隐藏、SongList 双击/右键禁用、MiniPlayer 隐藏、托盘播放菜单移除、Media Session 不注册、recordPlay 不调用、自动下一首禁用 |
| `equalizer` | eqStore.loadFromDb() 跳过（App.tsx 水合时判断 flag）、Settings 页面不渲染 EQ 区块、AudioEngine EQ 链不创建 |
| `lyrics` | 导航栏隐藏、歌词页面不可访问、PlayerBar 封面点击不跳转歌词 |
| `albums` | 导航栏隐藏 |
| `recent` | 导航栏隐藏、songs:recordPlay 不调用（停止数据写入） |
| `liked` | 导航栏隐藏、SongList 爱心按钮不渲染、songs:like/unlike/getLiked 不调用 |
| `search` | 搜索框隐藏 |
| `miniMode` | 迷你模式按钮隐藏、启动时强制退出迷你模式（`setMiniMode(false)`）、不发 `window:set-mini-mode` |
| `tray` | 不创建托盘图标、mainWindow close handler 不拦截（关闭 = 退出）、不发 `window:set-mini-mode` |
| `playlists` | 导航栏隐藏、SongList 右键"添加到歌单"不渲染、playlists:getAll 不调用 |
| `settings` | 导航栏隐藏 |
| `fadeEffect` | AudioEngine.loadWithFade 降级为直接 load+play |
| `mediaSession` | 不注册 Media Session API、不更新系统媒体信息 |

### 8. tray=false 关闭窗口行为（Codex 修正 #6 补充）

当前产品约束："窗口关闭最小化到托盘，不退出"。

`tray=false` 时没有托盘图标，最小化到托盘后用户找不回窗口。

**方案**：`tray=false` 时，关闭窗口 = 退出应用（不拦截 close 事件）。

---

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `feature-flags.json`（可选，新建） | 13 个 flag，用于开发时覆盖默认值 |
| `electron/ipc/settings.ts` | 新增 DEFAULT_FLAGS 常量 + loadFeatureFlags + `config:getFeatureFlags` IPC |
| `electron/preload.ts` | INVOKE_CHANNELS 加白名单 + 暴露 getFeatureFlags |
| `electron/main.ts` | 传递 flags 给 tray，tray=false 时跳过托盘创建 |
| `electron/tray.ts` | 接收 flags，移除播放相关菜单项 |
| `src/types/ipc.ts` | 新增 FeatureFlagKey / FeatureFlags 类型 + IPC 通道定义 |
| `src/types/electron.d.ts` | 新增 getFeatureFlags 类型 |
| `src/stores/uiStore.ts` | 新增 featureFlags 状态 + setFeatureFlags action |
| `src/App.tsx` | 启动时读取 flags、条件加载 eqStore、兜底 activeNav |
| `src/components/Sidebar.tsx` | 根据 flags 过滤导航项 |
| `src/components/Content.tsx` | 渲染前检查 flag，关闭则不渲染 |
| `src/components/PlayerBar.tsx` | playback=false 时隐藏 |
| `src/components/MiniPlayer.tsx` | playback/miniMode=false 时隐藏 |
| `src/components/SongList.tsx` | playback/playlists/liked=false 时隐藏对应按钮和菜单项 |
| `src/hooks/useAudioSync.ts` | playback/mediaSession/fadeEffect guard |
| `src/utils/mediaSession.ts` | mediaSession=false 时跳过注册 |
| `src/pages/Settings.tsx` | equalizer=false 时隐藏 EQ 区块 |

---

## 前置条件

1. 读取 `electron/ipc/settings.ts` — 了解现有 IPC 注册方式
2. 读取 `src/components/Sidebar.tsx` — 导航项渲染逻辑
3. 读取 `src/components/Content.tsx` — 页面路由逻辑
4. 读取 `src/components/SongList.tsx` — 右键菜单和播放入口
5. 读取 `src/components/MiniPlayer.tsx` — 迷你模式入口
6. 读取 `src/hooks/useAudioSync.ts` — 音频同步逻辑
7. 读取 `src/utils/mediaSession.ts` — Media Session 注册
8. 读取 `electron/preload.ts` — INVOKE_CHANNELS 白名单
9. 读取 `src/pages/Settings.tsx` — 设置页面布局

## 验证方法

1. `npx tsc --noEmit` — TypeScript 语法检查
2. `npm test` — 全量测试通过（72 用例 + 新增 flag 测试）
3. `npm run dev` — 启动后逐个关闭 flag 验证：
   - 导航栏对应入口消失
   - 功能逻辑完全禁用
   - 兜底回退正常（activeNav 指向关闭页面时回到 local）

## 测试计划（Codex 修正 #7）

| 测试文件 | 测试点 |
|----------|--------|
| `tests/featureFlags.test.ts` | 读取：缺失 → 全 true、损坏 → 全 true、非布尔 → 忽略、部分缺省 → 合并默认值 |
| `tests/uiStore.test.ts`（扩展） | setFeatureFlags、导航过滤、禁用当前页时回退到 local |
| `tests/SongList.test.tsx`（扩展） | playback=false → 双击不触发播放、playlists=false → 右键无"添加到歌单"、liked=false → 无爱心按钮 |
| `tests/useAudioSync.test.ts`（新建） | fadeEffect=false → loadWithFade 降级为直接 load+play |

## 风险与回滚

| 风险 | 应对 |
|------|------|
| JSON 文件打包后不存在 | 默认值编进代码，不影响 |
| flag 关闭不彻底（入口隐藏但功能还在跑） | 统一 guard 函数 + 每个 flag 有明确的关闭行为清单 |
| tray=false 后用户关不回窗口 | 关闭窗口 = 退出应用 |
| 测试覆盖不足 | 按 Codex 建议补 4 个测试文件 |

**回滚方式**：删除 `feature-flags.json` 或全部设为 `true`，功能恢复原状。

---

*方案就绪，等主人确认后执行。*
