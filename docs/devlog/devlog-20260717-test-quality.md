# 2026-07-17 测试质量收口

## 目标

- 为 Tray 菜单、动作与模块生命周期增加直接测试。
- 把 React act warning 变成失败，并消除 Vitest/Vite 配置 warning。
- 不静音诊断、不移除 StrictMode、不修改依赖或生产构建链。

## 实现

- `electron/tray.ts` 保留原有 `createTray/updateMenu/destroyTray`，内部改用可注入 controller adapter；每个实例绑定自己的 callback 与 Feature Flags。
- 新增 8 个 Tray 测试，覆盖完整/消融菜单、播放标签、show/focus、四类动作、未创建更新、幂等销毁和重建隔离。
- 当前四个指定测试在 guard 前没有稳定输出可计数的 act 文本；加入 guard 后，MiniPlayer 的未完成歌词 Promise、AppMotion cleanup/reset 和 Playlists 直接 Store 更新立即使目标组失败，随后按真实异步边界修复。
- `tests/setup.ts` 只拦截 React act warning 特征并抛错，其他 `console.error` 原样转发；维护 probe 方法记录在 `harness/TEST_CONVENTIONS.md`。
- `vitest.config.ts` 迁为 ESM `vitest.config.mts`，alias 改用 `fileURLToPath(new URL(..., import.meta.url))`，移除测试链的 React plugin；生产 `electron.vite.config.ts` 未改。
- `SongList.test.tsx` 使用 `@/components/SongList`，直接证明 ESM alias 与 TSX 默认转换可用。

## Warning 前后

- 迁移前每次定向运行：Vite CJS warning 1、`vite:react-babel` 旧选项 warning 2、esbuild/oxc 双配置 warning 1。
- 迁移后 P7 目标和全量运行：act guard 0、原始 act 文本 0、Vite CJS 0、React plugin/双配置 0。
- 未过滤 stderr；预期业务错误日志仍由对应故障测试输出。

## 自动门禁

- P7 目标：5 files / 65 tests passed。
- `npx tsc --noEmit`：通过。
- Harness：`electron=24, workers=2, src=61`，通过。
- 全量：71 files / 847 tests passed。
- `npm run build`：main、两个 preload 和 Renderer bundle 均构建成功。
- `git diff --check`：无空白错误，仅有工作树既有 LF/CRLF 转换提示。
- 依赖树：production 为 Vite 5.4.21 + `@vitejs/plugin-react` 4.7.0 + electron-vite 2.3.0；Vitest 4.1.8 自带 Vite 8.0.16。
- `package.json`、`package-lock.json` 无差异；未进入依赖授权分支。

## 独立 Review

- 结论：Blocker 0、Important 0、Suggestion 0，Review gate PASS。
- Reviewer 独立确认 Tray controller 无 stale closure 或生产语义回归，act guard 范围正确，ESM alias 与 production build 均有效。

## 未自动化覆盖

- 真实 Electron Tray 动作、playback flag 消融，以及启动/页面切换/播放的人工 smoke；未执行打包或 NSIS smoke。
