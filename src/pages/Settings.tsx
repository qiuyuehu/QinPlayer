// =============================================================================
// QinPlayer — 设置页面
// =============================================================================
// 功能：音频输出设备选择（Phase 1 Task 1.13）
// 后续 Phase 会补充：主题切换、文件管理、数据导入导出等
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { getAudioEngine } from '../utils/AudioEngine'

function Settings() {
  // --- 音频设备状态 ---
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('default')
  const [switching, setSwitching] = useState(false)  // 切换中标记（防止重复点击）

  // --- 加载设备列表 ---
  const loadDevices = useCallback(async () => {
    const engine = getAudioEngine()
    const outputDevices = await engine.enumerateOutputDevices()
    setDevices(outputDevices)
    setCurrentDeviceId(engine.getOutputDeviceId())
  }, [])

  // 组件挂载时加载设备列表
  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  // --- 切换输出设备 ---
  const handleDeviceChange = useCallback(async (deviceId: string) => {
    if (switching) return  // 防止重复点击
    setSwitching(true)

    try {
      const engine = getAudioEngine()
      await engine.setOutputDevice(deviceId)
      setCurrentDeviceId(deviceId)
    } catch (err) {
      console.error('[Settings] 切换设备失败:', err)
      // 切换失败时恢复显示之前的设备
      const engine = getAudioEngine()
      setCurrentDeviceId(engine.getOutputDeviceId())
    } finally {
      setSwitching(false)
    }
  }, [switching])

  // --- 刷新设备列表 ---
  const handleRefresh = useCallback(async () => {
    await loadDevices()
  }, [loadDevices])

  return (
    <div className="settings-page">
      <h2 className="settings-page__title">设置</h2>

      {/* ===== 播放设置区域 ===== */}
      <section className="settings-section">
        <h3 className="settings-section__title">播放</h3>

        {/* 音频输出设备 */}
        <div className="settings-item">
          <div className="settings-item__info">
            <span className="settings-item__label">音频输出设备</span>
            <span className="settings-item__desc">选择声音从哪个设备播放</span>
          </div>
          <div className="settings-item__control">
            <select
              className="settings-select"
              value={currentDeviceId}
              onChange={(e) => handleDeviceChange(e.target.value)}
              disabled={switching}
            >
              {/* 默认设备选项 */}
              <option value="default">系统默认</option>

              {/* 分割线（不可选） */}
              {devices.length > 0 && (
                <option disabled>────────────</option>
              )}

              {/* 枚举到的音频输出设备 */}
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {/* 有标签显示标签，没标签显示 "设备 N" */}
                  {device.label || `设备 ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>

            {/* 刷新按钮（设备插拔后更新列表） */}
            <button
              className="settings-btn settings-btn--icon"
              onClick={handleRefresh}
              title="刷新设备列表"
            >
              ↻
            </button>
          </div>
        </div>
      </section>

      {/* ===== 占位区域（后续 Phase 补充） ===== */}
      <section className="settings-section settings-section--placeholder">
        <h3 className="settings-section__title">通用</h3>
        <div className="settings-item">
          <div className="settings-item__info">
            <span className="settings-item__label">主题</span>
            <span className="settings-item__desc">Phase 2 实现</span>
          </div>
        </div>
      </section>

      <section className="settings-section settings-section--placeholder">
        <h3 className="settings-section__title">文件管理</h3>
        <div className="settings-item">
          <div className="settings-item__info">
            <span className="settings-item__label">音乐文件夹</span>
            <span className="settings-item__desc">Phase 2 实现</span>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Settings
