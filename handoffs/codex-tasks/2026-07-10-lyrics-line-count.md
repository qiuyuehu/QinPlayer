# Codex 任务包：歌词行数修正（单语6行、双语3行）

## 背景
- 执行 `lyricsMoreLines` flag 后，单语和双语歌词都变成 6 行
- 主人只想让单语变 6 行，双语保持 3 行
- 方案已经过 2 轮审查，文档状态已就绪

## 目标
- 修改 `LyricsPanel.tsx`，有翻译行时忽略 `moreLines`，始终用 3 行显示
- 新建 `tests/LyricsPanel.test.tsx`，覆盖单语/双语/混合/空歌词场景

## 非目标
- 不新增 feature flag
- 不修改 `ipc.ts`、`featureFlags.ts`、`setup.ts`

## 相关文件
- `SPEC.md`（已更新歌词显示规则和 flag 数量）
- `harness/CONSTRAINTS.md`
- `harness/TEST_CONVENTIONS.md`
- `docs/plans/PLAN-lyrics-line-count.md`（已确认方案）
- `src/components/LyricsPanel.tsx`（待修改）
- `tests/LyricsPanel.test.tsx`（待新建）

## 约束
- 不引入新依赖
- 不修改 `package.json`、`tsconfig.json`
- 不删除现有测试用例
- 遵守 harness 约束（中文注释、禁止 any、测试独立）

## 当前方案

### Task 1: LyricsPanel 区分单语/双语行数

`src/components/LyricsPanel.tsx` 第 71、86 行改为：

```typescript
const moreLines = featureFlags?.lyricsMoreLines !== false

// 检测是否有翻译行（只需检测一次，用 some 而非 every）
const hasTranslation = lyrics.some(line => Boolean(line.translation))

// 有翻译行时忽略 moreLines，始终用 3 行（distance 0~2）
// 无翻译行时由 moreLines 控制：true → 6行（distance -1~4），false → 3行（distance 0~2）
const showMoreLines = moreLines && !hasTranslation
const focusStart = showMoreLines ? -1 : 0
const focusEnd = showMoreLines ? 4 : 2

const isInFocusRange = index >= 0 && distance >= focusStart && distance <= focusEnd
```

### Task 2: 组件测试

新建 `tests/LyricsPanel.test.tsx`，测试用例：

1. 单语歌词 + `lyricsMoreLines=true` → 可见行数 = 6（distance -1~4）
2. 单语歌词 + `lyricsMoreLines=false` → 可见行数 = 3（distance 0~2）
3. 双语歌词 + `lyricsMoreLines=true` → 可见行数 = 3（distance 0~2，忽略 moreLines）
4. 双语歌词 + `lyricsMoreLines=false` → 可见行数 = 3（distance 0~2）
5. 混合歌词（部分行有 translation）→ 可见行数 = 3（按双语处理）
6. 空歌词 → 渲染空面板（`.lyrics-panel--empty`）

测试数据要求：
- 至少 10 行歌词，`currentIndex` 取中间位置（如第 5 行），避开首尾边界
- 双语歌词：每行都有 `translation` 字段
- 单语歌词：无 `translation` 字段
- 混合歌词：只有部分行有 `translation`

断言方式：
```typescript
const visibleLines = container.querySelectorAll('.lyrics-panel__line')
const visibleCount = Array.from(visibleLines).filter(el => {
  const opacity = parseFloat(window.getComputedStyle(el).opacity)
  return opacity > 0
}).length
```

scrollTo mock（JSDOM 中不存在，需用 `Object.defineProperty`）：
```typescript
const originalScrollTo = HTMLElement.prototype.scrollTo
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    value: vi.fn(),
    writable: true,
  })
})
afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    value: originalScrollTo,
    writable: true,
  })
})
```

## 已验证
- 方案已通过 Claude Code 自审 + Codex 二审
- SPEC.md 已更新（歌词规则、flag 数量）
- devlog-20260709.md 已标为"待实现"

## 验收标准
1. `npm run build` 无报错
2. `npm test` 全部通过（含新增 6 个测试用例）
3. 单语歌词：`lyricsMoreLines: true` 时显示 6 行
4. 单语歌词：`lyricsMoreLines: false` 时显示 3 行
5. 双语歌词：无论 `lyricsMoreLines` 开关，始终显示 3 行
6. 混合歌词：按双语处理，显示 3 行

## 需要 Codex 做什么
1. 按方案修改 `LyricsPanel.tsx`
2. 新建 `tests/LyricsPanel.test.tsx`，实现 6 个测试用例
3. 运行 `npm run build` + `npm test` 验证
4. 返回变更摘要和验证结果

## 返回格式
- 结论：已完成 / 需要返工
- 变更：改了哪些文件、改了什么行为
- 验证：运行了哪些命令、哪些通过、哪些失败
- 风险：仍需注意的问题
- 需要主人确认：UI/体验取舍
- 给 Claude Code 的记录：devlog 建议、SPEC/DECISIONS 是否需要更新
