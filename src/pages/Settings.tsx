// =============================================================================
// QinPlayer — 设置页面
// =============================================================================
// 功能：主题切换、音频输出设备选择
// 设计：每个设置项分"信息区"和"控制区"，左文字右操作
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { getAudioEngine } from '../utils/AudioEngine'
import { useUIStore } from '../stores/uiStore'
import { usePlayerStore } from '../stores/playerStore'
import type { Theme } from '../types'

// 主题选项配置
const THEME_OPTIONS: { value: Theme; label: string; desc: string }[] = [
  { value: 'light', label: '亮色', desc: '始终使用亮色主题' },
  { value: 'dark', label: '暗色', desc: '始终使用暗色主题' },
  { value: 'system', label: '跟随系统', desc: '自动匹配系统主题' },
]

function Settings() {
  // --- 主题状态（从 Zustand 读取） ---
  const theme = useUIStore((state) => state.theme)
  const setTheme = useUIStore((state) => state.setTheme)

  // --- 音频设备状态 ---
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('default')
  const [switching, setSwitching] = useState(false)  // 切换中标记（防止重复点击）

  // --- 开机自启动状态 ---
  const [autoLaunch, setAutoLaunch] = useState(false)

  // --- 淡入淡出状态（从 Zustand 读取） ---
  const fadeEnabled = usePlayerStore((s) => s.fadeEnabled)
  const setFadeEnabled = usePlayerStore((s) => s.setFadeEnabled)

  // --- 歌词偏移量状态（从 Zustand 读取） ---
  const lyricOffset = usePlayerStore((s) => s.lyricOffset)
  const setLyricOffset = usePlayerStore((s) => s.setLyricOffset)

  // --- 音乐文件夹状态 ---
  const [folders, setFolders] = useState<string[]>([])

  // --- 导入导出状态 ---
  const [exporting, setExporting] = useState(false)   // 导出中
  const [importing, setImporting] = useState(false)    // 导入中

  // ---------------------------------------------------------------------------
  // 主题切换
  // ---------------------------------------------------------------------------
  // 切换主题 → 更新 Zustand → 保存到数据库（useTheme Hook 自动应用到 DOM）
  const handleThemeChange = useCallback(async (newTheme: Theme) => {
    setTheme(newTheme)
    // 持久化到数据库
    await window.electronAPI.invoke('settings:set', { key: 'theme', value: newTheme })
  }, [setTheme])

  // ---------------------------------------------------------------------------
  // 音频设备
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // 开机自启动
  // ---------------------------------------------------------------------------

  // 加载开机自启动状态
  useEffect(() => {
    window.electronAPI.invoke('get-auto-launch').then((enabled: boolean) => {
      setAutoLaunch(enabled)
    })
  }, [])

  // 切换开机自启动
  const handleAutoLaunchChange = useCallback(async (enabled: boolean) => {
    setAutoLaunch(enabled)
    window.electronAPI.send('set-auto-launch', enabled)
  }, [])

  // ---------------------------------------------------------------------------
  // 淡入淡出开关
  // ---------------------------------------------------------------------------

  const handleFadeChange = useCallback((enabled: boolean) => {
    setFadeEnabled(enabled)
    // 持久化到数据库
    window.electronAPI.invoke('settings:set', { key: 'fadeEnabled', value: String(enabled) })
  }, [setFadeEnabled])

  // ---------------------------------------------------------------------------
  // 歌词时间轴偏移
  // ---------------------------------------------------------------------------

  const handleLyricOffsetChange = useCallback((delta: number) => {
    const newOffset = Math.max(-0.5, Math.min(0.5, lyricOffset + delta))
    setLyricOffset(newOffset)
    // 持久化到数据库
    window.electronAPI.invoke('settings:set', { key: 'lyricOffset', value: String(newOffset) })
  }, [lyricOffset, setLyricOffset])

  // ---------------------------------------------------------------------------
  // 音乐文件夹管理
  // ---------------------------------------------------------------------------

  // 加载文件夹列表
  useEffect(() => {
    window.electronAPI.invoke('settings:getFolders').then((list: string[]) => {
      setFolders(list)
    })
  }, [])

  // 添加文件夹
  const handleAddFolder = useCallback(async () => {
    const folderPath = await window.electronAPI.invoke('settings:addFolder')
    if (folderPath) {
      setFolders(prev => [...prev, folderPath])
    }
  }, [])

  // 删除文件夹
  const handleRemoveFolder = useCallback((folderPath: string) => {
    window.electronAPI.send('settings:removeFolder', folderPath)
    setFolders(prev => prev.filter(f => f !== folderPath))
  }, [])

  // ---------------------------------------------------------------------------
  // 数据导入/导出
  // ---------------------------------------------------------------------------

  // 导出备份
  const handleExport = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      const result = await window.electronAPI.invoke('db:export') as { success: boolean; canceled?: boolean; error?: string }
      if (result.canceled) return
      if (result.success) {
        alert('备份导出成功！')
      } else {
        alert('导出失败：' + (result.error || '未知错误'))
      }
    } catch (err) {
      alert('导出失败：' + String(err))
    } finally {
      setExporting(false)
    }
  }, [exporting])

  // 导入备份（两步：选文件 → 确认 → 替换并重启）
  const handleImport = useCallback(async () => {
    if (importing) return
    try {
      // 第一步：选择备份文件
      const backupPath = await window.electronAPI.invoke('db:import-select') as string | null
      if (!backupPath) return

      // 第二步：确认（会覆盖现有数据）
      const confirmed = window.confirm(
        '导入备份将替换当前所有数据（歌单、播放记录、设置等），且应用会自动重启。\n\n确定继续吗？'
      )
      if (!confirmed) return

      setImporting(true)

      // 第三步：替换数据库并重启
      const result = await window.electronAPI.invoke('db:import-apply', backupPath) as { success: boolean; error?: string }
      if (!result.success) {
        alert('导入失败：' + (result.error || '未知错误'))
        setImporting(false)
      }
      // 成功的话应用会自动重启，不需要处理
    } catch (err) {
      alert('导入失败：' + String(err))
      setImporting(false)
    }
  }, [importing])

  return (
    <div className="settings-page">
      <h2 className="settings-page__title">设置</h2>

      {/* ===== 通用设置区域 ===== */}
      <section className="settings-section">
        <h3 className="settings-section__title">通用</h3>

        {/* 主题切换 */}
        <div className="settings-item">
          <div className="settings-item__info">
            <span className="settings-item__label">主题</span>
            <span className="settings-item__desc">
              当前：{THEME_OPTIONS.find(o => o.value === theme)?.desc || '暗色'}
            </span>
          </div>
          <div className="settings-item__control">
            <div className="theme-options">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`theme-option ${theme === option.value ? 'theme-option--active' : ''}`}
                  onClick={() => handleThemeChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 开机自启动 */}
        <div className="settings-item">
          <div className="settings-item__info">
            <span className="settings-item__label">开机自启动</span>
            <span className="settings-item__desc">开机时自动启动 QinPlayer</span>
          </div>
          <div className="settings-item__control">
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={autoLaunch}
                onChange={(e) => handleAutoLaunchChange(e.target.checked)}
              />
              <span className="settings-switch__slider" />
            </label>
          </div>
        </div>
      </section>

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

        {/* 淡入淡出开关 */}
        <div className="settings-item">
          <div className="settings-item__info">
            <span className="settings-item__label">淡入淡出</span>
            <span className="settings-item__desc">切歌时音量平滑过渡</span>
          </div>
          <div className="settings-item__control">
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={fadeEnabled}
                onChange={(e) => handleFadeChange(e.target.checked)}
              />
              <span className="settings-switch__slider" />
            </label>
          </div>
        </div>
      </section>

      {/* ===== 文件管理区域 ===== */}
      <section className="settings-section">
        <h3 className="settings-section__title">文件管理</h3>

        {/* 音乐文件夹 */}
        <div className="settings-item settings-item--vertical">
          <div className="settings-item__info">
            <span className="settings-item__label">音乐文件夹</span>
            <span className="settings-item__desc">管理扫描的音乐目录</span>
          </div>
          <div className="settings-item__control settings-item__control--full">
            <div className="folder-list">
              {folders.map((folder) => (
                <div key={folder} className="folder-item">
                  <span className="folder-item__path" title={folder}>{folder}</span>
                  <button
                    className="folder-item__remove"
                    onClick={() => handleRemoveFolder(folder)}
                    title="移除"
                  >
                    ×
                  </button>
                </div>
              ))}
              {folders.length === 0 && (
                <div className="folder-item folder-item--empty">
                  <span>未添加音乐文件夹</span>
                </div>
              )}
            </div>
            <button
              className="settings-btn"
              onClick={handleAddFolder}
            >
              + 添加文件夹
            </button>
          </div>
        </div>

        {/* 歌词时间轴偏移 */}
        <div className="settings-item">
          <div className="settings-item__info">
            <span className="settings-item__label">歌词时间轴偏移</span>
            <span className="settings-item__desc">调整歌词与音乐的同步（±0.5s）</span>
          </div>
          <div className="settings-item__control">
            <div className="lyric-offset-controls">
              <button
                className="settings-btn settings-btn--small"
                onClick={() => handleLyricOffsetChange(-0.1)}
                disabled={lyricOffset <= -0.5}
              >
                -0.1s
              </button>
              <span className="lyric-offset-value">
                {lyricOffset > 0 ? '+' : ''}{lyricOffset.toFixed(1)}s
              </span>
              <button
                className="settings-btn settings-btn--small"
                onClick={() => handleLyricOffsetChange(0.1)}
                disabled={lyricOffset >= 0.5}
              >
                +0.1s
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 数据管理区域 ===== */}
      <section className="settings-section">
        <h3 className="settings-section__title">数据</h3>

        {/* 导出备份 */}
        <div className="settings-item">
          <div className="settings-item__info">
            <span className="settings-item__label">导出备份</span>
            <span className="settings-item__desc">将数据库导出为 .db 文件</span>
          </div>
          <div className="settings-item__control">
            <button
              className="settings-btn"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? '导出中...' : '导出备份'}
            </button>
          </div>
        </div>

        {/* 导入备份 */}
        <div className="settings-item">
          <div className="settings-item__info">
            <span className="settings-item__label">导入备份</span>
            <span className="settings-item__desc">从 .db 文件恢复数据（会覆盖当前数据，应用将自动重启）</span>
          </div>
          <div className="settings-item__control">
            <button
              className="settings-btn"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? '导入中...' : '导入备份'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Settings
