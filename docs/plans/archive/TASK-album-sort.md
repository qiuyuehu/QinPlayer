# Codex 任务包：专辑网格排序

## 背景
- QinPlayer 纯本地音乐播放器，Electron + React + TypeScript
- 当前专辑页面按歌曲数降序排列，没有排序控件
- 主人想要按专辑首字母和歌手名字首字母排序，默认按专辑首字母升序

## 目标
- 为专辑网格增加两种排序字段（专辑名/歌手名）和两个方向（升序/降序）
- 默认按专辑名本地化字母序升序
- 未知值始终排在末尾
- 排序只改变网格展示顺序，不影响专辑详情歌曲顺序

## 非目标
- 不改变"仅按专辑名分组"的规则
- 不引入 `albumArtist` 字段
- 不排序专辑详情中的歌曲
- 不保存排序状态（离开页面恢复默认）
- 不把排序下沉到 SQLite

## 相关文件
- `C:\Users\秋月\Desktop\QinPlayer\docs\plans\PLAN-album-sort.md` — 完整方案，必须先读
- `C:\Users\秋月\Desktop\QinPlayer\src\pages\Albums.tsx` — 专辑页面
- `C:\Users\秋月\Desktop\QinPlayer\src\styles\albums.css` — 专辑样式
- `C:\Users\秋月\Desktop\QinPlayer\src\types\index.ts` — Album 类型定义
- `C:\Users\秋月\Desktop\QinPlayer\src\components\Icons.tsx` — SVG 图标库

## 约束
- 不新增依赖、不新增 IPC、不改数据库查询
- 不新增 feature flag、不持久化排序偏好
- 不顺手重构专辑数据模型
- 代码加中文注释
- 不要自动 git commit

## 当前方案
方案文件 `docs/plans/PLAN-album-sort.md` 经 Codex 审查并重写，包含：
- 4 个 TDD 任务，按顺序执行
- 纯排序函数 `sortAlbums`（`Intl.Collator` + 未知项最后 + 次级排序）
- 受控排序菜单 `AlbumSortMenu`（`menuitemradio` 语义 + 键盘导航）
- 两层测试：纯函数单测 + 页面接线测试

## 需要 Codex 做什么
按方案逐 Task 实现：
1. Task 0：基线与工作区保护
2. Task 1：纯排序函数 + 测试
3. Task 2：页面接线 + 测试
4. Task 3：排序菜单组件 + 样式 + 测试
5. Task 4：SPEC 更新 + devlog + 最终验证

每个 Task 完成后单独跑 `npx vitest run` 相关测试。

## 已验证
- `npx tsc --noEmit` 当前通过
- `npm test`：19 文件 / 207 测试全绿
- `npm run build` 通过

## 需要特别注意
- **Intl.Collator**：模块级创建一次，不要在 comparator 内重复构造
- **未知项排序**：未知值始终最后，不受升降序影响
- **次级排序**：主字段相同时按次字段排序，结果稳定
- **useMemo**：用 `useMemo` 计算派生列表，不用 `useEffect`
- **菜单组件**：新建 `AlbumSortMenu`，不修改现有 `ContextMenu`
- **无障碍**：`menuitemradio` + `aria-checked` + 键盘导航

## 返回格式

```
## 结论
已完成 / 需要返工 / 需要主人确认

## 变更
- 改了哪些文件
- 改了什么行为

## 验证
- 每个 Task 的测试结果
- 最终 npm run verify 结果
- 哪些没跑，为什么

## 风险
- 仍需注意的问题

## 需要主人确认
- UI/体验/产品取舍
```
