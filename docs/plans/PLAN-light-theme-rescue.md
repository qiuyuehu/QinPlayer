# QinPlayer 浅色主题补救方案：暖灰唱片播放器风格（v2）

> 创建：2026-07-03
> 修订：2026-07-03（Codex 审查后修正）
> 基于：Mentor 审美方向指导
> 状态：待确认

---

## 问题

当前浅色主题太像 SaaS/后台管理界面：蓝白配色、纯白背景、蓝色选中态、蓝色 accent。缺乏音乐播放器的质感。

## 设计方向

暖灰纸面 + 琥珀点缀，低对比但清晰的文字层级。像实体播放器，不像网页后台。

---

## 改动范围

### 本轮统一品牌强调色

浅色和暗色主题的 `--accent` / `--accent-hover` / `--accent-subtle` 都改为琥珀系。除 accent 相关变量外，不调整暗色主题背景、文字、边框层级。

### Hardcoded Color Audit

审计发现以下问题需要处理：

**1. 透明白 hover（主界面 5 处，歌词/迷你模式暂不纳入）** — 浅色主题下会变成黑色/灰色斑点

| 文件 | 行号 | 现有代码 | 问题 |
|------|------|----------|------|
| sidebar.css | 63 | `rgba(255,255,255,0.06)` | 浅色下不可见 |
| titlebar.css | 50 | `rgba(255,255,255,0.1)` | 浅色下不可见 |
| titlebar.css | 54 | `rgba(255,255,255,0.05)` | 浅色下不可见 |
| playerbar.css | 100 | `rgba(255,255,255,0.08)` | 浅色下不可见 |
| playerbar.css | 164 | `rgba(255,255,255,0.12)` | 浅色下不可见 |

**处理方案**：sidebar、titlebar、playerbar 的透明白 hover 改用 `var(--control-hover)` 变量。

**2. accent 满底 hover** — 琥珀色做大面积背景会像警告色

| 文件 | 用途 | 处理 |
|------|------|------|
| contextmenu.css:28 | `.context-menu__item:hover` | 改用 `var(--control-hover)`，箭头颜色同步改 |
| contextmenu.css:58 | `.context-menu__item:hover .context-menu__arrow` | `color: #fff` 改 `color: var(--text-primary)` |
| playlist-panel.css:192 | `.queue-panel__clear:hover` | 改用 `var(--control-hover)`，color 改 `var(--text-primary)` |
| playlist-panel.css:209 | `.queue-panel__back:hover` | 改用 `var(--control-hover)`，color 改 `var(--text-primary)` |
| playlists.css:37-38 | `.playlists__back-btn:hover` / `.playlists__create-btn:hover` | 改用 `var(--control-hover)`，color 改 `var(--text-primary)` |
| playlists.css:172 | `.playlists__sort-btn:hover` | 改用 `var(--control-hover)`，color 改 `var(--text-primary)` |
| albums.css:47 | `.albums__back-btn:hover` | 改用 `var(--control-hover)`，color 改 `var(--text-primary)` |
| localmusic.css | 按钮 hover | 保留 accent（按钮小面积） |
| dialog.css | 弹窗按钮 | 保留 accent（按钮小面积） |
| playerbar.css | 进度条/音量条 | 保留 accent（细条） |
| lyrics.css | 歌词页面 | 保留 accent（歌词专用） |
| miniplayer.css | 迷你模式 | 保留 accent（迷你模式专用） |

---

## 技术方案

### 1. 新增控制态变量

**改动文件**：`src/styles/themes.css`

```css
/* 暗色主题 */
[data-theme="dark"] {
  /* 现有变量保持不变，只改 accent */
  --accent: oklch(0.58 0.105 68);
  --accent-hover: oklch(0.52 0.115 68);
  --accent-subtle: oklch(0.25 0.035 72);
  
  /* 新增控制态变量（hover/active 用暖灰，不用 accent） */
  --control-hover: rgba(255, 255, 255, 0.06);
  --control-active: rgba(255, 255, 255, 0.1);
}

/* 亮色主题 */
[data-theme="light"] {
  /* 暖灰纸面背景 */
  --bg-primary: oklch(0.955 0.012 82);
  --bg-secondary: oklch(0.925 0.014 82);
  --bg-tertiary: oklch(0.885 0.014 82);
  --bg-card: oklch(0.985 0.006 82);

  /* 文字层级 */
  --text-primary: oklch(0.24 0.018 72);
  --text-secondary: oklch(0.48 0.014 72);
  --text-muted: oklch(0.64 0.012 72);

  /* 琥珀强调色 */
  --accent: oklch(0.58 0.105 68);
  --accent-hover: oklch(0.52 0.115 68);
  --accent-subtle: oklch(0.88 0.035 72);

  /* 边框 */
  --border: oklch(0.82 0.012 82);
  --border-subtle: oklch(0.89 0.008 82);

  /* 播放条/标题栏 */
  --player-bg: oklch(0.91 0.014 82);
  --titlebar-bg: oklch(0.945 0.01 82);

  /* 控制态变量（hover/active 用暖灰，不用 accent） */
  --control-hover: oklch(0.92 0.012 82);
  --control-active: oklch(0.90 0.014 82);
}
```

