// =============================================================================
// QinPlayer — Mini 菜单独立 Renderer 入口
// =============================================================================

import ReactDOM from 'react-dom/client'
import MiniContextMenu from './components/MiniContextMenu'
import './styles/mini-context-menu.css'

async function bootstrap(): Promise<void> {
  const init = await window.contextMenuAPI.getInit()
  if (!init) return

  document.documentElement.dataset.theme = init.theme
  document.documentElement.dataset.reducedMotion = String(init.reducedMotion)

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <MiniContextMenu entries={init.entries} onResolve={(action) => void window.contextMenuAPI.resolve(action)} />,
  )
  queueMicrotask(() => void window.contextMenuAPI.ready())
}

void bootstrap()
