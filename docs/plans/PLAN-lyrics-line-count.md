# 歌词行数修正方案（单语6行、双语3行）

> 创建：2026-07-09
> 修订：2026-07-10（Codex 审核后重写）
> 状态：待确认

---

## 前置条件

- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`
- 代码规范：TypeScript，中文注释
- 测试运行：`npm test`
- 构建检查：`npm run build`

---

## 问题

执行 `lyricsMoreLines` flag 后，单语和双语歌词都变成 6 行。主人只想让单语变 6 行，双语保持 3 行。

## 根因

`LyricsPanel.tsx` 第 71-86 行用 `moreLines` 统一控制所有歌词行数，没区分单语/双语：
```typescript
const moreLines = featureFlags?.lyricsMoreLines !== false
// ...
const isInFocusRange = index >= 0 && distance >= (moreLines ? -1 : 0) && distance <= (moreLines ? 4 : 2)
```

## 方案

不新增 flag。只在 `LyricsPanel` 中检测歌词类型：有翻译行时忽略 `moreLines`，始终用 3 行显示。改动最小，行为清晰。

---

## 改动范围

| 文件 | 改动 |
|------|------|
| `src/components/LyricsPanel.tsx` | 行数计算逻辑区分单语/双语 |
| `tests/LyricsPanel.test.tsx` | 新建，测试单语/双语行数逻辑 |

无需修改 `ipc.ts`、`featureFlags.ts`、`tests/setup.ts`、`tests/featureFlags.test.ts`。

---

## Task 1: LyricsPanel 区分单语/双语行数

**目标：** 有翻译行时，忽略 `moreLines`，始终用 3 行显示

**文件：**
- 修改：`src/components/LyricsPanel.tsx`

**实现要点：**

当前代码（第 71、86 行）：
```typescript
const moreLines = featureFlags?.lyricsMoreLines !== false
// ...
const isInFocusRange = index >= 0 && distance >= (moreLines ? -1 : 0) && distance <= (moreLines ? 4 : 2)
```

改为：
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

**⚠️ 注意：**
- `hasTranslation` 用 `some()` 检测，只要有任意一行有翻译就判定为双语
- opacity 计算不需要改（基于 `Math.abs(distance)` 已经自适应）
- 歌词为空时 `hasTranslation` 为 false，走单语分支，由第 65-69 行提前返回空面板
- 不新增 feature flag，不改动类型定义

**完成标准：**
- [ ] `npm run build` 无报错
- [ ] `npm test` 通过

---

## Task 2: 组件测试

**目标：** 新建 LyricsPanel 测试，覆盖单语/双语行数逻辑

**文件：**
- 新建：`tests/LyricsPanel.test.tsx`

**测试数据要求：**
- 至少 10 行歌词，`currentIndex` 取中间位置（如第 5 行），避开首尾边界
- 双语歌词：每行都有 `translation` 字段
- 单语歌词：无 `translation` 字段
- 混合歌词：只有部分行有 `translation`，仍按双语处理

**断言方式：**

LyricsPanel 把所有歌词行渲染进 DOM，通过 `opacity: 0` 和 `pointer-events: none` 隐藏。不能靠 DOM 数量判断。

```typescript
// 统计可见行：opacity !== 0 的行
const visibleLines = container.querySelectorAll('.lyrics-panel__line')
const visibleCount = Array.from(visibleLines).filter(el => {
  const opacity = parseFloat(window.getComputedStyle(el).opacity)
  return opacity > 0
}).length
```

**测试用例：**

1. 单语歌词 + `lyricsMoreLines=true` → 可见行数 = 6（distance -1~4）
2. 单语歌词 + `lyricsMoreLines=false` → 可见行数 = 3（distance 0~2）
3. 双语歌词 + `lyricsMoreLines=true` → 可见行数 = 3（distance 0~2，忽略 moreLines）
4. 双语歌词 + `lyricsMoreLines=false` → 可见行数 = 3（distance 0~2）
5. 混合歌词（部分行有 translation）→ 可见行数 = 3（按双语处理）
6. 空歌词 → 渲染空面板（`.lyrics-panel--empty`）

**mock 要求：**
- `HTMLElement.prototype.scrollTo` — JSDOM 中不存在，需用 `Object.defineProperty` 定义，`afterAll` 恢复：
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
- `featureFlags` — 用 `DEFAULT_FEATURE_FLAGS` 作为基础再 override

**完成标准：**
- [ ] `npm test` 全部通过

---

## 验收标准

1. `npm run build` 无报错
2. `npm test` 全部通过
3. 单语歌词（无翻译行）：`lyricsMoreLines: true` 时显示 6 行
4. 单语歌词：`lyricsMoreLines: false` 时显示 3 行
5. 双语歌词（有翻译行）：无论 `lyricsMoreLines` 开关，始终显示 3 行
6. 混合歌词（部分行有翻译）：按双语处理，显示 3 行

## 手动测试（主人执行）

1. `npm run dev` 启动
2. 播放一首单语歌词的歌曲 → 验证显示约 6 行
3. 播放一首双语歌词的歌曲 → 验证显示约 3 行
4. 在 `feature-flags.json` 中设置 `"lyricsMoreLines": false`
5. 重启 app，播放单语歌曲 → 验证只显示约 3 行
6. 播放双语歌曲 → 验证仍显示约 3 行
7. 恢复 `"lyricsMoreLines": true`
