# QinPlayer GPU 硬件加速优化 执行方案

> 创建：2026-07-03
> 状态：待确认

---

## 目标

优化 Chromium 启动参数，启用 GPU 硬件加速，为后续视频/动画效果铺垫。

## 非目标

- 不在设置页显示 GPU 状态
- 不做 GPU 相关的新功能
- 不做独立功能开关

---

## 技术方案

### Chromium 启动参数

**改动文件**：`electron/main.ts`

**插入位置**：`app.requestSingleInstanceLock()` 之后、`protocol.registerSchemesAsPrivileged()` 之前（约第 75 行），保证在 `app.whenReady()`（约第 163 行）之前。

```typescript
// GPU 硬件加速优化（为后续视频/动画效果铺垫）
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('enable-webgl')
app.commandLine.appendSwitch('enable-accelerated-2d-canvas')
```

**参数说明**：
- `enable-gpu-rasterization` — GPU 光栅化，减少 CPU 负担
- `enable-zero-copy` — 零拷贝，减少内存复制
- `enable-webgl` — WebGL 支持，为后续视频/动画铺垫
- `enable-accelerated-2d-canvas` — 2D Canvas 硬件加速

**风险**：
- 少数老显卡或驱动可能出现黑屏、闪烁、Canvas/WebGL 异常
- Chromium 大多数情况会按硬件能力/黑名单降级，但强行追加 GPU switches 后可能有边界情况
- 出问题回滚这 4 行即可
-

## 文件改动清单

| 文件 | 改动 | 类型 |
|------|------|------|
| `electron/main.ts` | 新增 4 个 GPU 启动参数 | 新增 |

---

## 前置条件

1. 读取 `electron/main.ts` — 了解主进程初始化位置

## 验证方法

1. `npx tsc --noEmit` — TypeScript 语法检查
2. `npm run dev` — 启动无报错，渲染正常
3. `npm run build` — 主进程入口改动需确认打包正常
4. 手动验收 — 启动、播放、歌词页、窗口显示正常

---

*方案就绪，等主人确认后执行。*
