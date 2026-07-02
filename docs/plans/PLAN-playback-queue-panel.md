# QinPlayer 播放队列面板 + UI增强 执行方案

> 创建：2026-07-02
> 状态：待确认

---

## 当前状态

QinPlayer 已实现基础播放功能，但缺少：
- 播放队列可视化管理
- 封面进播放界面的动画过渡
- 右键菜单"添加到播放列表"功能
- 歌单重命名功能
- GPU 硬件加速优化

## 目标行为

1. **播放队列面板**：右侧滑入侧边面板，显示当前播放队列 + 历史记录
2. **功能开关**：受现有 `playback` flag 控制
3. **GPU 加速**：优化 Chromium 启动参数，为后续视频/动画效果铺垫
4. **歌单重命名**：右键菜单选重命名，内联输入框原位编辑
5. **右键菜单增强**：新增"添加到播放列表"选项
6. **封面进播放界面动画**：向上滑入过渡效果

## 非目标

- 不做播放队列拖拽排序（后续迭代）
- 不做播放队列持久化（重启后清空）
- 不做 GPU 相关的新功能（仅为后续铺垫）

---

## 功能清单

| 序号 | 功能 | 优先级 | 依赖 |
|------|------|--------|------|
| 1 | 播放队列面板 | 高 | 无 |
| 2 | 右键菜单增强 | 高 | 无 |
| 3 | 封面进播放界面动画 | 中 | 无 |
| 4 | 歌单重命名 | 中 | 无 |
| 5 | GPU 加速优化 | 低 | 无 |

---

## 技术方案

### 1. 播放队列面板

**位置**：右侧滑入侧边面板
**宽度**：窗口宽度的 30%（响应式）
**动画**：250ms cubic-bezier(0.4, 0, 0.2, 1) 滑入/滑出
**内容**：
- 标签页切换：当前队列 / 历史记录
- 当前队列：歌曲列表 + 当前播放高亮 + 播放按钮
- 历史记录：最近播放的歌曲列表（最多 50 首）
- 底部操作栏：清空队列按钮

**状态管理**：
```typescript
// src/stores/playerStore.ts 新增
interface PlayerState {
  // ... 现有状态
  showQueuePanel: boolean        // 面板显示状态
  queuePanelTab: 'queue' | 'history'  // 当前标签页
  playHistory: Track[]           // 播放历史（最多 50 首）
  
  // actions
  toggleQueuePanel: () => void
  setQueuePanelTab: (tab: 'queue' | 'history') => void
  addToHistory: (track: Track) => void
  clearQueue: () => void
}
```

**组件结构**：
```
src/components/QueuePanel.tsx
├── 标签页切换（当前队列 / 历史记录）
├── 歌曲列表（复用 SongList 组件，简化版）
└── 底部操作栏（清空队列）
```

**入口**：
- PlayerBar 右侧新增"播放队列"按钮（仅 `playback=true` 时显示）
- 快捷键：Q 键切换面板（待确认）

**Feature Flag**：
- 受 `playback` flag 控制
- `playback=false` 时：按钮隐藏、面板不渲染、快捷键禁用

---

### 2. 右键菜单增强

**改动**：在现有右键菜单中新增"添加到播放列表"选项

**逻辑**：
```typescript
// src/components/SongList.tsx 新增
const handleAddToQueue = (track: Track) => {
  const { currentTrack, playQueue } = usePlayerControlStore.getState()
  
  // 检查是否已在队列中
  const exists = playQueue.some(t => t.id === track.id)
  if (exists) {
    // 已存在则跳过，显示提示
    toast('歌曲已在播放队列中')
    return
  }
  
  // 插入到当前播放歌曲的后一个位置
  if (currentTrack) {
    const currentIndex = playQueue.findIndex(t => t.id === currentTrack.id)
    const newQueue = [...playQueue]
    newQueue.splice(currentIndex + 1, 0, track)
    usePlayerControlStore.getState().setPlayQueue(newQueue)
  } else {
    // 没有当前播放歌曲，添加到队列末尾
    usePlayerControlStore.getState().setPlayQueue([...playQueue, track])
  }
  
  toast('已添加到播放队列')
}
```

**菜单项条件**：
- 仅在 `playback=true` 时显示
- 仅在非播放队列页面时显示（避免重复操作）

---

### 3. 封面进播放界面动画

