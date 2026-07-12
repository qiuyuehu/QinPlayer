# 单曲循环图标替换

## 约束
- 只改 `src/components/Icons.tsx` 的 `IconRepeatOne` 函数
- 不改 `IconRepeat`（顺序播放）和 `IconShuffle`（随机播放）
- 不改其他文件
- 不要自动 git commit

## 需求

当前 `IconRepeatOne` 的 "1" 太小（fontSize=7），在 14×14/16×16 的工具栏按钮里几乎看不见。换成更醒目的样式：循环箭头中间加圆形底圈 + 大号 "1"。

## 当前代码

`src/components/Icons.tsx` 第107-117行：
```tsx
export function IconRepeatOne({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 8h10l-2-2M14 12H4l2 2" />
      <path d="M16 6v4a2 2 0 01-2 2H6" />
      <path d="M4 14v-4a2 2 0 012-2h8" />
      <text x="10" y="11.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="700">1</text>
    </svg>
  )
}
```

## 改动

替换 `IconRepeatOne` 函数体，保留循环箭头，中间加圆形底圈 + 大号 "1"：

```tsx
export function IconRepeatOne({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 8h10l-2-2M14 12H4l2 2" />
      <path d="M16 6v4a2 2 0 01-2 2H6" />
      <path d="M4 14v-4a2 2 0 012-2h8" />
      <circle cx="10" cy="10" r="4" fill="currentColor" stroke="none" opacity="0.2" />
      <text x="10" y="13" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">1</text>
    </svg>
  )
}
```

**变化：**
- 加了 `<circle cx="10" cy="10" r="4">` 作为 "1" 的底圈（半透明填充，不抢箭头视觉）
- "1" 的 fontSize 从 7 改为 8，y 从 11.5 改为 13（视觉居中）
- 循环箭头不变

## 验证

1. `npx tsc --noEmit` 无报错
2. `npm test` 通过
3. 主页面/歌词页/迷你模式的单曲循环按钮都能看到醒目的 "1"

## 手动测试

1. `npm run dev` 启动
2. 切换到单曲循环模式 → 三个界面的图标都有圆形底圈 + 大号 "1"
3. 切换到顺序播放 → 图标是普通循环箭头（不变）
4. 切换到随机播放 → 图标是 shuffle（不变）
