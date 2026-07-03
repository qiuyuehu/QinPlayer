# Phase 2: 数据期（Data Layer）

> 引入 SQLite 数据库，Worker Threads 后台扫描，实现歌单 CRUD、搜索、歌曲元数据解析。
> 
> ⚠️ Phase 2 涉及原生 C++ 模块、多线程与海量数据渲染，以下暗礁必须在编码前规避。

---

## 🚨 暗礁清单（编码前必读）

### 暗礁 1：Native Module 编译地狱
- **现象**：本地 `npm install` 正常，打包后崩溃报 `NODE_MODULE_VERSION mismatch`
- **根因**：better-sqlite3 含 C++ 代码，系统 Node 版本 ≠ Electron 内置 Node 版本
- **规避**：
  1. 安装 `@electron/rebuild`
  2. package.json 添加 `"postinstall": "electron-rebuild"`
  3. electron.vite.config.ts 主进程配置添加 `external: ['better-sqlite3']`

### 暗礁 2：Worker 内存爆炸
- **现象**：扫描含大封面的 FLAC 文件时，内存飙升几个 G，OOM 崩溃
- **根因**：music-metadata 提取的封面 Buffer 可达 20MB，IPC 序列化吃满 CPU/内存
- **规避**：Worker 线程负责将封面写入本地缓存目录，只把文件路径传给主进程

### 暗礁 3：长列表 DOM 灾难
- **现象**：3000 首歌直接 map 渲染，滚动严重掉帧
- **根因**：数万个 DOM 节点，浏览器渲染引擎力不从心
- **规避**：引入 `@tanstack/react-virtual` 虚拟列表，只渲染可视区域

### 暗礁 4：启动水合闪烁
- **现象**：启动时先显示空列表，0.5 秒后闪烁跳变到上次状态
- **根因**：React 同步挂载，但 IPC 读取 SQLite 是异步的
- **规避**：App 根组件维护 `isHydrated` 状态，数据加载完成前显示骨架屏

---

## Task 2.1: SQLite 数据库初始化

**目标**：引入 better-sqlite3，创建数据库表结构

**文件**：
- Create: `electron/db/database.ts`（数据库初始化 + 表结构）
- Modify: `electron/main.ts`（引入数据库）
- Modify: `electron.vite.config.ts`（排除原生模块）
- Modify: `package.json`（添加 postinstall 钩子）

**步骤**：

1. 安装依赖：
   ```bash
   npm install better-sqlite3
   npm install --save-dev @electron/rebuild @types/better-sqlite3
   ```

2. package.json 添加 postinstall 钩子：
   ```json
   "scripts": {
     "postinstall": "electron-rebuild"
   }
   ```

3. electron.vite.config.ts 排除原生模块：
   ```ts
   main: {
     build: {
       rollupOptions: {
         external: ['better-sqlite3']  // 关键：不打包进 bundle
       }
     }
   }
   ```

4. database.ts — 初始化数据库：
   - 路径：`app.getPath('userData') + '/qinplayer.db'`
   - **开启 WAL 模式**：`db.pragma('journal_mode = WAL')`（并发读写性能提升）
   - 创建封面缓存目录：`app.getPath('userData') + '/covers'`

5. 创建表结构（见下方）

