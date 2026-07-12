# Devlog — 2026-07-12 关闭窗口行为

## 功能

- 设置页通用区域新增“最小化到托盘 / 直接退出 / 每次询问”三态控件。
- 主进程新增 CloseCoordinator，负责同步阻止关闭、renderer readiness、唯一 requestId、pending 去重和 sender 校验。
- App 根级监听关闭请求，自定义弹窗支持最小化、退出、不再询问和 Escape 取消。
- preload 增加 `close:request`、`close:ready`、`close:respond` 白名单。

## 安全边界

- tray=false 时始终直接退出，不隐藏不可恢复窗口。
- renderer 未 ready、不可用或发送失败时回退最小化，不残留 pending。
- 托盘退出、before-quit 和系统退出绕过询问。
- 旧 requestId、非当前 sender、非法或重复响应均无副作用。
- 迷你播放器右上角关闭按钮仍只退出 mini mode。

## 测试

- 状态机、弹窗、设置、App StrictMode 和 MiniPlayer 定向测试通过。
- `npx tsc --noEmit` 通过。
- A+B 最终 `npm run verify` 通过：Harness、生产构建、`44` 个测试文件、`404` 个用例。
- Electron smoke：`1000×680` 设置三态与 ask 弹窗正常；`400×150` Alt+F4 弹窗无溢出；mini 自身关闭按钮恢复普通窗口。
