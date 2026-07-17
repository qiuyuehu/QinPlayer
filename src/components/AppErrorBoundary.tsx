import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
  onRetry?: () => void
}

interface AppErrorBoundaryState {
  hasError: boolean
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    console.error('[AppErrorBoundary] 页面渲染失败，已显示恢复页。')
  }

  private handleRetry = (): void => {
    if (this.props.onRetry) {
      this.props.onRetry()
      return
    }
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="app-error-boundary" role="alert" aria-labelledby="app-error-boundary-title">
        <div className="app-error-boundary__content">
          <p className="app-error-boundary__eyebrow">QinPlayer</p>
          <h1 id="app-error-boundary-title" className="app-error-boundary__title">页面出现问题</h1>
          <p className="app-error-boundary__message">重新加载应用即可继续使用。</p>
          <button
            autoFocus
            type="button"
            className="app-error-boundary__retry"
            onClick={this.handleRetry}
          >
            重新加载
          </button>
        </div>
      </main>
    )
  }
}

export default AppErrorBoundary
