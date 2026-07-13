# Bug：迷你模式右键菜单闪退

## 现象

迷你模式队列视图（MiniQueueView）右键点击歌曲时，ContextMenu 弹出后立刻消失。
主页面的 PlaylistPanel 和 SongList 右键菜单正常。

## 根因假设

ContextMenu 组件渲染后通过 `setTimeout(0)` 添加全局 `click` 和 `contextmenu` 监听器（`handleClickOutside`）。在迷你模式下，可能有事件时序问题导致菜单立刻被关闭。

可能原因：
1. `setTimeout(0)` 延迟不够，当前右键事件的冒泡/capture 阶段触发了 handleClickOutside
2. 迷你窗口的 `-webkit-app-region` 或其他属性影响了事件传播
3. ContextMenu 的 overflow 检测把菜单移到了视口外

## 排查步骤

1. 在 ContextMenu 的 `handleClickOutside` 加 `console.log(e.type, e.target)`，确认是哪个事件触发了关闭
2. 在 `useTrackContextMenu.open` 加 `console.log('open', event.clientX, event.clientY)`，确认坐标是否正常
3. 检查 ContextMenu 的 `position` state 最终值，确认是否在视口内
4. 对比主窗口和迷你窗口的事件传播顺序

## 约束

- 只修 ContextMenu 在迷你模式下的关闭逻辑，不改菜单内容
- 不改主窗口的右键菜单行为
- 不改 useTrackContextMenu hook