**表结构**：
```sql
-- 歌曲表
CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,    -- 文件绝对路径
  file_name TEXT NOT NULL,           -- 文件名
  title TEXT,                        -- 歌名（ID3 标签）
  artist TEXT,                       -- 歌手
  album TEXT,                        -- 专辑
  duration REAL,                     -- 时长（秒）
  cover_path TEXT,                   -- 封面图缓存路径
  mtime INTEGER,                     -- 文件最后修改时间（增量扫描用）
  play_count INTEGER DEFAULT 0,      -- 播放次数
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 歌单表
CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 歌单-歌曲关联表
CREATE TABLE IF NOT EXISTS playlist_songs (
  playlist_id INTEGER NOT NULL,
  song_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,       -- 添加顺序
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  UNIQUE(playlist_id, song_id)
);

-- 最近播放表
CREATE TABLE IF NOT EXISTS recently_played (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

-- 我喜欢的表
CREATE TABLE IF NOT EXISTS liked_songs (
  song_id INTEGER PRIMARY KEY,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

-- 音乐文件夹表
CREATE TABLE IF NOT EXISTS music_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL
);

-- 设置表（键值对）
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

**验证**：数据库文件创建成功，表结构正确，WAL 模式已开启

---

## Task 2.2: IPC Handler — 数据库操作

**目标**：主进程封装所有数据库操作为 IPC Handler

**文件**：
- Create: `electron/ipc/songs.ts`（歌曲相关 IPC）
- Create: `electron/ipc/playlists.ts`（歌单相关 IPC）
- Create: `electron/ipc/settings.ts`（设置相关 IPC）
- Modify: `electron/preload.ts`（暴露 API，类型安全）

**步骤**：

1. `songs.ts` — 歌曲 CRUD：
   - `songs:search` — 按歌名/歌手搜索
   - `songs:getAll` — 获取所有歌曲
   - `songs:getById` — 获取单首
   - `songs:updatePlayCount` — 播放次数 +1
   - `songs:like` / `songs:unlike` — 收藏/取消收藏
   - `songs:getLiked` — 获取收藏列表
   - `songs:getRecent` — 获取最近播放（50首）

2. `playlists.ts` — 歌单 CRUD：
   - `playlists:create` / `playlists:rename` / `playlists:delete`
   - `playlists:getAll` / `playlists:getById`
   - `playlists:addSong` / `playlists:removeSong`
   - `playlists:getSongs` — 获取歌单内歌曲（支持排序）
   - `playlists:reorder` — 拖拽排序

3. `settings.ts` — 设置读写：
   - `settings:get` / `settings:set`
   - `settings:getFolders` / `settings:addFolder` / `settings:removeFolder`

4. `preload.ts` — 通过 contextBridge 暴露所有 API

**验证**：渲染进程能调用所有 IPC 方法，数据库读写正常

---

## Task 2.3: Worker Threads 后台扫描

**目标**：用独立线程扫描文件夹，解析 ID3 标签，不阻塞 UI

**文件**：
- Create: `electron/workers/scanner.ts`（扫描 Worker）

> ⚠️ **Worker 线程绝对不能直接写 SQLite！**
> 只负责解析 ID3，通过 postMessage 将 JSON 数据发回主进程，主进程开启事务批量写入。

> ⚠️ **封面图必须在 Worker 里写入缓存目录，只传路径！**
> 绝对不能把 Buffer 通过 IPC 传给主进程（内存爆炸）。

**步骤**：

1. `scanner.ts` — Worker 线程：
   - 接收文件夹路径列表
   - 递归扫描音频文件
   - 用 `music-metadata` 解析 ID3 标签
   - **提取封面图写入缓存目录**（`userData/covers/`），用文件路径 MD5 作为文件名
   - 通过 `parentPort.postMessage` 发送进度（只传路径，不传 Buffer）
   - 增量扫描：对比 mtime，只解析新增/修改的文件

2. Worker 内封面提取逻辑：
   ```ts
   // Worker 内部：封面写入缓存，只返回路径
   async function extractAndSaveCover(filePath, pictures, cacheDir) {
     if (!pictures || pictures.length === 0) return null
     const pic = pictures[0]
     const hash = crypto.createHash('md5').update(filePath).digest('hex')
     const ext = pic.format === 'image/jpeg' ? 'jpg' : 'png'
     const coverPath = path.join(cacheDir, `${hash}.${ext}`)
     await fs.writeFile(coverPath, pic.data)  // Worker 内写入
     return coverPath  // 只返回路径
   }
   ```

3. 主进程启动 Worker，监听消息：
   - `progress` — 扫描进度（百分比 + 当前文件名）
   - `song` — 发现一首新歌曲，写入数据库
   - `done` — 扫描完成
   - `error` — 错误信息

4. 渲染进程显示扫描进度条

**验证**：扫描 100+ 首歌曲不卡 UI，进度实时更新，ID3 标签正确解析，内存稳定

---

## Task 2.4: 歌曲列表 — 使用真实数据 + 虚拟列表

**目标**：SongList 组件从数据库获取歌曲，引入虚拟列表优化性能

**文件**：
- Modify: `src/components/SongList.tsx`（引入虚拟列表）
- Modify: `src/pages/LocalMusic.tsx`
- Modify: `electron/main.ts`（添加封面协议拦截）

> ⚠️ 3000+ 首歌必须用虚拟列表，否则滚动掉帧。

**步骤**：

1. 安装虚拟列表库：
   ```bash
   npm install @tanstack/react-virtual
   ```

2. `SongList.tsx` — 引入虚拟列表：
   ```tsx
   import { useVirtualizer } from '@tanstack/react-virtual'
   
   const parentRef = useRef<HTMLDivElement>(null)
   const virtualizer = useVirtualizer({
     count: songs.length,
     getScrollElement: () => parentRef.current,
     estimateSize: () => 50,  // 每行高度 50px
   })
   ```

3. 封面图加载 — 扩展 qinplayer:// 协议：
   - 主进程 protocol.handle 添加 `qinplayer://cover?path=xxx` 支持
   - 前端 `<img src="qinplayer://cover?path=xxx">` 统一通过自定义协议加载
   - 避免 CSP 拦截 file:// 协议

