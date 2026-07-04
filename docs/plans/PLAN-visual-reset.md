# QinPlayer 视觉重设方案：私人唱片库 / 桌面音频控制台


> 基于：Mentor 视觉重设方向 + Claude 自审补强
> 状态：待确认

---

## 目标

做一个 1000×680 的静态 HTML 视觉样张（preview），复刻当前回滚后的最近播放界面，在不改组件结构和信息架构、不加封面、不改功能的前提下，探索"私人唱片库 / 桌面音频控制台"的深浅双主题视觉语言。允许在 preview 中探索内容区 padding、列表边界、行分隔方式。

**确认前不允许改正式源码。**

## 非目标

- 不改组件逻辑
- 不加列表封面（v1 不加，封面另开 v2 方案）
- 不做响应式、不做营销页、不做大 hero
- 不碰歌词、迷你模式、均衡器复杂页
- 不引入新字体（v1 先沿用系统字体，只调字重、字号、颜色）

---

## 设计参数

| 参数 | 值 | 说明 |
|------|-----|------|
| DESIGN_VARIANCE | 4 | 不要艺术站，不要 SaaS，保持桌面播放器稳定感 |
| MOTION_INTENSITY | 2 | 只保留 hover、active、列表淡入，不做炫技动画 |
| VISUAL_DENSITY | 7 | 播放器是工具，不做大卡片和空旷 landing page |

---

## 核心审美

- 保留左右分栏、表格列表、底部播放器
- 浅色主题不做纯白，改成"暖灰设备外壳 + 石墨播放按钮"。
- 深色主题不做纯黑，改成"炭黑 + 暖灰线条"
- 统一低饱和琥珀/黄铜 accent，只用于播放进度、当前播放、焦点、主操作
- 不做蓝色、不做渐变大背景、不做玻璃拟态、不做卡片堆叠

---

## 完整变量表

### 浅色主题

```css
[data-theme="light"] {
  /* 背景层级 */
  --bg-primary: #f3f1ec;          /* 主背景：暖灰纸面 */
  --bg-secondary: #e9e6df;        /* 侧栏/底栏：设备外壳感 */
  --bg-tertiary: #ddd8cf;         /* 输入框、弱悬浮 */
  --bg-card: #fbfaf7;             /* 内容面：略亮但不纯白 */

  /* 文字层级 */
  --text-primary: #2b2925;        /* 主文字：不用纯黑 */
  --text-secondary: #716d66;      /* 次级文字 */
  --text-muted: #9b948a;          /* 弱文字 */

  /* 强调色：黄铜系 */
  --accent: #a86f2a;              /* 主 accent：偏黄铜，不是橙色警告 */
  --accent-hover: #9b6a2f;        /* hover 态 */
  --accent-subtle: rgba(168, 111, 42, 0.1);  /* 极淡背景 */

  /* 控制态（hover/active 用暖灰，不用 accent） */
  --control-hover: #e5e0d6;
  --control-active: #dbd5ca;

  /* 边框 */
  --border: #d4cec3;              /* 比现在更可见 */
  --border-subtle: #e0dbd2;

  /* 播放条/标题栏 */
  --player-bg: #e2ddd5;           /* 比内容区深一点 */
  --titlebar-bg: #e9e6df;

  /* 进度条 */
  --progress-track: #c8c2b6;      /* 轨道：低对比灰 */
  --progress-fill: #a86f2a;       /* 填充：黄铜色 */

  /* 播放按钮 */
  --player-btn-bg: #3d3a35;       /* 深石墨圆形 */
  --player-btn-color: #f3f1ec;

  /* 输入框 */
  --input-bg: #eae6de;
  --input-border: #d4cec3;

  /* 滚动条 */
  --scrollbar-thumb: #c8c2b6;
  --scrollbar-track: transparent;

  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08);

  /* 焦点环 */
  --focus-ring: 0 0 0 2px rgba(168, 111, 42, 0.3);
}
```

