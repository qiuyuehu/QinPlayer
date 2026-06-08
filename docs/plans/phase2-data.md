# Phase 2: 数据期（Data Layer）

> 引入 SQLite 数据库，Worker Threads 后台扫描，实现歌单 CRUD、搜索、歌曲元数据解析。

---

## Task 2.1: SQLite 数据库初始化

**目标**：引入 better-sqlite3，创建数据库表结构

**文件**：
- Create: `electron/db/database.ts`（数据库初始化 + 表结构）
- Modify: `electron/main.ts`（引入数据库）

> ⚠️ 数据库路径必须用 `app.getPath('userData')`，不能存项目目录。
> 参考 ARCHITECTURE.md "打包后路径解析" 章节。

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

**验证**：数据库文件创建成功，表结构正确

---

## Task 2.2: IPC Handler — 数据库操作

**目标**：主进程封装所有数据库操作为 IPC Handler

**文件**：
- Create: `electron/ipc/songs.ts`（歌曲相关 IPC）
- Create: `electron/ipc/playlists.ts`（歌单相关 IPC）
- Create: `electron/ipc/settings.ts`（设置相关 IPC）
- Modify: `electron/preload.ts`（暴露 API，类型安全）

**步骤**：

1. `songs.js` — 歌曲 CRUD：
   - `songs:search` — 按歌名/歌手搜索
   - `songs:getAll` — 获取所有歌曲
   - `songs:getById` — 获取单首
   - `songs:updatePlayCount` — 播放次数 +1
   - `songs:like` / `songs:unlike` — 收藏/取消收藏
   - `songs:getLiked` — 获取收藏列表
   - `songs:getRecent` — 获取最近播放（50首）

2. `playlists.js` — 歌单 CRUD：
   - `playlists:create` / `playlists:rename` / `playlists:delete`
   - `playlists:getAll` / `playlists:getById`
   - `playlists:addSong` / `playlists:removeSong`
   - `playlists:getSongs` — 获取歌单内歌曲（支持排序）
   - `playlists:reorder` — 拖拽排序

3. `settings.js` — 设置读写：
   - `settings:get` / `settings:set`
   - `settings:getFolders` / `settings:addFolder` / `settings:removeFolder`

4. `preload.js` — 通过 contextBridge 暴露所有 API

**验证**：渲染进程能调用所有 IPC 方法，数据库读写正常

---

## Task 2.3: Worker Threads 后台扫描

**目标**：用独立线程扫描文件夹，解析 ID3 标签，不阻塞 UI

**文件**：
- Create: `electron/workers/scanner.ts`（扫描 Worker）

> ⚠️ Worker 线程绝对不能直接写 SQLite！只负责解析 ID3，
> 通过 postMessage 将 JSON 数据发回主进程，主进程开启事务批量写入。

**步骤**：

1. `scanner.js` — Worker 线程：
   - 接收文件夹路径列表
   - 递归扫描音频文件
   - 用 `music-metadata` 解析 ID3 标签（歌名、歌手、专辑、时长、封面）
   - 提取封面图保存到缓存目录
   - 通过 `parentPort.postMessage` 发送进度
   - 增量扫描：对比 mtime，只解析新增/修改的文件

2. 主进程启动 Worker，监听消息：
   - `progress` — 扫描进度（百分比 + 当前文件名）
   - `song` — 发现一首新歌曲，写入数据库
   - `done` — 扫描完成
   - `error` — 错误信息

3. 渲染进程显示扫描进度条

**验证**：扫描 100+ 首歌曲不卡 UI，进度实时更新，ID3 标签正确解析

---

## Task 2.4: 歌曲列表 — 使用真实数据

**目标**：SongList 组件从数据库获取歌曲，显示 ID3 标签信息

**文件**：
- Modify: `src/components/SongList.tsx`
- Modify: `src/pages/LocalMusic.tsx`

**步骤**：

1. `LocalMusic.tsx` — 组件挂载时调用 `songs:getAll` 获取歌曲列表
2. `SongList.tsx` — 显示：序号 / 歌名 / 歌手 / 专辑 / 时长
3. 点击歌曲 → 播放，双击播放并加入播放列表
4. 时长格式化为 `mm:ss`

**验证**：歌曲列表显示真实 ID3 信息，点击播放正常

---

## Task 2.5: 搜索功能

**目标**：搜索框按歌名、歌手实时搜索

**文件**：
- Modify: `src/pages/Search.tsx`（搜索页面实现）
- Modify: `src/components/Sidebar.tsx`（搜索框在顶部）

**步骤**：

1. 搜索框输入 → 防抖 300ms → 调用 `songs:search`
2. 搜索结果用 SongList 组件渲染
3. 支持歌名和歌手两个字段搜索
4. 空搜索框时显示最近搜索或热门歌曲

**验证**：输入关键词实时显示搜索结果，点击可播放

---

## Task 2.6: 歌单 CRUD

**目标**：创建/重命名/删除歌单，添加/移除歌曲

**文件**：
- Modify: `src/pages/Playlists.tsx`（歌单页面）
- Create: `src/components/PlaylistDetail.tsx`（歌单详情）
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

**菜单项**：
- 播放
- 添加到歌单 → 子菜单列出所有歌单
- 从歌单移除（仅在歌单详情页显示）
- 打开文件所在目录
- 歌曲信息

**验证**：右键歌曲弹出菜单，各功能正常

---

## Task 2.8: 专辑页面

**目标**：网格视图展示所有专辑，点击进入专辑歌曲列表

**文件**：
- Modify: `src/pages/Albums.tsx`
- Create: `src/components/AlbumGrid.tsx`（专辑网格）
- Create: `src/components/AlbumDetail.tsx`（专辑详情）

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
- Modify: `src/App.tsx`（启动时恢复状态）
- Modify: `src/stores/playerStore.ts`（持久化逻辑）

**步骤**：

1. 启动时从 settings 表读取：
   - 上次播放的歌曲 ID
   - 上次播放位置（currentTime）
   - 音量
   - 播放模式
   - 当前歌单
2. 恢复到 playerStore
3. 每次状态变更时防抖保存到 settings 表

**验证**：关闭再打开，恢复到上次播放位置

---

## Task 2.11: 增量扫描优化

**目标**：启动时自动检测新增歌曲，只解析变化的文件

**文件**：
- Modify: `electron/workers/scanner.js`（增量逻辑）
- Modify: `electron/main.js`（启动时触发增量扫描）

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
4. 不推送到远程

**验证**：tsc 无错误，commit 成功

---

*Phase 2 完成后，进入 Phase 3 打磨期*
