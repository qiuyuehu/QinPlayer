import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import AppErrorBoundary from '../src/components/AppErrorBoundary'

function CrashingChild(): never {
  throw new Error('renderer secret C:\\Users\\test\\music.mp3')
}

function interceptExpectedRenderError(): { consoleError: ReturnType<typeof vi.spyOn>; restore: () => void } {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const preventWindowError = (event: ErrorEvent) => event.preventDefault()
  window.addEventListener('error', preventWindowError)
  return {
    consoleError,
    restore: () => window.removeEventListener('error', preventWindowError),
  }
}

describe('AppErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('子组件正常时原样渲染', () => {
    render(
      <AppErrorBoundary>
        <p>应用内容</p>
      </AppErrorBoundary>,
    )

    expect(screen.getByText('应用内容')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('子组件 render 抛错时显示安全的中文恢复页', () => {
    const expectedError = interceptExpectedRenderError()

    render(
      <AppErrorBoundary>
        <section>
          <p>崩溃子树内容</p>
          <CrashingChild />
        </section>
      </AppErrorBoundary>,
    )

    const fallback = screen.getByRole('alert')
    expect(fallback).toHaveTextContent('页面出现问题')
    expect(screen.queryByText('崩溃子树内容')).not.toBeInTheDocument()
    expect(fallback).not.toHaveTextContent('renderer secret')
    expect(fallback).not.toHaveTextContent('C:\\Users\\test')
    expect(fallback).not.toHaveTextContent('CrashingChild')
    expect(expectedError.consoleError).toHaveBeenCalled()
    expectedError.restore()
  })

  it('点击重新加载只调用一次注入的恢复回调', () => {
    const expectedError = interceptExpectedRenderError()
    const onRetry = vi.fn()

    render(
      <AppErrorBoundary onRetry={onRetry}>
        <CrashingChild />
      </AppErrorBoundary>,
    )

    const retry = screen.getByRole('button', { name: '重新加载' })
    expect(retry).toHaveFocus()
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expectedError.restore()
  })

  it('恢复按钮在默认和 hover 状态使用高对比主题色组合', () => {
    const css = readFileSync('src/styles/error-boundary.css', 'utf8')

    expect(css).toMatch(/\.app-error-boundary__retry\s*\{[\s\S]*color:\s*var\(--text-primary\);[\s\S]*background:\s*var\(--bg-secondary\);/)
    expect(css).toMatch(/\.app-error-boundary__retry:hover\s*\{[\s\S]*background:\s*var\(--bg-tertiary\);/)
    expect(css).not.toMatch(/\.app-error-boundary__retry\s*\{[\s\S]*color:\s*var\(--text-on-accent\);/)
  })
})
