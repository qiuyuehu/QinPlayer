// =============================================================================
// QinPlayer — 封面主色提取
// =============================================================================
// 职责：从封面图片提取一个主色，作为歌词界面背景
// 设计要点：
//   - ⚠️ 暗礁 2：缩小到 50x50 离屏 Canvas 采样，计算量降低 99%
//   - ⚠️ 暗礁 2：crossOrigin='anonymous' 防止 Canvas 污染
//   - 只提取一个主色（频率最高的颜色）
//   - 降级：无封面或提取失败时返回默认中性灰黑
// =============================================================================

/**
 * 从封面图片 URL 提取一个主色
 * ⚠️ 暗礁 2：缩小到 50x50 采样 + crossOrigin='anonymous'
 *
 * @param imageUrl 封面图片 URL（qinplayer://cover 或 blob:）
 * @returns 主色的 RGB 字符串
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

        // 按频率排序，取第一个（最高频）
        const sorted = Array.from(colorMap.entries())
          .sort((a, b) => b[1] - a[1])

        if (sorted.length === 0) {
          resolve(getDefaultColor())
          return
        }

        // 返回最高频的颜色
        const [key] = sorted[0]
        const [r, g, b] = key.split(',').map(Number)
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
