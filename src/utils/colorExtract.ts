// =============================================================================
// QinPlayer — 封面主色提取
// =============================================================================
// 职责：从封面图片提取主色，生成渐变背景
// 设计要点：
//   - ⚠️ 暗礁 2：缩小到 50x50 离屏 Canvas 采样，计算量降低 99%
//   - ⚠️ 暗礁 2：crossOrigin='anonymous' 防止 Canvas 污染
//   - 使用频率统计（不需要 K-Means），简单高效
//   - 降级：无封面或提取失败时返回默认中性灰黑
//   - 亮度自适应：根据提取颜色的亮度决定文字颜色
// =============================================================================

export interface ExtractResult {
  colors: string[]      // 提取的主色数组
  isLight: boolean      // 是否是亮色背景（用于决定文字颜色）
}

/**
 * 计算颜色的相对亮度（0-1）
 * 使用 WCAG 2.0 公式：0.2126*R + 0.7152*G + 0.0722*B
 */
function getLuminance(r: number, g: number, b: number): number {
  // 先归一化到 0-1
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  // 应用 gamma 校正
  const rLinear = rn <= 0.03928 ? rn / 12.92 : Math.pow((rn + 0.055) / 1.055, 2.4)
  const gLinear = gn <= 0.03928 ? gn / 12.92 : Math.pow((gn + 0.055) / 1.055, 2.4)
  const bLinear = bn <= 0.03928 ? bn / 12.92 : Math.pow((bn + 0.055) / 1.055, 2.4)

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear
}

/**
 * 从封面图片 URL 提取主色
 * ⚠️ 暗礁 2：缩小到 50x50 采样 + crossOrigin='anonymous'
 *
 * @param imageUrl 封面图片 URL（qinplayer://cover 或 blob:）
 * @returns 提取结果：颜色数组 + 是否亮色背景
 */
export async function extractColors(imageUrl: string): Promise<ExtractResult> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'  // ⚠️ 关键：防止 Canvas 污染
    img.src = imageUrl

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      // ⚠️ 缩小到 50x50 采样，计算量降低 99%
      canvas.width = 50
      canvas.height = 50

      try {
        ctx?.drawImage(img, 0, 0, 50, 50)
        const imageData = ctx?.getImageData(0, 0, 50, 50).data

        if (!imageData) {
          resolve(getDefaultResult())
          return
        }

        // 颜色统计算法：统计像素颜色频率
        const colorMap = new Map<string, { count: number; r: number; g: number; b: number }>()

        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i]
          const g = imageData[i + 1]
          const b = imageData[i + 2]
          const a = imageData[i + 3]

          // 跳过透明像素
          if (a < 128) continue

          // 量化颜色（减少颜色种类，提高统计效率）
          const qr = Math.round(r / 32) * 32
          const qg = Math.round(g / 32) * 32
          const qb = Math.round(b / 32) * 32

          const key = `${qr},${qg},${qb}`
          const existing = colorMap.get(key)
          if (existing) {
            existing.count++
          } else {
            colorMap.set(key, { count: 1, r: qr, g: qg, b: qb })
          }
        }

        // 按频率排序，取前 3 个颜色
        const sorted = Array.from(colorMap.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 3)

        if (sorted.length === 0) {
          resolve(getDefaultResult())
          return
        }

        // 转换为 RGB 字符串，并计算平均亮度
        const colors: string[] = []
        let totalLuminance = 0

        for (const [, { r, g, b }] of sorted) {
          colors.push(`rgb(${r}, ${g}, ${b})`)
          totalLuminance += getLuminance(r, g, b)
        }

        const avgLuminance = totalLuminance / sorted.length
        const isLight = avgLuminance > 0.5  // 亮度 > 0.5 算亮色

        resolve({ colors, isLight })
      } catch (err) {
        console.warn('[ColorExtract] Canvas 提取失败:', err)
        resolve(getDefaultResult())
      }
    }

    img.onerror = () => {
      console.warn('[ColorExtract] 图片加载失败')
      resolve(getDefaultResult())
    }
  })
}

/**
 * 获取默认结果（中性灰黑系列，暗色背景）
 */
function getDefaultResult(): ExtractResult {
  return {
    colors: ['rgb(18, 18, 18)', 'rgb(26, 26, 26)'],
    isLight: false
  }
}

/**
 * 生成 CSS 渐变背景
 * @param colors 颜色数组
 * @returns CSS linear-gradient 字符串
 */
export function generateGradient(colors: string[]): string {
  if (colors.length === 0) {
    return 'linear-gradient(135deg, rgb(18, 18, 18), rgb(26, 26, 26))'
  }

  if (colors.length === 1) {
    return `linear-gradient(135deg, ${colors[0]}, ${colors[0]})`
  }

  // 2-3 个颜色的渐变
  return `linear-gradient(135deg, ${colors.join(', ')})`
}
