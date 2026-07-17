# QinPlayer 约束条件

> 版本：v1.2
> 创建：2026-07-01
> 更新：2026-07-15（校准 EQ、关闭行为、SongList 表头与协议安全目标）
> 说明：永久性约束规范，所有改动必须遵守

---

## 一、技术栈锁定

| 项 | 版本/选型 | 禁止替换 |
|----|----------|---------|
| 框架 | Electron + React 18 + TypeScript | 不换 Vue/Svelte |
| 构建 | electron-vite | 不换 webpack/vite-electron-builder |
| 状态管理 | Zustand 5 | 不换 Redux/Jotai |
| 数据库 | better-sqlite3（同步 API） | 不换异步 SQLite 库 |
| 元数据解析 | music-metadata | 不换 node-id3 |
| 虚拟列表 | @tanstack/react-virtual | 不换 react-window |
| 测试 | Vitest + @testing-library/react | 不换 Jest |

---

## 二、产品边界

- **不联网**，纯本地播放器
- **不做全局快捷键**（暂时）
- **不导入 .m3u 歌单**，只手动建
- **均衡器是正式能力**：保持 10 段有限增益、独立 headroom/fade/volume 职责和持久化校验
- **单实例锁**：不允许重复打开多个窗口

---

## 三、代码风格

### TypeScript
- 严格模式（`strict: true`）
- 主进程和渲染进程共用 `src/types/ipc.ts` 的四个 IPC surface map
- invoke、Renderer → main send、main → Renderer event 必须使用各自 tuple/result 类型，禁止跨方向复用
- 禁止 `any` 类型，必要时用 `unknown` + 类型守卫

### 命名规范
- 文件名：小驼峰 `playerStore.ts`、`AudioEngine.ts`（组件用大驼峰）
- 类型/接口：大驼峰 `Track`、`Playlist`、`IpcChannels`
- 常量：全大写下划线 `MAX_RECENT_COUNT`
- IPC 通道：冒号分隔 `songs:getAll`、`playlists:create`

### 注释规范
- 注释用中文
- 文件头部用 `// ====` 分隔线说明模块职责
- 关键决策用 `★` 标记

---

## 四、禁止事项

### 文件锁定
- 不修改 `package.json` 的 dependencies（除非主人确认）
- 不修改 `tsconfig.json`、`tsconfig.node.json`、`tsconfig.web.json`
- 不删除现有测试用例

### 代码安全
- 主进程禁止同步 I/O（`readdirSync`/`statSync` 会卡死窗口）
- Worker 线程不能直接写 SQLite（只解析不写库）
- 自定义协议必须在 `app.whenReady` 之前注册为特权协议
- 不将本地音频文件读取为 Base64 通过 IPC 传输（内存暴涨）

### 架构红线
- `currentTime`（播放秒数）不放入 Zustand 全局 Store（高频 ~4次/秒，会导致全量 re-render）
- `scanProgress` 也不放 Zustand（临时状态，扫描结束就不需要了，用组件内部 useState）
- 歌词滚动使用 `scrollTo()` + `behavior: 'smooth'`（普通滚动）或 `behavior: 'auto'`（切歌跳转），隐藏原生滚动条
- SongList 表头放在虚拟列表滚动容器外，表头本身不参与歌曲行滚动
- 托盘开启时，关闭行为支持最小化、退出、每次询问；托盘关闭时必须直接退出

---

## 五、UI 规范

### 主题系统
- 亮色/暗色/跟随系统三选一
- 暗色底色：`#121212`（中性灰黑，不偏蓝紫）
- 所有颜色通过 CSS 变量引用，不硬编码
- 切换方式：设置页面三选项

### CSS 变量（必须遵守）
```css
/* 暗色 */
--bg-primary: #121212;
--bg-secondary: #1a1a1a;
--bg-tertiary: #2a2a2a;
--accent: #6366f1;

/* 亮色 */
--bg-primary: #ffffff;
--bg-secondary: #f5f5f7;
--bg-tertiary: #e8e8ed;
--accent: #6366f1;
```

