// =============================================================================
// QinPlayer — 封面主色提取
// =============================================================================
// 职责：从封面图片提取核心主色，作为歌词界面背景
// 设计要点：
//   - ⚠️ 暗礁 2：缩小到 50x50 离屏 Canvas 采样，计算量降低 99%
//   - ⚠️ 暗礁 2：crossOrigin='anonymous' 防止 Canvas 污染
//   - 自动排除白色、银色等类白色（歌词是浅色文字，背景太浅看不清）
//   - 提取核心颜色：排除类白色后，取频率最高的颜色
//   - 降级：无封面或提取失败时返回默认中性灰黑
// =============================================================================

/**
 * 判断颜色是否是类白色（白色、银色、浅灰色等）
 * 规则：RGB 值都偏高，且接近（排除这些颜色避免和歌词撞色）
 */
function isWhitish(r: number, g: number, b: number): boolean {
  const min = Math.min(r, g, b)
  const max = Math.max(r, g, b)
  const diff = max - min

  // 纯白/接近白色：所有通道 > 200，差距 < 50
  if (min > 200 && diff < 50) return true

  // 银色/浅灰色：所有通道 > 160，差距 < 30
  if (min > 160 && diff < 30) return true

  // 浅灰色：所有通道 > 140，差距 < 20
  if (min > 140 && diff < 20) return true

  return false
}

/**
 * 判断颜色是否太暗（接近黑色）
 * 规则：RGB 值都很低
 */
function isBlackish(r: number, g: number, b: number): boolean {
  return r < 30 && g < 30 && b < 30
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

          // 排除类白色（白色、银色等）
          if (isWhitish(r, g, b)) continue

          // 排除太暗的颜色（接近黑色）
          if (isBlackish(r, g, b)) continue

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

        // 返回频率最高的颜色
        const [, { r, g, b }] = sorted[0]
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