**效果**：向上滑入过渡
**动画**：300ms cubic-bezier(0.4, 0, 0.2, 1)

**实现方案**：
```css
/* src/styles/lyrics.css 新增 */
.lyrics-page-enter {
  transform: translateY(100%);
  opacity: 0;
}

.lyrics-page-enter-active {
  transform: translateY(0);
  opacity: 1;
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
              opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.lyrics-page-exit {
  transform: translateY(0);
  opacity: 1;
}

.lyrics-page-exit-active {
  transform: translateY(100%);
  opacity: 0;
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
              opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

**组件改动**：
```typescript
// src/components/Content.tsx 修改
import { CSSTransition } from 'react-transition-group'

const Content = () => {
  const activeNav = useUIStore(state => state.activeNav)
  
  return (
    <div className="content">
      <CSSTransition
        in={activeNav === 'lyrics'}
        timeout={300}
        classNames="lyrics-page"
        unmountOnExit
      >
        <LyricsPage />
      </CSSTransition>
      
      {activeNav !== 'lyrics' && (
        <>
          {activeNav === 'local' && <LocalMusicPage />}
          {/* ... 其他页面 */}
        </>
      )}
    </div>
  )
}
```

**依赖**：需安装 `react-transition-group`

---

### 4. 歌单重命名

**交互**：右键菜单选重命名 → 内联输入框原位编辑 → Enter 确认 / Esc 取消

**实现方案**：
```typescript
// src/components/Sidebar.tsx 新增
const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null)
const [editingName, setEditingName] = useState('')

const handleRenamePlaylist = (playlistId: string) => {
  const playlist = playlists.find(p => p.id === playlistId)
  if (playlist) {
    setEditingPlaylistId(playlistId)
    setEditingName(playlist.name)
  }
}

const handleConfirmRename = async () => {
  if (editingPlaylistId && editingName.trim()) {
    await usePlayerControlStore.getState().renamePlaylist(
      editingPlaylistId, 
      editingName.trim()
    )
  }
  setEditingPlaylistId(null)
  setEditingName('')
}

const handleCancelRename = () => {
  setEditingPlaylistId(null)
  setEditingName('')
}

// 渲染逻辑
{playlists.map(playlist => (
  <div key={playlist.id} className="playlist-item">
    {editingPlaylistId === playlist.id ? (
      <input
        type="text"
        value={editingName}
        onChange={(e) => setEditingName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConfirmRename()
          if (e.key === 'Escape') handleCancelRename()
        }}
        onBlur={handleConfirmRename}
        autoFocus
        className="playlist-rename-input"
      />
    ) : (
      <span className="playlist-name">{playlist.name}</span>
    )}
    
    {/* 右键菜单 */}
    <ContextMenu>
      <MenuItem onClick={() => handleRenamePlaylist(playlist.id)}>
        重命名
      </MenuItem>
      {/* 其他菜单项 */}
    </ContextMenu>
  </div>
))}
```

**数据层**：
```typescript
// src/stores/playerStore.ts 新增
renamePlaylist: async (playlistId: string, newName: string) => {
  await window.electronAPI.invoke('playlists:rename', { playlistId, newName })
  // 更新本地状态
  set(state => ({
    playlists: state.playlists.map(p => 
      p.id === playlistId ? { ...p, name: newName } : p
    )
  }))
}
```

**IPC 通道**：
```typescript
// electron/ipc/playlists.ts 新增
'playlists:rename': { args: { playlistId: string; newName: string }; return: void }
```

---

### 5. GPU 加速优化

**目标**：为后续视频可视化/动画效果做准备

**Chromium 启动参数**：
```typescript
// electron/main.ts 修改
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('enable-hardware-acceleration')
app.commandLine.appendSwitch('enable-webgl')
app.commandLine.appendSwitch('enable-accelerated-2d-canvas')
```

**检测 GPU 状态**：
```typescript
// electron/ipc/settings.ts 新增
'gpu:status': { args: void; return: GPUStatus }

