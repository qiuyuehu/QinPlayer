/**
 * electron-builder afterPack 钩子
 * 打包完成后用 rcedit 给 exe 嵌入图标
 */
const { execSync } = require('child_process')
const path = require('path')

exports.default = async function(context) {
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  // 从 electron-builder 配置中获取图标路径
  const iconPath = path.join(process.cwd(), 'assets', 'icon.ico')
  
  console.log(`[afterPack] 嵌入图标: ${iconPath} -> ${exePath}`)
  
  try {
    // 使用 electron-builder 缓存的 rcedit
    const rceditPath = path.join(
      process.env.LOCALAPPDATA || '',
      'electron-builder',
      'Cache',
      'winCodeSign',
      '140839383',
      'rcedit-x64.exe'
    )
    
    execSync(`"${rceditPath}" "${exePath}" --set-icon "${iconPath}"`, {
      stdio: 'inherit'
    })
    console.log('[afterPack] 图标嵌入成功')
  } catch (err) {
    console.error('[afterPack] 图标嵌入失败:', err.message)
  }
}
