// =============================================================================
// QinPlayer — 封面主色提取
// =============================================================================
// 职责：从封面图片提取主色，生成渐变背景
// 设计要点：
//   - ⚠️ 暗礁 2：缩小到 50x50 离屏 Canvas 采样，计算量降低 99%
//   - ⚠️ 暗礁 2：crossOrigin='anonymous' 防止 Canvas 污染
//   - 使用频率统计（不需要 K-Means），简单高效
//   - 降级：无封面或提取失败时返回默认中性灰黑
// =============================================================================

/**
 * 从封面图片 URL 提取主色
 * ⚠️ 暗礁 2：缩小到 50x50 采样 + crossOrigin='anonymous'
 *
 * @param imageUrl 封面图片 URL（qinplayer://cover 或 blob:）
 * @returns 2-3 个主色的 RGB 字符串数组
 */
export async function extractColors(imageUrl: string): Promise<string[]> {
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
          resolve(getDefaultColors())
          return
        }

        // 颜色统计算法：统计像素颜色频率
        const colorMap = new Map<string, number>()

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
          colorMap.set(key, (colorMap.get(key) || 0) + 1)
        }

        // 按频率排序，取前 3 个颜色
        const sorted = Array.from(colorMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)

        if (sorted.length === 0) {
          resolve(getDefaultColors())
          return
        }

        // 转换为 RGB 字符串
        const colors = sorted.map(([key]) => {
          const [r, g, b] = key.split(',').map(Number)
          return `rgb(${r}, ${g}, ${b})`
        })

        resolve(colors)
      } catch (err) {
        console.warn('[ColorExtract] Canvas 提取失败:', err)
        resolve(getDefaultColors())
      }
    }

    img.onerror = () => {
      console.warn('[ColorExtract] 图片加载失败')
      resolve(getDefaultColors())
    }
  })
}

/**
 * 获取默认颜色（中性灰黑系列，不偏蓝紫）
 */
function getDefaultColors(): string[] {
  return ['rgb(18, 18, 18)', 'rgb(26, 26, 26)']
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
