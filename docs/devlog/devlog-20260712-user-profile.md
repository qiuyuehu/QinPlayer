# Devlog — 2026-07-12 个人信息编辑

## 功能

设置页新增"个人信息"区域，可编辑昵称（≤20字符）和更换头像（jpg/png）。
「我的」页面从 settings 读取并展示，不再硬编码。

## 改动文件

| 文件 | 改动 |
|------|------|
| `electron/ipc/protocol.ts` | `qinplayer://` 协议扩展支持 `avatar` host |
| `electron/ipc/settings.ts` | 新增 `settings:pickAvatar` IPC（文件选择器 + 复制到 userData/avatar/） |
| `electron/preload.ts` | 白名单加 `settings:pickAvatar` |
| `src/pages/Settings.tsx` | 新增"个人信息"区域（头像预览 + 名字输入 + 保存） |
| `src/pages/MyProfile.tsx` | 从 settings 读取 userName/avatarPath，替换硬编码 |
| `src/styles/settings.css` | 个人信息区域样式 |
| `src/styles/myprofile.css` | 头像图片样式（overflow: hidden + object-fit: cover） |
| `tests/MyProfile.test.tsx` | 修复 mock 行为（channel-aware mock） |
| `SPEC.md` | 更新"我的"和"设置页面"描述 |

## 踩坑

1. **头像只能换一次**：文件名用 `avatar.{ext}` 导致同格式覆盖时路径不变，React 不重新渲染。修复：文件名加时间戳 `avatar_${Date.now()}.{ext}`。
2. **测试 mock 被 settings:get "吃掉"**：新增的 `settings:get` 调用消耗了 `mockImplementationOnce`，导致 dashboard 调用反而成功。修复：改用 channel-aware mock + rejected flag。
3. **useEffect 拆分**：个人信息加载必须和 dashboard 加载在独立 useEffect 中，否则影响测试 mock 行为。

## 测试

7/7 全绿（MyProfile.test.tsx）

## 数据方案

- 名字：`settings` 表 `userName` 键
- 头像路径：`settings` 表 `avatarPath` 键
- 头像文件：`userData/avatar/avatar_${timestamp}.{ext}`
- 头像显示：`qinplayer://avatar?path=...`（复用现有自定义协议）
