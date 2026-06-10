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
      <path d="M6 4.5v11l9-5.5L6 4.5z" />
    </svg>
  )
}

/** 暂停（双竖线） */
export function IconPause({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <rect x="5" y="4" width="3" height="12" rx="0.5" />
      <rect x="12" y="4" width="3" height="12" rx="0.5" />
    </svg>
  )
}

/** 上一首 */
export function IconPrev({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M13 5v10L6 10l7-5z" />
      <rect x="5" y="5" width="1.5" height="10" rx="0.25" />
    </svg>
  )
}

/** 下一首 */
export function IconNext({ width = 20, height = 20, className }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M7 5v10l7-5-7-5z" />
      <rect x="13.5" y="5" width="1.5" height="10" rx="0.25" />
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