### 暗色主题

```css
[data-theme="dark"] {
  /* 背景层级 */
  --bg-primary: #141312;          /* 炭黑 */
  --bg-secondary: #1f1d1a;        /* 侧栏/底栏 */
  --bg-tertiary: #2a2723;         /* 输入框、弱悬浮 */
  --bg-card: #191817;             /* 内容面 */

  /* 文字层级 */
  --text-primary: #ded8ce;
  --text-secondary: #9b948a;
  --text-muted: #6b6560;

  /* 强调色：黄铜系（暗色下略亮） */
  --accent: #c0914f;
  --accent-hover: #b08345;
  --accent-subtle: rgba(192, 145, 79, 0.1);

  /* 控制态 */
  --control-hover: #2a2723;
  --control-active: #33302b;

  /* 边框 */
  --border: #2f2b26;
  --border-subtle: #252220;

  /* 播放条/标题栏 */
  --player-bg: #1f1d1a;
  --titlebar-bg: #1f1d1a;

  /* 进度条 */
  --progress-track: #2f2b26;
  --progress-fill: #c0914f;

  /* 播放按钮 */
  --player-btn-bg: #ded8ce;
  --player-btn-color: #141312;

  /* 输入框 */
  --input-bg: #2a2723;
  --input-border: #3a3630;

  /* 滚动条 */
  --scrollbar-thumb: #3a3630;
  --scrollbar-track: transparent;

  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.3);

  /* 焦点环 */
  --focus-ring: 0 0 0 2px rgba(192, 145, 79, 0.3);
}
```

---

## Preview 规格

### 产物

只允许新增一个文件：`design-preview/qinplayer-console-v1.html`

**不允许修改 src/。**

### 画布

- 固定 1000×680
- 不做响应式

### 内容

复刻当前回滚后的界面，包含两种列表状态：

**状态 A：无专辑列列表（最近播放样式）**
- 标题栏（QinPlayer + 窗口控制按钮）
- 侧栏（搜索框 + 导航项：最近播放、本地音乐、专辑、歌单、我喜欢的、设置）
- 主内容区（"最近播放"标题 + 歌曲列表表格：序号、歌名、歌手、时长）
- 底部播放器（封面、歌名/歌手、播放控制、进度条、音量、功能按钮）

**状态 B：有专辑列列表（搜索结果样式）**
- 复刻搜索结果页：标题区包含"搜索" + 搜索词 + 结果数量
- 歌曲列表表格增加专辑列：序号、歌名、歌手、专辑、时长
- 用于验证列宽和拥挤问题

**Preview 必须覆盖 4 种组合**（用切换按钮）：
- 浅色 + 状态 A（无专辑列）
- 浅色 + 状态 B（有专辑列）
- 暗色 + 状态 A（无专辑列）
- 暗色 + 状态 B（有专辑列）
### 主题

包含浅色/暗色两个状态，用 HTML 内切换按钮（不并排，避免挤压布局）。截图可以分别提交浅色/暗色两张。

### 字体

沿用系统字体：`-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`

只调字重、字号、颜色，不引入新字体。

---

### 已确认问题记录

以下设计决策已通过主人确认：

1. **范围**：所有 SongList 页面统一调整（最近播放、本地音乐、我喜欢的、搜索、专辑详情、歌单详情）
2. **风格**：无边框全出血列表
3. **底部空白**：接受自然留白（歌曲少时列表不延伸到底部）
4. **左右边距**：接近 0（具体值在 preview 中比较后确认）

---

## 列表设计（不加封面）

### 布局风格

- **范围**：所有 SongList 页面统一调整（最近播放、本地音乐、我喜欢的、搜索、专辑详情、歌单详情）
- **风格**：无边框全出血列表
- **边框**：去掉 `border` 和 `border-radius`，列表填满内容区宽度
- **左右边距**：接近 0（具体值在 preview 中比较 8px / 12px / 16px 后确认）
- **底部空白**：接受自然留白（歌曲少时列表不延伸到底部）