### 窗口规范
- 主窗口：1000×680，可拉伸
- 迷你模式：`400×150` 基准窗口，歌曲/歌词/队列共用固定壳层，视图切换不得改变窗口尺寸
- 无边框窗口，自定义标题栏
- `-webkit-app-region: drag` 区域内的按钮、range、队列行和滚动容器必须显式声明 `no-drag`

### 配色
- 封面主色提取用 HSL 亮度过滤（L > 0.70 跳过，L < 0.08 跳过）
- 提取后 L > 0.35 自动压暗到 L ≈ 0.30

---

## 六、数据层规范

### SQLite 多线程安全
- **黄金法则**：Worker 线程绝对不允许直接操作 SQLite
- Worker 只负责读取文件系统、解析 ID3 标签
- 解析完成后通过 `parentPort.postMessage()` 发纯 JSON 给主进程
- 主进程接收后开启事务批量 INSERT
- 当前实现仍按每条 `song` 消息逐条 upsert；批量事务继续作为待整改约束

### 增量扫描
- SQLite 记录文件绝对路径 + `mtime`
- 启动时对比文件系统与数据库记录，仅对新增/修改的文件触发 Worker 解析
- 每轮 Worker 必须发送 `roots + existingPaths + unavailablePaths` 文件系统快照；`readdir/stat` 失败必须记录对应 root/subtree/entry，禁止把不可访问解释为不存在
- 删除候选只能来自本轮注册 root 内，且必须同时满足“不在 existingPaths”与“不位于任何 unavailable scope”；root containment 使用 `path.resolve`、`path.relative`、`path.isAbsolute` 和 Windows 大小写语义，禁止用裸字符串前缀判断
- 只有同一个 Worker 同时具备合法且与启动 roots 一致的 snapshot、`done`、`exit(0)` 且从未 fatal/error，才允许在单个 better-sqlite3 transaction 中提交删除并发送公共 `scan:done`
- `scan:done.total` 表示本轮尝试解析数，解析失败仍计入，并与 progress 分母一致
- 歌曲 upsert 当前仍按每条 `song` 消息执行；本轮扫描安全修复不得借机宣称或实施批量 upsert

### 数据库导入
- 候选数据库必须在 live 连接关闭前完成普通文件、同一实体、SQLite integrity、外键、核心表/列及关键 unique/FK 验证；不得把任意可打开 SQLite 当作 QinPlayer 备份
- 导入只能把候选复制到 live DB 同目录的唯一 stage；禁止 `copyFile(..., target)`、delete+copy 或 Windows rename 失败后的非原子覆盖 fallback
- 发布前 `wal_checkpoint(TRUNCATE)` 必须同时满足 `busy = 0` 与 WAL frames 全部 checkpoint，随后同步关闭连接，二者之间不得插入异步工作
- `prepared`、`old-moved`、`new-published`、`committed` marker 必须独占新建、写入、sync、关闭且不可覆盖；`committed` 必须可脱离前三个 marker 独立验证
- phase manifest 必须记录原 target 的稳定文件身份；rollback 回迁与恢复后清理续跑只能在当前 target 身份匹配时进行
- `committed` 用经目标 Windows/Electron 验证的稳定 device/file ID 绑定 target；不得用会随正常写入变化的内容 hash、size 或 mtime 代替
- 新库可查询且 `committed` 已持久化前不得删除 rollback 或 reload/relaunch；失败后必须恢复可用旧连接，恢复失败则保留全部 artifacts 并停止启动
- target 名称被新库占用时必须先 rename 到唯一 quarantine；quarantine 失败后禁止覆盖 target 或移动 rollback
- prepared 前 orphan stage 只能清理 stage/sidecars，不得改写 target；任一事务 artifacts 未收尾时禁止创建第二组导入事务