4. `LocalMusic.tsx` — 组件挂载时调用 `songs:getAll` 获取歌曲列表
5. 显示：序号 / 歌名 / 歌手 / 专辑 / 时长
6. 时长格式化为 `mm:ss`

**验证**：3000+ 首歌滚动流畅，封面图正常显示，点击播放正常

---

## Task 2.5: 搜索功能

**目标**：搜索框按歌名、歌手实时搜索

**文件**：
- Modify: `src/pages/Search.tsx`（搜索页面实现）
- Modify: `src/components/Sidebar.tsx`（搜索框在顶部）

**步骤**：

1. 搜索框输入 → 防抖 300ms → 调用 `songs:search`
2. 搜索结果用 SongList 组件渲染（带虚拟列表）
3. 支持歌名和歌手两个字段搜索
4. 空搜索框时显示最近搜索或热门歌曲

**验证**：输入关键词实时显示搜索结果，点击可播放

---

## Task 2.6: 歌单 CRUD

**目标**：创建/重命名/删除歌单，添加/移除歌曲

**文件**：
- Modify: `src/pages/Playlists.tsx`（歌单页面）
- Create: `src/pages/PlaylistDetail.tsx`（歌单详情）
- Create: `src/components/CreatePlaylistDialog.tsx`（创建歌单弹窗）

**步骤**：

1. `Playlists.tsx` — 歌单列表 + "+" 按钮新建
2. 点击歌单 → `PlaylistDetail` 显示歌单内歌曲
3. 歌单内歌曲排序：按添加顺序 / 按播放次数，升序/降序
4. 右键歌单 → 重命名 / 删除
5. 歌曲右键菜单 → 添加到歌单（弹出歌单选择列表）

**验证**：歌单 CRUD 完整，歌曲可添加/移除/排序

---

## Task 2.7: 歌曲右键菜单

**目标**：右键歌曲弹出上下文菜单

**文件**：
- Create: `src/components/ContextMenu.tsx`（通用右键菜单组件）
- Modify: `src/components/SongList.tsx`（集成右键菜单）

> ⚠️ 右键菜单必须处理边界情况：
> 计算 `e.clientX / e.clientY` 与窗口边缘的距离，
> 如果菜单高度超出屏幕底部，动态向上弹出。

**菜单项**：
- 播放
- 添加到歌单 → 子菜单列出所有歌单
- 从歌单移除（仅在歌单详情页显示）
- 打开文件所在目录
- 歌曲信息

**验证**：右键歌曲弹出菜单，靠近窗口边缘时菜单不会被截断

---

## Task 2.8: 专辑页面

**目标**：网格视图展示所有专辑，点击进入专辑歌曲列表

