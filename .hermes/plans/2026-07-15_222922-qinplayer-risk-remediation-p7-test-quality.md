# P7 — 主进程剩余覆盖与测试输出零框架警告

> 前置：P1–P6 全部完成并通过 Reviewer。
> 目标：补齐 tray 直接测试；消除 React act 和 Vite/Vitest 配置警告，不靠全局静音。

## 已完成覆盖的前置假设

- P1 已新增 scanner core/reconciliation 直接测试。
- P2 已新增 database lifecycle/import 直接测试。
- P3 已新增 resource repository/protocol/Range 直接测试。
- P7 只补剩余 tray，以及测试基础设施质量；若前面阶段没有相应测试，先退回对应阶段，不在 P7 用表面 mock 补数字。

## 范围

### 新增

- `tests/tray.test.ts`

### 修改

- `electron/tray.ts`
- `tests/SongList.test.tsx`
- `tests/MiniPlayer.test.tsx`
- `tests/AppMotionHydration.test.tsx`
- `tests/Playlists.test.tsx`
- `tests/setup.ts`
- 将 `vitest.config.ts` 迁移为 `vitest.config.mts`
- 条件分支才修改 `package.json` 和 `package-lock.json`；需要主人明确批准。
- `SPEC.md`、`harness/DECISIONS.md`、`harness/TEST_CONVENTIONS.md`
- 新建 `docs/devlog/devlog-YYYYMMDD-test-quality.md`

### 非目标

- 不通过 `console.error = () => {}`、过滤 stderr 或关闭 StrictMode 消警告。
- 不修改生产组件来迎合测试，除非测试揭示真实 unmount/竞态 bug；发现后另立修复。
- 不把测试中的预期业务错误日志与框架 warning 混为一谈。
- 未经授权不改依赖。

## Task 1：先写 tray 特征测试

为 `electron/tray.ts` 抽出最小可测试模板构造/adapter，不改用户行为。`tests/tray.test.ts` 覆盖：

1. playback=true 时顺序为播放/暂停、separator、上一首、下一首、separator、显示主窗口、separator、退出。
2. `isPlaying` 改变时标签在“播放/暂停”切换。
3. playback=false 时只有显示主窗口与退出相关项。
4. 托盘 click 和“显示主窗口”都调用 show + focus。
5. play/pause、prev、next、quit 精确路由一次。
6. `updateMenu` 在 tray 尚未创建时无副作用。
7. `destroyTray` 幂等，并清模块引用。
8. create/destroy/create 不保留旧 callback/flag。

优先注入 Tray/Menu/nativeImage adapter；不要让 Vitest 依赖真实 Windows tray。

## Task 2：逐个清掉 18 条 act warning

当前实测来源：

- `tests/SongList.test.tsx`：10 条；同步用例未等待 `songs:getLiked` Promise 后的 `setLikedIds`。
- `tests/MiniPlayer.test.tsx`：6 条；用例结束前歌词读取 Promise 仍更新状态。
- `tests/AppMotionHydration.test.tsx`：1 条；store reset 未在 act。
- `tests/Playlists.test.tsx`：1 条；直接更新 Zustand 未在 act。

修复策略：

- SongList：建立 async render/settle helper，在 `act` 内完成收藏加载；使用 fake timers 的用例同时 flush Promise 和 500ms timer。
- MiniPlayer：建立 ready helper；与歌词无关的用例可显式关闭 lyrics flag，歌词相关用例必须等待真实异步完成。
- AppMotionHydration：afterEach 的 store reset 包进 `act`，并确保 RTL cleanup 顺序正确。
- Playlists：feature flag/store 更新包进 `act`。

每个文件单独运行确认 warning 数下降，不得只看测试 pass。

## Task 3：让未来 act warning 变成失败

在现有 warning 清零后，`tests/setup.ts` 增加窄范围 guard：

- 只匹配 React 的 `not wrapped in act` / `wrap-tests-with-act` 特征。
- 命中时让当前测试失败。
- 其他 console.error 继续原样输出，不能吞掉 MyProfile、Settings、IPC 非法输入等故障测试的预期日志。
- 与单测局部 `vi.spyOn(console, 'error')` 可共存，并在 teardown 恢复。

为 guard 写一个最小自测或在测试规范中明确维护方法，避免未来 React 文案变化导致静默失效。

## Task 4：先走无依赖的 Vite 警告方案

现状：

- `vitest.config.ts` 以 CJS 加载 `@vitejs/plugin-react/dist/index.cjs`，触发 Vite 5 CJS Node API warning。
- 应用/electron-vite/plugin-react 使用 Vite 5.4.21。
- Vitest 4.1.8 自带 Vite 8.0.16。
- 测试配置加载 React plugin 后，Vite 8 报 plugin 的 esbuild/optimizeDeps 旧选项和 oxc 双设置警告。

