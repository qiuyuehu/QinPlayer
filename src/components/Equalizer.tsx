// =============================================================================
// QinPlayer — 均衡器 UI 组件
// =============================================================================
// 职责：10段均衡器垂直滑块、预设按钮、重置按钮
// 设计：极简线条风，垂直滑块用 CSS rotate(-90deg) 实现
// =============================================================================

import { useCallback } from 'react'
import { useEqStore, EQ_LABELS, EQ_PRESETS } from '../stores/eqStore'
import './Equalizer.css'

// ---------------------------------------------------------------------------
// 均衡器组件
// ---------------------------------------------------------------------------

function Equalizer() {
  // 从 store 读取状态
  const gains = useEqStore((s) => s.gains)
  const activePreset = useEqStore((s) => s.activePreset)
  const setGain = useEqStore((s) => s.setGain)
  const applyPreset = useEqStore((s) => s.applyPreset)
  const resetAll = useEqStore((s) => s.resetAll)

  // 单个滑块值变化回调
  const handleSliderChange = useCallback((index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    setGain(index, value)
  }, [setGain])

  // 预设按钮点击回调
  const handlePresetClick = useCallback((presetName: string) => {
    // 如果点击已选中的预设，则取消选中（恢复自定义状态，但保留当前增益）
    if (activePreset === presetName) {
      // 不做任何操作，保持当前增益
      return
    }
    applyPreset(presetName)
  }, [activePreset, applyPreset])

  // 重置按钮点击回调
  const handleReset = useCallback(() => {
    resetAll()
  }, [resetAll])

  return (
    <div className="eq-container">
      {/* ===== 滑块区域 ===== */}
      <div className="eq-sliders">
        {/* 0dB 参考线 */}
        <div className="eq-zero-line" />

        {/* 10 个频段滑块 */}
        {EQ_LABELS.map((label, index) => {
          const gain = gains[index]
          // 根据增益正负选择不同的显示样式
          const valueClass = gain > 0.05
            ? 'eq-value--positive'
            : gain < -0.05
              ? 'eq-value--negative'
              : 'eq-value--zero'

          return (
            <div key={label} className="eq-slider-col">
              {/* dB 值显示 */}
              <span className={`eq-value ${valueClass}`}>
                {gain > 0 ? '+' : ''}{gain.toFixed(1)}dB
              </span>

              {/* 垂直滑块 */}
              <div className="eq-slider-track">
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.1}
                  value={gain}
                  onChange={(e) => handleSliderChange(index, e)}
                  aria-label={`${label}Hz 增益`}
                />
              </div>

              {/* 频段标签 */}
              <span className="eq-label">{label}</span>
            </div>
          )
        })}
      </div>

      {/* ===== 预设按钮行 ===== */}
      <div className="eq-presets">
        {EQ_PRESETS.map((preset) => (
          <button
            key={preset.name}
            className={`eq-preset-btn ${activePreset === preset.name ? 'eq-preset-btn--active' : ''}`}
            onClick={() => handlePresetClick(preset.name)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* ===== 重置按钮 ===== */}
      <button className="eq-reset-btn" onClick={handleReset}>
        重置
      </button>
    </div>
  )
}

export default Equalizer
