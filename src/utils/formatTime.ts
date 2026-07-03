// =============================================================================
// QinPlayer — 格式化工具函数
// =============================================================================
// 职责：提供通用的格式化函数，避免在多个组件中重复定义
// =============================================================================

/**
 * 格式化秒数为 mm:ss（用于进度条两侧时间显示）
 * ⚠️ 此函数被 RAF 循环调用，不能依赖任何 React state
 *
 * @param seconds 秒数
 * @returns 格式化的时间字符串，如 "3:45"
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