### 2. 处理透明白 hover

**改动文件**：`src/styles/sidebar.css`、`src/styles/titlebar.css`、`src/styles/playerbar.css`

```css
/* sidebar.css — 选中态背景 */
.sidebar__item--active {
  background-color: var(--control-active);
}

/* titlebar.css — 按钮 hover */
.title-bar__btn:hover {
  background-color: var(--control-hover);
}

/* playerbar.css — 按钮 hover */
.player-bar__btn:hover {
  background-color: var(--control-hover);
}
```

### 3. 处理 accent 满底 hover

**改动文件**：`src/styles/contextmenu.css`、`src/styles/playlist-panel.css`、`src/styles/playlists.css`、`src/styles/albums.css`

```css
/* 右键菜单 hover */
.context-menu__item:hover {
  background-color: var(--control-hover);
}

/* 右键菜单 hover 时箭头颜色也要改 */
.context-menu__item:hover .context-menu__arrow {
  color: var(--text-primary);
}

/* 播放队列按钮 hover */
.queue-panel__clear:hover,
.queue-panel__back:hover {
  background-color: var(--control-hover);
  color: var(--text-primary);
}

/* 歌单按钮 hover */
.playlists__back-btn:hover,
.playlists__create-btn:hover,
.playlists__sort-btn:hover {
  background-color: var(--control-hover);
  color: var(--text-primary);
}

/* 专辑返回按钮 hover */
.albums__back-btn:hover {
  background-color: var(--control-hover);
  color: var(--text-primary);
}
```

### 4. 歌曲列表 hover 和 active 区分

**改动文件**：`src/styles/songlist.css`

```css
/* hover：用暖灰，不用 accent */
.song-list__row:hover {
  background-color: var(--control-hover);
}

/* 当前播放行：用极淡琥珀 */
.song-list__row--active {
  background-color: var(--accent-subtle);
}

/* 当前播放行歌名加深 */
.song-list__row--active .song-list__col--title {
  color: var(--text-primary);
  font-weight: 600;
}

/* 当前播放行封面加细描边 */
.song-list__row--active .song-list__cover-img {
  outline: 1px solid var(--accent);
  outline-offset: -1px;
}
```

### 5. 底部播放器播放按钮

**改动文件**：`src/styles/playerbar.css`

```css
/* 播放按钮：深炭色圆形 */
.player-bar__play-btn {
  background: oklch(0.26 0.014 72);
  color: oklch(0.96 0.008 82);
}

.player-bar__play-btn:hover {
  background: oklch(0.22 0.014 72);
}
```

### 6. 主内容背景层次

**改动文件**：`src/styles/content.css`

```css
.content {
  background-color: var(--bg-card);
}
```

### 7. 队列面板、弹窗、菜单统一

**改动文件**：`src/styles/playlist-panel.css`、`src/styles/dialog.css`、`src/styles/contextmenu.css`

```css
/* 队列面板背景 */
.queue-panel {
  background-color: var(--bg-secondary);
}

/* 弹窗背景 */
.dialog {
  background-color: var(--bg-card);
}

/* 右键菜单背景 */
.context-menu {
  background-color: var(--bg-card);
  border: 1px solid var(--border);
}
```

---

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/styles/themes.css` | 替换 accent 变量，新增 --control-hover / --control-active |
| `src/styles/sidebar.css` | 选中态用 --control-active |
| `src/styles/titlebar.css` | 按钮 hover 用 --control-hover |
| `src/styles/playerbar.css` | 按钮 hover 用 --control-hover，播放按钮改深炭色 |
| `src/styles/songlist.css` | hover 用 --control-hover，active 用 --accent-subtle |
| `src/styles/contextmenu.css` | hover 用 --control-hover |
| `src/styles/playlist-panel.css` | hover 用 --control-hover，面板背景用 --bg-secondary |
| `src/styles/playlists.css` | hover 用 --control-hover |
| `src/styles/albums.css` | hover 用 --control-hover |
| `src/styles/content.css` | 内容区用 --bg-card |
| `src/styles/dialog.css` | 弹窗背景用 --bg-card |

**不改动**：
- 歌词页面（lyrics.css，歌词专用样式）
- 迷你模式（miniplayer.css，迷你模式专用）
- 组件逻辑
- 布局结构

---

## 验证方法

1. `npx tsc --noEmit` — 语法检查
2. `npm test` — 全量测试通过
3. `npm run dev` — 切换到浅色主题确认：
   - 没有蓝色按钮/蓝色选中行
   - 浅色主题不刺眼，不是纯白黑字
   - hover 用暖灰，不用蓝色/琥珀满底
   - 当前播放行能看出来（极淡琥珀+歌名加粗+封面描边）
   - 底部播放器像音乐控制台（深炭色按钮）
   - 第一眼不像 SaaS 后台
   - 队列面板、右键菜单、弹窗背景统一

---

*方案就绪，等主人确认后执行。*
