import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MiniContextMenu from '../src/components/MiniContextMenu'
import type { NativeTrackMenuDisplayEntry } from '../src/types/ipc'

const entries: NativeTrackMenuDisplayEntry[] = [
  { action: 'open-location', enabled: true, label: '打开文件所在目录' },
  { action: 'insert-next', enabled: false, label: '下一首播放' },
]

describe('MiniContextMenu', () => {
  it('应该按主进程给出的顺序渲染 label，并禁用不可用动作', () => {
    render(<MiniContextMenu entries={entries} onResolve={vi.fn()} />)

    const play = screen.getByRole('menuitem', { name: '打开文件所在目录' })
    const insertNext = screen.getByRole('menuitem', { name: '下一首播放' })
    expect(play).not.toBeDisabled()
    expect(insertNext).toBeDisabled()
    expect(insertNext).toHaveClass('context-menu__item--disabled')
  })

  it('点击 enabled 项应该回传 action，disabled 项不应该回传', () => {
    const onResolve = vi.fn()
    render(<MiniContextMenu entries={entries} onResolve={onResolve} />)

    fireEvent.click(screen.getByRole('menuitem', { name: '打开文件所在目录' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '下一首播放' }))

    expect(onResolve).toHaveBeenCalledTimes(1)
    expect(onResolve).toHaveBeenCalledWith('open-location')
  })

  it('按 Escape 应该回传 null', () => {
    const onResolve = vi.fn()
    render(<MiniContextMenu entries={entries} onResolve={onResolve} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onResolve).toHaveBeenCalledWith(null)
  })
})
