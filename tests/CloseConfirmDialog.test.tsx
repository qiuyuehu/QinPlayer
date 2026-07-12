import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CloseConfirmDialog from '../src/components/CloseConfirmDialog'

describe('CloseConfirmDialog', () => {
  const onRespond = vi.fn()

  beforeEach(() => onRespond.mockReset())

  it('渲染两个决定按钮和不再询问复选框', () => {
    render(<CloseConfirmDialog requestId="one" onRespond={onRespond} />)
    expect(screen.getByRole('dialog', { name: '关闭 QinPlayer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最小化到托盘' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退出' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '不再询问' })).not.toBeChecked()
  })

  it('勾选后返回带 requestId 的决定且只响应一次', () => {
    render(<CloseConfirmDialog requestId="one" onRespond={onRespond} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '不再询问' }))
    const button = screen.getByRole('button', { name: '退出' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onRespond).toHaveBeenCalledTimes(1)
    expect(onRespond).toHaveBeenCalledWith({ requestId: 'one', decision: 'exit', remember: true })
  })

  it('Escape 返回 cancel，overlay 点击不关闭', () => {
    const view = render(<CloseConfirmDialog requestId="one" onRespond={onRespond} />)
    fireEvent.click(view.container.querySelector('.close-dialog-overlay')!)
    expect(onRespond).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onRespond).toHaveBeenCalledWith({ requestId: 'one', decision: 'cancel', remember: false })
  })
})
