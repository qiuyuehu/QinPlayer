# Codex 任务包：QinPlayer Feature Flags

## 背景
- QinPlayer 是纯本地音乐播放器（Electron + React + TypeScript + Zustand）
- 目前所有功能默认开启，无开关机制
- 主人后续要新增功能，需要统一的 feature flag 体系来控制功能裁剪
- 方案已经 Codex 审查通过，4 项硬边界修正已合并

## 目标
为 13 个现有功能添加开关，通过 `feature-flags.json` + 代码默认值统一管理。关闭某功能 = 导航栏隐藏入口 + 功能逻辑完全禁用 + 所有入口点统一拦截。

## 非目标
- 不做运行时热切换（改 JSON 重启即生效，不需要重新打包）
- 不做用户级开关（纯开发者工具）
- 不做渐进式启用（要么开要么关）

## 相关文件

### 必读
- `SPEC.md` — 项目规格书
- `harness/CONSTRAINTS.md` — 代码约束（TypeScript 严格模式、禁止 any、IPC 强类型）
- `docs/plans/PLAN-feature-flags.md` — 完整执行方案（本任务包的详细版）

### 需要改动的文件
- `electron/ipc/settings.ts` — 新增 DEFAULT_FLAGS + loadFeatureFlags + IPC
- `electron/preload.ts` — INVOKE_CHANNELS 加白名单 + 暴露 API
- `electron/main.ts` — 传递 flags 给 tray，tray=false 时改 close handler
- `electron/tray.ts` — 接收 flags，移除播放相关菜单项
- `src/types/ipc.ts` — 新增 FeatureFlagKey / FeatureFlags 类型
- `src/types/electron.d.ts` — 新增 getFeatureFlags 类型
- `src/stores/uiStore.ts` — 新增 featureFlags 状态
- `src/App.tsx` — 启动顺序改造（flags 优先）
- `src/components/Sidebar.tsx` — 导航过滤
- `src/components/Content.tsx` — 页面渲染守卫
- `src/components/PlayerBar.tsx` — playback=false 隐藏
- `src/components/MiniPlayer.tsx` — playback/miniMode=false 隐藏
- `src/components/SongList.tsx` — 多入口拦截
- `src/hooks/useAudioSync.ts` — playback/mediaSession/fadeEffect guard
- `src/utils/mediaSession.ts` — mediaSession=false 跳过注册
- `src/pages/Settings.tsx` — equalizer=false 隐藏 EQ 区块

### 需要新建的文件
- `tests/featureFlags.test.ts` — flag 读取测试
- `tests/useAudioSync.test.ts` — fadeEffect 降级测试

## 约束
- 不引入新依赖
- 不修改 package.json 的 build 配置
- 不删除现有测试用例
- 遵守 harness/CONSTRAINTS.md 所有约束
- 主进程用 TypeScript，通过 electron-vite 编译为 CommonJS
- IPC 通道必须在 `src/types/ipc.ts` 的 `IpcChannels` 接口中定义
- 禁止 `any` 类型，必要时用 `unknown` + 类型守卫
- 所有颜色通过 CSS 变量引用，不硬编码
- 注释用中文，关键决策用 ★ 标记

## 当前方案摘要

### 启动顺序（关键）
```
1. config:getFeatureFlags → 写入 uiStore
2. 兜底 activeNav（指向关闭页面时回退 local）
3. restorePlayerState（playback=false 时内部 guard 跳过）
4. eqStore.loadFromDb()（equalizer=false 时跳过）
5. miniMode 兜底（miniMode=false 时强制退出）
```

### 默认值策略
- 代码内 DEFAULT_FLAGS 常量，全部 true
- `%APPDATA%/QinPlayer/feature-flags.json` 可选覆盖
- 缺失/损坏/解析失败 → 默认全 true
- JSON 合并时只接受已知 key + `typeof value === 'boolean'`

### 13 个 flag 关闭行为
详见 `docs/plans/PLAN-feature-flags.md` 第七节"各 flag 关闭行为细化"。

### 测试计划
详见 `docs/plans/PLAN-feature-flags.md` 第八节"测试计划"。

## 需要 Codex 做什么
1. 按方案实现全部 17 个文件改动
2. 新建 2 个测试文件 + 扩展 2 个现有测试文件
3. 确保 `npx tsc --noEmit` 无错误
4. 确保 `npm test` 全量通过（现有 72 用例 + 新增用例）
5. 返回变更摘要

## 已验证
- 方案已通过 Codex 审查（7 项硬边界修正已合并）
- 现有测试 72 用例全绿
- TypeScript 语法检查通过

## 需要特别注意
- **启动顺序不可调**：flags 必须先于 restorePlayerState 和 eqStore.loadFromDb()
- **playback 有 8 个入口点**：PlayerBar、SongList 双击/右键、MiniPlayer、托盘、Media Session、自动下一首、recordPlay，全部要 guard
- **tray=false 时 close handler 不拦截**：关闭 = 退出应用
- **equalizer 不是导航项**：跳过 eqStore 加载 + 隐藏 Settings EQ 区块
- **fadeEffect 测试在 useAudioSync**，不在 playerStore
- **主人偏好**：窗口固定大小不可拉伸、暗色底色 #121212、CSS 变量不硬编码
- **测试用例格式**：参考现有 `tests/formatTime.test.ts` 和 `tests/playerStore.test.ts`

## 返回格式
按工作流规范返回：
1. 结论（已完成/需要返工/需要主人确认）
2. 变更（改了哪些文件、改了什么行为）
3. 验证（运行了哪些命令、哪些通过）
4. 风险（仍需注意的问题）
5. 给衾衾的记录（devlog 建议、SPEC/DECISIONS 是否需要更新）
