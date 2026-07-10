# QinPlayer 约束条件

> 版本：v1.1
> 创建：2026-07-01
> 更新：2026-07-01（补充 ARCHITECTURE.md 技术约束）
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
- **不做均衡器**（SPEC 原始约束，但代码中已有 eq.ts / Equalizer.tsx，如需删除请确认）
- **单实例锁**：不允许重复打开多个窗口

---

## 三、代码风格

### TypeScript
- 严格模式（`strict: true`）
- 主进程和渲染进程共用 `src/types/ipc.ts` 的 IPC 类型映射
- 禁止裸字符串 IPC 通道名，必须通过 `IpcChannels` 接口定义
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
- 表头放在滚动容器内部，用 `position: sticky; top: 0`
- 窗口关闭最小化到托盘，不退出应用

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

### 增量扫描
- SQLite 记录文件绝对路径 + `mtime`
- 启动时对比文件系统与数据库记录，仅对新增/修改的文件触发 Worker 解析

### 自定义协议
- 注册 `qinplayer://` 协议
- 前端请求 `qinplayer://audio?id=1024` → 主进程拦截 → 查询 SQLite 获取路径 → 返回文件流
- 支持 Range Requests（拖动进度条缓冲）

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
2. 阅读 docs/ARCHITECTURE.md 了解模块职责和数据流
3. 阅读最近的 devlog 了解当前状态
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
- 所有通道必须在 `src/types/ipc.ts` 的 `IpcChannels` 接口中定义
- 定义 `args`（参数类型）和 `return`（返回值类型）
- 主进程 `ipcMain.handle` 和渲染进程 `ipcRenderer.invoke` 共享此类型

### 错误处理
- 必须 try-catch 包裹
- 错误信息用中文

---

## 十、踩坑预防

- electron-vite 编译主进程 TypeScript → CommonJS，源码用 `import` 但运行时是 CJS
- `better-sqlite3` 需要原生编译，打包时用 `electron-rebuild`
- 无边框窗口的 `-webkit-app-region: drag` 会影响子元素交互，必须逐个排查
- 淡入淡出用 `GainNode.gain.linearRampToValueAtTime()`，不要用 CSS transition
- Media Session API 只在用户交互后才生效（浏览器安全策略）

---

*约束的目的是让代码更可靠、更可维护、更易协作。*
