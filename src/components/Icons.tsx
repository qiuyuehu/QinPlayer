// =============================================================================
// QinPlayer — 统一 SVG 图标组件
// =============================================================================
// 所有图标 20×20 viewBox，stroke 风格，currentColor 继承父元素颜色
// 用法：<IconPlay width={18} height={18} />
// =============================================================================

interface IconProps {
  width?: number
  height?: number
  className?: string
}

/** 播放（三角形） */
export function IconPlay({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M5.5 3.5v13l11-6.5L5.5 3.5z" />
    </svg>
  )
}

/** 暂停（双竖线） */
export function IconPause({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <rect x="4.5" y="3" width="3.5" height="14" rx="0.75" />
      <rect x="12" y="3" width="3.5" height="14" rx="0.75" />
    </svg>
  )
}

/** 上一首 */
export function IconPrev({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M13 4v12L5.5 10 13 4z" />
      <rect x="4" y="4" width="2" height="12" rx="0.5" />
    </svg>
  )
}

/** 下一首 */
export function IconNext({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M7 4v12l7.5-6L7 4z" />
      <rect x="14" y="4" width="2" height="12" rx="0.5" />
    </svg>
  )
}

/** 音量-高 */
export function IconVolumeHigh({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7.5h2.5L10 4v12l-4.5-3.5H3a1 1 0 01-1-1v-3a1 1 0 011-1z" fill="currentColor" stroke="none" />
      <path d="M13 7.5c.8.8 1.2 1.8 1.2 2.5s-.4 1.7-1.2 2.5" />
      <path d="M15 5.5c1.3 1.3 2 3 2 4.5s-.7 3.2-2 4.5" />
    </svg>
  )
}

/** 音量-低 */
export function IconVolumeLow({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7.5h2.5L10 4v12l-4.5-3.5H3a1 1 0 01-1-1v-3a1 1 0 011-1z" fill="currentColor" stroke="none" />
      <path d="M13 7.5c.8.8 1.2 1.8 1.2 2.5s-.4 1.7-1.2 2.5" />
    </svg>
  )
}

/** 音量-静音 */
export function IconVolumeMuted({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7.5h2.5L10 4v12l-4.5-3.5H3a1 1 0 01-1-1v-3a1 1 0 011-1z" fill="currentColor" stroke="none" />
      <path d="M13.5 8.5l4 3M17.5 8.5l-4 3" />
    </svg>
  )
}

/** 随机播放 */
export function IconShuffle({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 5h2.5l3 4.5L14 5h3" />
      <path d="M3 15h2.5l3-4.5L14 15h3" />
      <path d="M17 5v2.5M17 12.5V15M3 5v2.5M3 12.5V15" />
    </svg>
  )
}

/** 顺序播放（循环箭头） */
export function IconRepeat({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 8h10l-2-2M14 12H4l2 2" />
      <path d="M16 6v4a2 2 0 01-2 2H6" />
      <path d="M4 14v-4a2 2 0 012-2h8" />
    </svg>
  )
}

/** 单曲循环（循环箭头 + 1） */
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

/** 菜单（三条横线） */
export function IconMenu({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={className}>
      <path d="M4 6h12M4 10h12M4 14h12" />
    </svg>
  )
}

/** 最小化（细横线） */
export function IconMinimize({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={className}>
      <path d="M5 10h10" />
    </svg>
  )
}

/** 展开（四角箭头） */
export function IconExpand({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 8V5h3M15 8V5h-3M5 12v3h3M15 12v3h-3" />
    </svg>
  )
}

/** 四角收缩（退出全屏） */
export function IconCompress({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 5v3H5M12 5v3h3M8 15v-3H5M12 15v-3h3" />
    </svg>
  )
}

/** 关闭（X） */
export function IconClose({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={className}>
      <path d="M6 6l8 8M14 6l-8 8" />
    </svg>
  )
}

/** 返回箭头 */
export function IconBack({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5L7 10l5 5" />
    </svg>
  )
}

/** 心形（收藏） */
export function IconHeart({ width = 20, height = 20, filled = false, className }: IconProps & { filled?: boolean }) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 16.5s-6.5-4-6.5-8.2A3.5 3.5 0 0110 5.5a3.5 3.5 0 016.5 2.8c0 4.2-6.5 8.2-6.5 8.2z" />
    </svg>
  )
}

/** 时钟（最近播放） */
export function IconClock({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5V10l2.5 1.5" />
    </svg>
  )
}

/** 音符（本地音乐） */
export function IconMusic({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 15V5.5l9-2V13" />
      <circle cx="4.5" cy="15" r="2.5" />
      <circle cx="13.5" cy="13" r="2.5" />
    </svg>
  )
}

/** 光盘（专辑） */
export function IconDisc({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="2" />
    </svg>
  )
}

/** 列表（歌单） */
export function IconList({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 5h10M5 10h10M5 15h10" />
      <circle cx="3" cy="5" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="3" cy="10" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="3" cy="15" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** 齿轮（设置） */
export function IconGear({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4" />
    </svg>
  )
}

/** 文件夹 */
export function IconFolder({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 5.5A1.5 1.5 0 014.5 4h3.3a1.5 1.5 0 011.2.6L10 6h5.5A1.5 1.5 0 0117 7.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 14.5v-9z" />
    </svg>
  )
}

/** 信息（i） */
export function IconInfo({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v5" />
      <circle cx="10" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}