**失败判定**：如果无边框全出血让界面像文件管理器/后台表格，则保留极淡外框或只保留顶部/底部分隔线。

### 表头

- 小字号（11px）
- 无大写英文感
- 底线清晰但不重
- 文字用 --text-muted

### 行

- 行高 44px（不膨胀）
- hover 用 --control-hover（暖灰）
- 当前播放行：
  - 左侧音符图标（♫）
  - 歌名用 --accent（黄铜色）
  - 极淡背景 --accent-subtle
  - 不整条高亮

### 分割线

- 用 --border-subtle
- 不要太重

---

## 侧栏设计

### 搜索框

- 背景比侧栏略深/浅一层（--bg-tertiary）
- 边框用 --border
- focus 时用 --accent 边框

### 导航项

- 默认：图标用 --text-secondary，文字用 --text-primary
- 选中：左侧 3px 黄铜竖线 + 微弱背景 --control-active
- 不要圆角大胶囊按钮，保持桌面工具感

---

## 底部播放器设计

### 整体

- 比内容区"重"一点（--player-bg 比 --bg-primary 深）
- 上边框淡一点，不要像网页 footer

### 播放按钮

- 保持原本样式不改（42px、透明背景、text-primary 颜色）

### 进度条

- 轨道用 --progress-track（低对比灰）
- 填充用 --progress-fill（黄铜色）
- hover 时轨道容器高度固定（不改容器高度避免抖动），内部 fill 或伪元素增粗

### 封面

- 保留现有封面
- 封面周围加 1px 内描边（--border）
- 不加大阴影

### 右侧按钮

- hover 用 --control-hover（普通控制态）
- 不要 accent 满底

---

## 失败判定标准

以下效果一出现就算失败：
- 看起来像后台管理系统
- 大面积白底
- 大面积 accent 填充
- 卡片化过重
- 底栏像网页 footer
- 当前播放状态抢过歌曲内容

---

## 交付要求

Hermes 必须同时提交：
1. preview HTML 路径（仓库内只新增 `design-preview/qinplayer-console-v1.html`）
2. 浅色 A/B 截图（浅色+无专辑列、浅色+有专辑列，作为对话附件提交，不落库）
3. 暗色 A/B 截图（暗色+无专辑列、暗色+有专辑列，作为对话附件提交，不落库）
4. 设计变量表（preview HTML 内必须保留同名 CSS 变量，不写散色值）
5. padding 推荐值（必须说明 8/12/16 中推荐哪个，以及为什么）
6. preview → 正式 CSS 映射草案

---

## 执行流程

1. **先做 preview**：`design-preview/qinplayer-console-v1.html`
2. **主人看 preview**，确认方向
3. **确认后再映射到正式 CSS**：建映射表（preview 变量 → 正式文件）
4. **第一轮只改主界面**：themes.css / sidebar.css / songlist.css / playerbar.css / content.css / titlebar.css / base.css（滚动条变量）
5. **截图对比**浅色/暗色主界面
6. **后续再扩展**：队列面板、设置、歌单网格、专辑网格、弹窗（歌单详情/专辑详情里的 SongList 已在第一轮覆盖）

---

## 硬约束

- 禁止新增 landing page 风格元素
- 禁止大渐变、发光、玻璃、紫蓝、纯白纯黑
- 禁止把 accent 用作大面积按钮 hover
- 禁止无 preview 直接改源码
- 禁止 preview 和实现不一致
- 保留当前布局，不重构组件
- 每个 CSS 选择器必须先核对真实类名
- 完成后必须截图对比浅色/暗色主界面
- 正式改 CSS 前必须做 hardcoded color sweep：`rg "rgba\\(255|rgba\\(160|#ffffff|#fff|#121212|#1a1a1a"` 扫一遍，避免旧暗色写法残留到浅色

---

*方案就绪，等主人确认后执行。*
