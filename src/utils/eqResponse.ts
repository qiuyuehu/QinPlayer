// =============================================================================
// QinPlayer — 均衡器频响补偿
// =============================================================================
// 职责：根据完整 Biquad 链路的频响峰值计算安全的输出补偿。
// =============================================================================

const MIN_FREQUENCY = 20
const SAMPLE_COUNT = 256

/**
 * 计算均衡器链路的输出 headroom。
 * 平坦响应或无法可靠计算时返回 1，避免无故衰减或写入非有限参数。
 */
export function calculateEqHeadroom(filters: readonly BiquadFilterNode[], sampleRate: number): number {
  if (filters.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) return 1

  const maxFrequency = sampleRate / 2 * 0.95
  if (maxFrequency <= MIN_FREQUENCY) return 1

  const frequencies = new Float32Array(SAMPLE_COUNT)
  const ratio = maxFrequency / MIN_FREQUENCY
  for (let index = 0; index < SAMPLE_COUNT; index++) {
    frequencies[index] = MIN_FREQUENCY * Math.pow(ratio, index / (SAMPLE_COUNT - 1))
  }

  const combinedMagnitudes = new Float32Array(SAMPLE_COUNT).fill(1)
  for (const filter of filters) {
    const magnitudes = new Float32Array(SAMPLE_COUNT)
    const phases = new Float32Array(SAMPLE_COUNT)
    filter.getFrequencyResponse(frequencies, magnitudes, phases)

    for (let index = 0; index < SAMPLE_COUNT; index++) {
      const magnitude = magnitudes[index]
      if (!Number.isFinite(magnitude) || magnitude < 0) return 1
      combinedMagnitudes[index] *= magnitude
    }
  }

  const peakMagnitude = Math.max(...combinedMagnitudes)
  if (!Number.isFinite(peakMagnitude) || peakMagnitude <= 1) return 1

  return Math.min(1, 1 / peakMagnitude)
}
