// =============================================================================
// QinPlayer — 封面主色提取
// =============================================================================
// 职责：从封面图片提取核心主色，作为歌词界面背景
// 设计要点：
//   - ⚠️ 暗礁 2：缩小到 50x50 离屏 Canvas 采样，计算量降低 99%
//   - ⚠️ 暗礁 2：crossOrigin='anonymous' 防止 Canvas 污染
//   - 用 HSL 亮度（L）过滤浅色和深色，比纯 RGB 判断更准确
//   - 提取后如果亮度仍然偏高，自动压暗到适合白色歌词的范围
//   - 降级：无封面或提取失败时返回默认中性灰黑
// =============================================================================

/**
 * RGB 转 HSL，返回亮度 L（0~1）
 * 亮度 = (max + min) / 2 / 255
 */
function getLightness(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return (max + min) / (2 * 255)
}

/**
 * 从封面图片 URL 提取核心主色
 * ⚠️ 暗礁 2：缩小到 50x50 采样 + crossOrigin='anonymous'
 *
 * @param imageUrl 封面图片 URL（qinplayer://cover 或 blob:）
 * @returns 核心主色的 RGB 字符串
 */
export async function extractMainColor(imageUrl: string): Promise<string> {
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
          resolve(getDefaultColor())
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

          // 用 HSL 亮度过滤：太浅（>0.7）或太暗（<0.08）的都跳过
          const L = getLightness(r, g, b)
          if (L > 0.70) continue   // 浅色：白色歌词在上面看不清
          if (L < 0.08) continue   // 深色：接近纯黑

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

        // 按频率排序
        const sorted = Array.from(colorMap.entries())
          .sort((a, b) => b[1].count - a[1].count)

        if (sorted.length === 0) {
          resolve(getDefaultColor())
          return
        }

        // 取频率最高的颜色
        let { r, g, b } = sorted[0][1]

        // 最终防线：如果提取出来的颜色还是偏浅，强制压暗
        const finalL = getLightness(r, g, b)
        if (finalL > 0.35) {
          const ratio = 0.30 / finalL  // 压到亮度 ~0.30
          r = Math.round(r * ratio)
          g = Math.round(g * ratio)
          b = Math.round(b * ratio)
        }

        resolve(`rgb(${r}, ${g}, ${b})`)
      } catch (err) {
        console.warn('[ColorExtract] Canvas 提取失败:', err)
        resolve(getDefaultColor())
      }
    }

    img.onerror = () => {
      console.warn('[ColorExtract] 图片加载失败')
      resolve(getDefaultColor())
    }
  })
}

/**
 * 获取默认颜色（中性灰黑）
 */
function getDefaultColor(): string {
  return 'rgb(18, 18, 18)'
}