interface GPUStatus {
  gpuEnabled: boolean
  gpuRenderer: string
  gpuVendor: string
  webglVersion: string
}
```

**渲染进程检测**：
```typescript
// src/utils/gpu.ts 新增
export async function getGPUStatus(): Promise<GPUStatus> {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
  
  if (!gl) {
    return {
      gpuEnabled: false,
      gpuRenderer: 'Unknown',
      gpuVendor: 'Unknown',
      webglVersion: 'None'
    }
  }
  
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  
  return {
    gpuEnabled: true,
    gpuRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown',
    gpuVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown',
    webglVersion: gl.getParameter(gl.VERSION)
  }
}
```

**设置页面展示**：
- 在"关于"页面显示 GPU 状态信息
- 供用户确认硬件加速是否生效

---

## 文件改动清单

| 文件 | 改动 | 优先级 |
|------|------|--------|
| `src/stores/playerStore.ts` | 新增队列面板状态、播放历史、清空队列、重命名歌单 | 高 |
| `src/components/QueuePanel.tsx` | 新建播放队列面板组件 | 高 |
| `src/components/PlayerBar.tsx` | 新增播放队列按钮、快捷键 Q | 高 |
| `src/components/SongList.tsx` | 新增右键菜单"添加到播放列表" | 高 |
| `src/components/Sidebar.tsx` | 新增歌单重命名内联编辑 | 中 |
| `src/components/Content.tsx` | 封面进播放界面动画 | 中 |
| `src/styles/lyrics.css` | 新增滑入动画样式 | 中 |
| `src/styles/queue-panel.css` | 新建播放队列面板样式 | 高 |
| `electron/main.ts` | GPU 加速启动参数 | 低 |
| `electron/ipc/settings.ts` | 新增 GPU 状态检测 | 低 |
| `electron/ipc/playlists.ts` | 新增歌单重命名 IPC | 中 |
| `electron/preload.ts` | 新增 IPC 白名单 | 中 |
| `src/types/ipc.ts` | 新增类型定义 | 中 |
| `src/utils/gpu.ts` | 新建 GPU 检测工具 | 低 |
| `src/pages/Settings.tsx` | 新增 GPU 状态展示 | 低 |
| `src/App.tsx` | 新增 react-transition-group | 中 |

---

## 前置条件

1. 读取 `src/stores/playerStore.ts` — 了解现有播放状态管理
2. 读取 `src/components/PlayerBar.tsx` — 播放控制条布局
3. 读取 `src/components/SongList.tsx` — 现有右键菜单实现
4. 读取 `src/components/Sidebar.tsx` — 歌单列表渲染
5. 读取 `src/components/Content.tsx` — 页面路由逻辑
6. 读取 `electron/ipc/settings.ts` — 现有 IPC 注册方式
7. 读取 `electron/main.ts` — 主进程初始化
8. 读取 `src/types/ipc.ts` — IPC 类型定义

## 验证方法

1. `npx tsc --noEmit` — TypeScript 语法检查
2. `npm test` — 全量测试通过（现有 121 用例 + 新增测试）
3. `npm run dev` — 启动后验证：
   - 播放队列面板：右侧滑入、标签页切换、歌曲列表、清空队列
   - 右键菜单：新增"添加到播放列表"、重复歌曲跳过提示
   - 封面进播放界面：向上滑入动画
   - 歌单重命名：右键菜单、内联编辑、Enter/Esc 快捷键
   - GPU 加速：设置页面显示 GPU 状态

## 测试计划

| 测试文件 | 测试点 |
|----------|--------|
| `tests/queuePanel.test.tsx` | 面板显示/隐藏、标签页切换、歌曲列表渲染、清空队列 |
| `tests/rightClickMenu.test.tsx` | 新增菜单项、添加到队列、重复歌曲跳过 |
| `tests/playlistRename.test.tsx` | 重命名交互、Enter/Esc 快捷键、空名称校验 |
| `tests/coverAnimation.test.tsx` | 动画触发、动画完成、页面切换 |
| `tests/gpuStatus.test.ts` | GPU 检测、状态返回、错误处理 |

## 风险与回滚

| 风险 | 应对 |
|------|------|
| react-transition-group 依赖冲突 | 使用 CSS animation 替代方案 |
| 播放队列状态管理复杂 | 优先实现基础功能，后续迭代优化 |
| GPU 参数不兼容某些显卡 | 提供降级方案，禁用硬件加速 |
| 右键菜单与现有功能冲突 | 严格条件渲染，避免重复菜单项 |

**回滚方式**：
- 播放队列面板：删除 QueuePanel 组件和相关状态
- 右键菜单：移除新增菜单项
- 动画：删除 CSS 动画类
- 歌单重命名：移除内联编辑逻辑
- GPU 加速：移除启动参数

---

*方案就绪，等主人确认后执行。*
