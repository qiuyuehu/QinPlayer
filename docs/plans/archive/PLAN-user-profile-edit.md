# 方案：设置页新增个人信息编辑（名字+头像）

## 需求

在设置页新增"个人信息"区域，可编辑名字和自定义头像。「我的」页面只展示，不编辑。

## 现状

- **名字**：硬编码 `秋月`（MyProfile.tsx:122）
- **头像**：固定 `IconUser` 占位图标（MyProfile.tsx:119）
- **设置存储**：`settings` 表（key-value），通过 `settings:set` / `settings:get` IPC 读写
- **自定义协议**：`qinplayer://` 已注册（protocol.ts），支持 `qinplayer://audio?path=` 和 `qinplayer://cover?path=`，返回本地文件流
- **preload 白名单**：`electron/preload.ts` INVOKE_CHANNELS

## 数据方案

| 数据   | 存储位置              | 格式                                 |
|--------|----------------------|--------------------------------------|
| 名字   | settings 表 `userName` | 纯文本字符串，≤20 字符               |
| 头像   | settings 表 `avatarPath` | userData/avatar/avatar.{ext} 文件路径 |
| 头像显示 | renderer `<img src>` | `qinplayer://avatar?path=...`（复用现有协议） |

## 改动清单

### 1. 协议扩展（`electron/ipc/protocol.ts`）

在现有协议 handler 的 Content-Type 判断中新增 `avatar` host：

```ts
if (host === 'cover' || host === 'avatar') {
  // 封面图片 / 头像图片（逻辑相同）
  ...
}
```

改动量：改一个条件判断，从 `host === 'cover'` 改成 `host === 'cover' || host === 'avatar'`。

### 2. 主进程 IPC（`electron/ipc/settings.ts`）

新增一个通道：

**`settings:pickAvatar`**：
- 打开文件选择器（dialog.showOpenDialog），过滤 jpg/png
- 确保 `userData/avatar/` 目录存在（mkdir）
- 复制选中文件到 `userData/avatar/avatar.{ext}`（覆盖旧文件）
- 路径写入 settings 表（`avatarPath`）
- 返回新路径

不需要 `settings:getAvatar` IPC——renderer 直接用 `qinplayer://avatar?path=` 渲染。

### 3. preload 白名单（`electron/preload.ts`）

INVOKE_CHANNELS 新增：
- `settings:pickAvatar`

不需要加 `settings:getAvatar`。

### 4. 设置页 UI（`src/pages/Settings.tsx`）

在"通用"区域之前新增"个人信息"区域：

```
┌─────────────────────────────────────────────┐
│ 个人信息                                     │
├─────────────────────────────────────────────┤
│ [头像预览 60x60 圆形]  名字：[输入框] [保存] │
│ [更换头像]                                    │
└─────────────────────────────────────────────┘
```

- 头像预览：`<img src="qinplayer://avatar?path=..." />`，无头像时显示 `IconUser`
- 名字输入框：限制 20 字符
- 更换头像按钮：调用 `settings:pickAvatar`
- 保存名字按钮：调用 `settings:set('userName', value)`
- 挂载时从 `settings:get` 读取 `userName` 和 `avatarPath`

### 5.「我的」页面展示（`src/pages/MyProfile.tsx`）

- 启动时从 `settings:get` 读取 `userName` 和 `avatarPath`
- 名字替换硬编码 `秋月`，无 `userName` 时显示默认名
- 头像：有 `avatarPath` 时用 `<img src="qinplayer://avatar?path=..." />`，无时显示 `IconUser`
- 和 dashboard 一起 30 秒刷新

### 6. CSS 样式（`src/styles/settings.css`）

新增：
- `.settings-profile` — 个人信息区域容器
- `.settings-profile__avatar` — 头像预览（60x60 圆形，overflow hidden）
- `.settings-profile__row` — 头像+名字横向排列

## 约束条件

1. 只支持 jpg/png 格式
2. 头像文件复制到 userData 目录，不保留原路径
3. 名字限制 20 字符
4. 编辑只在设置页，「我的」页只展示
5. 复用 settings 表，不新建数据库表
6. 复用 `qinplayer://` 协议显示头像，不注册新协议，不用 base64
7. 不改业务逻辑

## 回归测试

### 新增测试

**`tests/Settings.test.tsx`**：
1. 个人信息区域渲染测试 — 名字输入框和头像预览存在
2. 名字保存测试 — 点击保存后调用 `settings:set('userName', ...)`
3. 头像选择测试 — 点击更换头像后调用 `settings:pickAvatar`
4. 名字字符限制测试 — 超过 20 字符截断

**`tests/MyProfile.test.tsx`**（扩展）：
5. 自定义名字显示测试 — settings 返回 `userName` 时显示自定义名字
6. 默认名字测试 — settings 无 `userName` 时显示默认名
7. 自定义头像显示测试 — settings 返回 `avatarPath` 时 img 的 src 包含 `qinplayer://avatar`
8. 无头像测试 — settings 无 `avatarPath` 时显示 IconUser

### 手动验证

主人 `npm run dev` 后：
1. 设置页出现"个人信息"区域
2. 输入名字 → 保存 → 切到「我的」页 → 名字更新
3. 点击更换头像 → 选择 jpg/png → 头像预览更新 → 切到「我的」页 → 头像更新
4. 选择非 jpg/png 文件 → 提示不支持
5. 重启应用 → 名字和头像保持
