# Codex 任务包：窗口尺寸持久化

## 背景
- QinPlayer 是 Electron + React + TypeScript 桌面音乐播放器
- 窗口尺寸目前硬编码 1000x680，每次启动都是同一位置和大小
- 用户希望窗口退出时保存位置和尺寸，下次启动恢复

## 目标
- 实现窗口尺寸持久化功能，退出时保存 bounds，启动时恢复
- 新增 `windowSizePersist` feature flag，默认开启
- 处理迷你模式、最大化、多显示器等边界情况

## 非目标
- 不实现歌词行数修正（另一个独立方案）
- 不修改播放逻辑、UI 组件、样式
- 不引入新 npm 依赖

## 相关文件
- `docs/plans/PLAN-window-size-persist.md` — **完整方案，必须先读**
- `src/types/ipc.ts` — FeatureFlagKey + FeatureFlags 接口
- `src/utils/featureFlags.ts` — FEATURE_FLAG_KEYS + DEFAULT_FEATURE_FLAGS
- `electron/main.ts` — 主进程入口、窗口创建、close handler
- `electron/ipc/window.ts` — 迷你模式 handler
- `electron/ipc/settings.ts` — settings:get / settings:set IPC
- `electron/db/database.ts` — better-sqlite3 数据库（同步 API）
- `tests/featureFlags.test.ts` — 现有测试
- `tests/setup.ts` — 测试 mock

## 约束
- 不引入新依赖
- 不修改 package.json
- better-sqlite3 是同步 API，createWindow 保持同步不改 async
- 不改播放逻辑、不改 UI 组件
- 代码加中文注释
- 不要自动 git commit

## 当前方案
方案文件 `docs/plans/PLAN-window-size-persist.md` 经过 Codex 两轮审查，已处理：
- 迷你模式进入前保存正常 bounds + 暂停持久化（isMiniMode 标志）
- debounce timer 回调内二次检查 isMiniMode
- bounds 验证要求标题栏至少 60px 可见（frame: false 窗口）
- normalizeWindowBounds 完整算法（clamp 最小尺寸 → 找有效显示器 → clamp x/y）
- close handler 合并到现有 tray handler
- macOS activate 修复（模块级 featureFlags）

方案包含 6 个 Task，按顺序执行。

## 需要 Codex 做什么
按方案逐 Task 实现：
1. 新增 windowSizePersist feature flag（类型+默认值）
2. 新建 electron/windowBounds.ts 共享模块
3. main.ts 导入 + 模块级变量 + macOS activate 修复
4. createWindow 读取已保存 bounds
5. resize/move debounce 保存 + close 兜底
6. window.ts 迷你模式进入/退出
7. 测试

每个 Task 完成后单独跑 `npx tsc --noEmit` + `npm test`。

## 已验证
- `npx tsc --noEmit` — 当前通过
- `npm test` — 11 文件 / 136 测试全绿
- WSL 下需要 `npm install @rolldown/binding-linux-x64-gnu --no-save` 补装原生绑定

## 需要特别注意
- **close handler 合并**：main.ts 第 146 行已有 `mainWindow.on('close')` 处理 tray，bounds 保存逻辑合并进去，不要新增独立 listener
- **boundsTimer 提升为模块级变量**：`saveCurrentWindowBoundsNow` 回调需要访问它
- **registerWindowIPC 签名扩展**：新增 `getFeatureFlags`、`setMiniMode`、`saveCurrentWindowBoundsNow` 三个回调参数
- **windowBounds.ts 导入**：main.ts 不需要导入 screen 和 getDatabase（封装在 windowBounds.ts 内）
- **feature flag 追加位置**：打开当前源码找到最后一个元素，在其后追加，不要照抄方案里的上下文行
- **NaN/Infinity 拦截**：loadWindowBounds 中 typeof 检查会放过 NaN，必须加 Number.isFinite()

## 返回格式

```
## 结论
已完成 / 需要返工 / 需要主人确认

## 变更
- 改了哪些文件
- 改了什么行为

## 验证
- tsc 结果
- npm test 结果
- 哪些没跑，为什么

## 风险
- 仍需注意的问题

## 需要主人确认
- UI/体验/产品取舍
```
