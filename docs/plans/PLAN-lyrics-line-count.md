# 歌词行数修正方案（单语6行、双语3行）

> 创建：2026-07-09
> 状态：待确认

---

## 前置条件

- 项目路径：`C:\Users\秋月\Desktop\QinPlayer`
- WSL 路径：`/mnt/c/Users/秋月/Desktop/QinPlayer`
- 代码规范：TypeScript，中文注释
- 测试运行：`npm test`
- 开工前必读：`src/types/ipc.ts`（确认当前 FeatureFlagKey 末尾元素）

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

新增 `lyricsBilingualLines` flag，独立控制双语歌词行数。`lyricsMoreLines` 只控制单语。用 `lyrics.some(line => !!line.translation)` 自动检测歌词类型。

---

## 改动范围

| 文件 | 改动 |
|------|------|
| `src/types/ipc.ts` | FeatureFlagKey + FeatureFlags 新增 `lyricsBilingualLines` |
| `src/utils/featureFlags.ts` | FEATURE_FLAG_KEYS + DEFAULT_FEATURE_FLAGS 新增字段 |
| `src/components/LyricsPanel.tsx` | 行数计算逻辑区分单语/双语 |
| `tests/featureFlags.test.ts` | 新增消融测试 |
| `tests/LyricsPanel.test.tsx` | 新建，测试单语/双语行数逻辑 |

---

## Task 1: 新增 lyricsBilingualLines feature flag

**目标：** 在类型和默认值中加入 `lyricsBilingualLines` flag

**文件：**
- 修改：`src/types/ipc.ts`
- 修改：`src/utils/featureFlags.ts`

**实现要点：**

⚠️ **不要照抄方案里的上下文行。打开当前源码，找到最后一个元素，在其后追加。**

`src/types/ipc.ts` — FeatureFlagKey 联合类型：找到当前最后一个 `|` 行，在其后追加：
```typescript
  | 'lyricsBilingualLines'
```

`src/types/ipc.ts` — FeatureFlags 接口：找到当前最后一个 `boolean` 字段，在其后追加：
```typescript
  lyricsBilingualLines: boolean
```

`src/utils/featureFlags.ts` — FEATURE_FLAG_KEYS 数组：找到当前最后一个元素，在其后追加：
```typescript
  'lyricsBilingualLines',
```

`src/utils/featureFlags.ts` — DEFAULT_FEATURE_FLAGS：找到当前最后一个字段，在其后追加：
```typescript
  lyricsBilingualLines: true,
```

**完成标准：**
- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm test` 通过

---

## Task 2: LyricsPanel 区分单语/双语行数

**目标：** 根据歌词是否有翻译行，分别使用不同的行数控制

**文件：**
- 修改：`src/components/LyricsPanel.tsx`

**实现要点：**

当前代码（第 71-86 行）：
```typescript
const moreLines = featureFlags?.lyricsMoreLines !== false
// ...
const isInFocusRange = index >= 0 && distance >= (moreLines ? -1 : 0) && distance <= (moreLines ? 4 : 2)
```

改为：
```typescript
const moreLines = featureFlags?.lyricsMoreLines !== false
const bilingualMoreLines = featureFlags?.lyricsBilingualLines !== false

// 检测是否有翻译行（只需检测一次，用 some 而非 every）
const hasTranslation = lyrics.some(line => !!line.translation)

// 根据单语/双语选择行数参数
// 单语：moreLines=true → 6行(distance -1~4)，false → 3行(distance 0~2)
// 双语：bilingualMoreLines=true → 3行(distance 0~2)，false → 2行(distance 0~1)
const focusStart = hasTranslation ? 0 : (moreLines ? -1 : 0)
const focusEnd = hasTranslation ? (bilingualMoreLines ? 2 : 1) : (moreLines ? 4 : 2)

const isInFocusRange = index >= 0 && distance >= focusStart && distance <= focusEnd
```

**⚠️ 注意：**
- `hasTranslation` 用 `some()` 检测，只要有任意一行有翻译就判定为双语
- opacity 计算不需要改（基于 `Math.abs(distance)` 已经自适应）
- `bilingualMoreLines` 默认 true，双语歌词默认 3 行，和改动前一致
- `bilingualMoreLines: false` 时双语歌词只显示 2 行（当前行 + 下一行）

**完成标准：**
- [ ] `npx tsc --noEmit` 无报错
- [ ] `npm test` 通过

---

## Task 3: 测试

**目标：** 新增 lyricsBilingualLines 消融测试 + LyricsPanel 组件测试

**文件：**
- 修改：`tests/featureFlags.test.ts`
- 新建：`tests/LyricsPanel.test.tsx`

**featureFlags.test.ts 测试用例：**
1. DEFAULT_FEATURE_FLAGS 包含 `lyricsBilingualLines: true`
2. FEATURE_FLAG_KEYS 包含 `'lyricsBilingualLines'`
3. 消融验证：关闭 lyricsBilingualLines 不影响其他 flag 默认值

**LyricsPanel.test.tsx 测试用例：**

mock 构造方式：用 `DEFAULT_FEATURE_FLAGS` 作为基础再 override
```typescript
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
const flags = { ...DEFAULT_FEATURE_FLAGS, lyricsMoreLines: true }
```

1. 单语歌词（无 translation）+ lyricsMoreLines=true → 渲染约 6 个可见行
2. 单语歌词 + lyricsMoreLines=false → 渲染约 3 个可见行
3. 双语歌词（有 translation）+ lyricsBilingualLines=true → 渲染约 3 个可见行
4. 双语歌词 + lyricsBilingualLines=false → 渲染约 2 个可见行
5. 空歌词 → 渲染空面板

**完成标准：**
- [ ] `npm test` 全部通过

---

## 验收标准

1. `npx tsc --noEmit` 无报错
2. `npm test` 全部通过
3. 单语歌词（无翻译行）：`lyricsMoreLines: true` 时显示约 6 行
4. 双语歌词（有翻译行）：`lyricsBilingualLines: true` 时显示约 3 行
5. `lyricsBilingualLines: false` 时双语歌词显示约 2 行
6. 两个 flag 互不影响，可以独立开关

## 手动测试（主人执行）

1. `npm run dev` 启动
2. 播放一首单语歌词的歌曲 → 验证显示约 6 行
3. 播放一首双语歌词的歌曲 → 验证显示约 3 行
4. 在 `feature-flags.json` 中设置 `"lyricsBilingualLines": false`
5. 重启 app，播放双语歌曲 → 验证只显示约 2 行
6. 恢复 `"lyricsBilingualLines": true`