按以下顺序：

1. 把 `vitest.config.ts` 重命名为 `vitest.config.mts`，强制 ESM；不要给 `package.json` 增 `"type":"module"`，避免波及 Electron CJS 和 `scripts/afterPack.js`。
2. 同一变更把 config 中的 `resolve(__dirname, 'src')` 改为 ESM-safe 的 `fileURLToPath(new URL('./src', import.meta.url))`（从 `node:url` 导入）；若 `node:path.resolve` 已无其他用途则移除该 import。`.mts` 中不得继续依赖 CommonJS `__dirname`。
3. 从 Vitest 配置移除 `react()`。测试不需要 Fast Refresh；先依赖 Vitest/Vite 对 TSX + tsconfig `jsx: react-jsx` 的默认转换。
4. `electron.vite.config.ts` 保留 React plugin，生产 Renderer 构建链不变。
5. 先跑一个含 `@` alias import 的 TSX 定向测试，证明新 URL alias 可解析，再跑全量和生产 build。

~~~powershell
npx vitest run tests/SongList.test.tsx
npm test -- --reporter=dot
npm run build
~~~

通过标准：

- 四类 Vite warning 全部消失。
- `vitest.config.mts` 可被 ESM 正常加载，`@` alias 仍解析到仓库 `src`。
- 53/520 基线只允许因本计划新增测试而上升，不得减少旧测试。
- production renderer JSX/build 行为不变。

## Task 5：无依赖方案失败时停止并请求授权

若移除 test React plugin 后 TSX/coverage 行为不兼容：

1. 先恢复 plugin/config 到可运行状态。
2. 向主人提交两个有官方 peer-range 证据的选项，不得猜版本：
   - 保守：选择官方支持 Vite 5 的 Vitest 版本。
   - 升级：electron-vite、Vite、plugin-react、Vitest 一次性对齐同一受支持主版本。
3. 未获批准时，本阶段标记“框架 warning 子项 blocked”，其他 tray/act 工作仍可完成，但不得声称 P7 全完成。
4. 获批后的依赖调整必须是独立变更集，只包含 `package.json`、`package-lock.json`、必要 config，并额外做生产 build 和 NSIS smoke。

不得用 `npm install --force`、`--legacy-peer-deps` 或锁文件手改绕过兼容性。

## 自动验收

~~~powershell
npx vitest run tests/tray.test.ts tests/SongList.test.tsx tests/MiniPlayer.test.tsx tests/AppMotionHydration.test.tsx tests/Playlists.test.tsx
npx tsc --noEmit
node harness/checks.js
npm test -- --reporter=dot
npm run build
git diff --check
npm ls vite vitest @vitejs/plugin-react electron-vite --depth=3
~~~

人工检查测试输出：

- 无 `not wrapped in act`。
- 无 Vite CJS Node API deprecated。
- 无 `vite:react-babel` esbuild/optimizeDeps deprecated。
- 无 esbuild/oxc 同时设置。
- 预期业务错误日志可以存在，但应由相应用例明确触发。

## 真实 Electron 验收

- Tray：播放/暂停、上一首、下一首、显示窗口、退出；playback flag 消融。
- P7 无依赖方案不改变生产 app；仍做一次启动、页面切换和播放 smoke。
- 若获批并调整依赖，必须做完整 dev/build/打包版 smoke；未做 NSIS 时明确报告。

## 文档闭环

- `SPEC.md`：更新带日期的真实测试数量和自动/桌面边界。
- `harness/DECISIONS.md`：记录 test config ESM、为何不在 Vitest 使用 React Fast Refresh plugin，以及依赖分支是否获批。
- `harness/TEST_CONVENTIONS.md`：框架 warning 视为失败；预期业务错误日志不得全局静音；main pure adapter 的测试方式。
- devlog：写 warning before/after、依赖树和真实输出。

## Reviewer 阻断清单

- 通过静音 console 或移除 StrictMode 消警告。
- 旧测试数量减少。
- 为测试 warning 修改生产业务语义。
- Vitest 配置修复破坏 production electron-vite build。
- 未经批准修改依赖/lockfile。
- package 加 `type=module` 却未审 Electron CJS/afterPack。
- config 改成 `.mts` 后仍使用 `__dirname`，或 alias 悄悄失效。
- tray 测试只断言文本、不验证 callback、flag 和生命周期。

## 回滚

- Tray 测试提取只回滚 tray/test 切片。
- act 修复仅回滚四个测试和 setup guard，不改生产代码。
- config 回滚时把 `vitest.config.mts` 恢复为原 `vitest.config.ts`。
- 若获批做依赖调整，必须同时回滚 manifest 和 lockfile，再执行干净安装和全量验证。
- 不自动 commit、push、package 或 release。