**文件**：
- Modify: `src/pages/Albums.tsx`
- Create: `src/components/AlbumGrid.tsx`（专辑网格）
- Create: `src/pages/AlbumDetail.tsx`（专辑详情）

**步骤**：

1. 从数据库按 `album` 字段分组，提取封面
2. `AlbumGrid` — 网格布局：封面 + 专辑名 + 歌手
3. 点击专辑 → `AlbumDetail` 显示该专辑所有歌曲
4. 无封面的专辑显示默认占位图

**验证**：专辑网格渲染正常，点击进入歌曲列表

---

## Task 2.9: 最近播放 + 我喜欢的

**目标**：记录最近播放，心形按钮标记喜欢

**文件**：
- Modify: `src/pages/RecentlyPlayed.tsx`
- Modify: `src/pages/Liked.tsx`
- Modify: `src/components/SongList.tsx`（心形按钮）
- Modify: `src/components/PlayerBar.tsx`（心形按钮）

**步骤**：

1. 每次播放歌曲 → 写入 `recently_played` 表
2. `RecentlyPlayed.tsx` — 显示最近 50 首，按时间倒序
3. `Liked.tsx` — 显示所有收藏的歌曲
4. `SongList.tsx` — 每行左侧心形按钮，点击切换收藏状态
5. `PlayerBar.tsx` — 当前歌曲旁也显示心形按钮

**验证**：最近播放自动记录，收藏功能正常

---

## Task 2.10: 数据持久化 — 启动恢复

**目标**：关闭再打开，恢复上次播放状态

**文件**：
- Modify: `src/App.tsx`（启动水合逻辑）
- Modify: `src/stores/playerStore.ts`（持久化逻辑）

> ⚠️ 必须处理水合闪烁：数据加载完成前显示骨架屏，不要先闪一下空状态。

**步骤**：

1. App.tsx — 水合逻辑：
   ```tsx
   const [isHydrated, setIsHydrated] = useState(false)
   
   useEffect(() => {
     async function restoreState() {
       const settings = await window.electronAPI.invoke('settings:getAll')
       // 恢复 playerStore 和 uiStore...
       setIsHydrated(true)
     }
     restoreState()
   }, [])
   
   if (!isHydrated) {
     return <LoadingSkeleton />  // 骨架屏
   }
   return <MainLayout />
   ```

2. 从 settings 表读取并恢复：
   - 上次播放的歌曲 ID
   - 上次播放位置（currentTime）
   - 音量
   - 播放模式
   - 当前歌单

3. 每次状态变更时防抖保存到 settings 表

**验证**：关闭再打开，无闪烁，直接显示上次播放状态

---

## Task 2.11: 增量扫描优化

**目标**：启动时自动检测新增歌曲，只解析变化的文件

**文件**：
- Modify: `electron/workers/scanner.ts`（增量逻辑）
- Modify: `electron/main.ts`（启动时触发增量扫描）

**步骤**：

1. 启动时对比数据库中的 mtime 与文件系统实际 mtime
2. 只对新增/修改的文件触发解析
3. 删除已不存在的文件记录
4. 增量扫描不显示进度条（秒级完成）

**验证**：新增歌曲后重启软件，自动出现在列表中

---

## Task 2.12: Phase 2 收尾 — 代码清理 + 提交

**目标**：代码注释、类型检查、Git 提交

**步骤**：

1. 补全所有中文注释
2. `npx tsc --noEmit` 验证
3. `git commit -m "feat: Phase 2 - 数据期完成"`
4. 不推送到远程，等主人测试确认

**验证**：tsc 无错误，commit 成功

---

## 新增依赖

| 包名 | 用途 |
|------|------|
| better-sqlite3 | SQLite 数据库（同步 API） |
| @electron/rebuild | 原生模块重编译 |
| @types/better-sqlite3 | TypeScript 类型 |
| music-metadata | ID3 标签解析 |
| @tanstack/react-virtual | 虚拟列表（长列表优化） |

---

*Phase 2 完成后，进入 Phase 3 打磨期*