### 自定义协议
- 注册 `qinplayer://` 协议
- Renderer 不得通过协议直接授权任意绝对路径；资源必须通过歌曲 ID 或主进程维护的受控映射解析，并在返回文件流前校验资源类型和允许范围
- 支持经过边界校验的 Range Requests（拖动进度条缓冲），非法或越界范围必须拒绝
- 缓存版本参数不得参与数据库查询、路径解析或授权；未知 host、旧 path 参数和资源类型错配必须拒绝
- audio/cover/avatar 必须在 `realpath` 后执行 path-aware containment 和普通文件检查，symlink/junction 不得逃逸允许根

---

## 七、测试规范

### 基本要求
- 每个 bug 修复必须有对应测试
- 每个新功能必须有测试覆盖
- 测试必须独立，不依赖执行顺序
- 测试运行时间 < 30 秒

### 文件规范
- 测试文件名：`*.test.ts` 或 `*.test.tsx`
- 测试目录：`tests/`
- 标准运行命令：`npm test`（自动先执行 Harness 约束检查）

### 验收标准
- 全量测试通过（0 失败）
- 新增测试覆盖所有改动
- 不破坏现有测试

---

## 八、修改流程

### 改动前
1. 阅读 SPEC.md 了解项目架构
2. 阅读 `harness/CONSTRAINTS.md`、`harness/DECISIONS.md` 和 `harness/TEST_CONVENTIONS.md`
3. 阅读与任务相关的最新 devlog 和已确认计划
4. 写执行方案，主人确认后再动手

### 改动中
1. 遵守代码风格规范
2. 每个函数写注释
3. 关键决策用 ★ 标记
4. 保持代码可读性

### 改动后
1. 语法检查：`npx tsc --noEmit`
2. 完整验证：`npm run verify`
3. 确保约束检查、构建和测试全部 0 失败
4. 等主人验证后再打包

---

## 九、IPC 通道规范

### 命名规则
- 格式：`模块:动作`
- 示例：`songs:getAll`、`playlists:create`、`settings:get`

### 类型定义
- 主窗口 invoke、Mini 菜单 invoke、Renderer → main send、main → Renderer event 必须分别定义在 `MainWindowInvokeChannels`、`ContextMenuInvokeChannels`、`IpcSendChannels`、`IpcEventChannels`
- 每个 channel 定义 tuple `args`；invoke 额外定义 `result`
- runtime allowlist 必须由共享的四个 channel 常量构造，不得在 preload 中手写或扩写 key
- Mini 菜单 preload 只能暴露三个固定方法，不得获得主窗口通用 invoke/send/on

### 主进程边界
- 业务注册和发送统一经过 `electron/ipc/typedIpc.ts` 的 `handleIpc`、`onIpc`、`sendIpc`
- `typedIpc.ts` 之外禁止直接使用 `ipcMain.handle`、`ipcMain.on` 或业务 `webContents.send`
- channel 必须是字符串字面量；合同、注册、发送点与 preload allowlist 的缺失、重复和方向错误由 Harness 阻断
- 编译期类型不是运行时授权；handler 仍必须校验 payload、sender、路径和业务状态

### 错误处理
- thrown error 由 typed 边界记录原始异常并转换为不泄露本地路径/堆栈的固定中文错误
- canceled/success 等既有结构化结果保持原语义；结构化失败不得直接返回 `String(error)`
- 无返回 send 的非法 payload 应记录并忽略，不能让异常穿透主事件循环

---

## 十、踩坑预防

- electron-vite 编译主进程 TypeScript → CommonJS，源码用 `import` 但运行时是 CJS
- `better-sqlite3` 需要原生编译，打包时用 `electron-rebuild`
- 无边框窗口的 `-webkit-app-region: drag` 会影响子元素交互，必须逐个排查
- 淡入淡出用 `GainNode.gain.linearRampToValueAtTime()`，不要用 CSS transition
- Media Session API 只在用户交互后才生效（浏览器安全策略）

---

*约束的目的是让代码更可靠、更可维护、更易协作。*
