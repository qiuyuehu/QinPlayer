import { describe, expect, it } from 'vitest'
import { calculateEqHeadroom } from '../src/utils/eqResponse'

function createFilter(magnitude: number): BiquadFilterNode {
  return {
    getFrequencyResponse: (_frequencies, magnitudes) => {
      magnitudes.fill(magnitude)
    },
  } as unknown as BiquadFilterNode
}

describe('EQ 响应补偿', () => {
  it('平坦响应不应该无故衰减', () => {
    expect(calculateEqHeadroom([createFilter(1)], 44100)).toBe(1)
  })

  it('正增益链路应该计算出小于 1 的 headroom', () => {
    expect(calculateEqHeadroom([createFilter(2), createFilter(2)], 44100)).toBeCloseTo(0.25)
  })
})
