# Codex 任务包：动画系统统一与交互覆盖

## 背景
- QinPlayer 纯本地音乐播放器，Electron + React + TypeScript
- 当前动画分散在各 CSS 文件中，timing 不统一，部分交互元素没有动画
- 需要建立统一的 motion token 系统，覆盖按钮按压、列表入场、页面切换、弹窗入退场，并支持手动减少动画

## 方案文件
`C:\Users\秋月\Desktop\QinPlayer\docs\plans\PLAN-animation-full-coverage.md` — **必须先完整读取**，本任务包只是摘要

## 约束
- 不新增 npm 依赖，不引入动画库
- 不改 package.json、tsconfig、CONSTRAINTS.md
- 不改音频淡入淡出逻辑
- 不把 reducedMotion 放入 playerStore（放 uiStore）
- 不使用 `will-change`
- 动画只用 opacity、独立 `scale`、独立 `translate`，不用 `transform` 做装饰动画
- 虚拟列表行的 inline `transform: translateY()` 定位不得被动画覆盖
- 注释用中文
- 不要自动 git commit

## 执行顺序

严格按方案 Task 0 → 1 → 2 → 3 → 4 → 5 → 6 顺序执行。每个 Task 完成后单独验证。

### Task 0：基线与 dirty worktree 隔离
- `git status --short` 确认工作区（上一功能已提交）
- `npm run verify` 记录基线
- `rg` 扫描现有动画清单

### Task 1：Motion token + helper + CSS 降级
- `themes.css` 加 `:root` motion token
- 新建 `src/styles/motion.css`（手动+系统 reduced motion 覆盖）
- `global.css` 最后导入 motion.css
- 新建 `src/utils/motionPreference.ts`
- 新建 `tests/motionPreference.test.ts`

### Task 2：UI 状态 + 启动水合 + 设置开关
- `uiStore.ts` 加 `reducedMotion` + `setReducedMotion`
- 新建 `src/hooks/useReducedMotion.ts`
- `App.tsx` 启动读取 reducedMotion 设置
- `Settings.tsx` 加"减少动画"开关
- 4 个测试文件

### Task 3：按钮 press 归一
- `base.css` 加全局 button scale 基线（用独立 `scale` 属性）
- 迁移所有现有 `:active { transform: scale(...) }` 为 `scale`
- 逐文件审计 transition cascade，确保 scale transition 不被覆盖
- 回归测试

### Task 4：页面/列表/卡片/菜单/迷你视图入场
- `Content.tsx` 删 fadeKey effect，用稳定导航 key
- `SongList.tsx` stagger 改用 TypeScript 常量 `ROW_ENTER_STAGGER_MS = 28`
- 各 CSS 文件加入场动画（用独立 translate + opacity）
- `LyricsPanel.tsx` 改用 `isReducedMotionActive()`
- Content 歌词退出 reduced 时立即完成

### Task 5：Dialog + Queue Panel 退场
- 新建 `src/hooks/useExitTransition.ts`
- `CreatePlaylistDialog.tsx` + `SongInfoDialog.tsx` 接入退出协议
- `PlaylistPanel.tsx` 接入退出协议
- `Playlists.tsx` 创建回调不再提前卸载 dialog
- 退出动画测试

### Task 6：全量回归 + 视觉验证
- `npm run verify` 全绿
- 静态复核动画清单
- 更新 SPEC.md + DECISIONS.md + devlog

## 验证命令
```bash
# 单元测试
npx vitest run

# 完整验证（harness + build + test）
npm run verify

# 动画清单扫描
rg -n "@keyframes|animation:|transition:|transform:|:active" src/styles src/components/Equalizer.css
```

## 需要特别注意
1. **虚拟列表 transform 冲突** — SongList 行用 inline `transform` 定位，动画必须用独立 `translate` 属性
2. **按钮 scale 不覆盖 transform** — 用 CSS 独立 `scale` 属性，和现有 `transform`（如播放 pulse）组合
3. **JS/CSS 同步** — `isReducedMotionActive()` 必须同时检查 data 属性和系统 media query
4. **退出幂等** — `useExitTransition` 的 `requestExit()` 只完成一次，防重复
5. **CreatePlaylistDialog** — confirm 改 Promise，submitting guard 防重复创建
6. **Content fadeKey** — 删掉只用于递增 key 的 effect，改用稳定导航 key
7. **transition cascade** — 组件 CSS 的 `transition:` shorthand 会覆盖全局 scale transition，必须逐文件审计补上
8. **现有 @media prefers-reduced-motion 保留** — 不删除，全局 motion.css 是额外覆盖层

## 返回格式
同标准任务包格式：结论、变更、验证、风险、需要主人确认
