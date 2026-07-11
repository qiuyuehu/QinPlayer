# Devlog — 2026-07-11 迷你播放器 UI 优化

## 改动内容

### 1. 单曲循环图标替换
- `IconRepeatOne` 从半透明底圈改为实心圆底 + 深色粗体 "1"
- 与 `IconRepeat`（顺序播放）视觉区分明显
- 文件：`src/components/Icons.tsx`

### 2. 工具栏三栏分组布局
- 从全部居中改为三栏分组：左窗口控制、中播放控制、右内容切换
- 组内 gap 4px，组间 gap 16px
- 文件：`src/components/MiniPlayer.tsx` + `src/styles/miniplayer.css`

## 验证
- tsc：通过
- 测试：20 测试全绿（MiniPlayer）
- harness：通过

## 涉及文件
- `src/components/Icons.tsx`
- `src/components/MiniPlayer.tsx`
- `src/styles/miniplayer.css`
- `SPEC.md`
