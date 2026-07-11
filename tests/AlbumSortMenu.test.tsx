/**
 * AlbumSortMenu 交互测试
 * 覆盖受控状态、菜单语义、焦点、键盘导航和监听清理
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AlbumSortMenu from '../src/components/AlbumSortMenu'
import type { AlbumSortBy } from '../src/utils/albumSort'
import type { SortOrder } from '../src/types'

interface RenderMenuOptions {
  sortBy?: AlbumSortBy
  sortOrder?: SortOrder
}

const onSortByChange = vi.fn()
const onSortOrderChange = vi.fn()

function renderMenu({ sortBy = 'name', sortOrder = 'asc' }: RenderMenuOptions = {}) {
  return render(
    <AlbumSortMenu
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSortByChange={onSortByChange}
      onSortOrderChange={onSortOrderChange}
    />,
  )
}

function trigger(): HTMLButtonElement {
  return screen.getByRole('button', { name: /排序：/ })
}

function menuItems(): HTMLElement[] {
  return screen.getAllByRole('menuitemradio')
}

describe('AlbumSortMenu', () => {
  beforeEach(() => {
    onSortByChange.mockReset()
    onSortOrderChange.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('默认应该关闭并显示当前排序摘要', () => {
    renderMenu()

    expect(trigger()).toHaveTextContent('排序：专辑名 · 升序')
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu', { name: '专辑排序' })).not.toBeInTheDocument()
  })

  it.each([
    ['点击', () => fireEvent.click(trigger())],
    ['Enter', () => fireEvent.keyDown(trigger(), { key: 'Enter' })],
    ['Space', () => fireEvent.keyDown(trigger(), { key: ' ' })],
    ['ArrowDown', () => fireEvent.keyDown(trigger(), { key: 'ArrowDown' })],
  ])('%s 应该打开菜单并聚焦当前字段', async (_label, open) => {
    renderMenu()

    open()

    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: '专辑排序' })).toBeInTheDocument()
    expect(menuItems()).toHaveLength(4)
    await waitFor(() => expect(screen.getByRole('menuitemradio', { name: '专辑名' })).toHaveFocus())
  })

  it('字段组和方向组应该各自只有一个选中项', () => {
    renderMenu()
    fireEvent.click(trigger())

    const fieldGroup = screen.getByRole('group', { name: '排序字段' })
    const orderGroup = screen.getByRole('group', { name: '排序方向' })
    expect(fieldGroup.querySelectorAll('[aria-checked="true"]')).toHaveLength(1)
    expect(orderGroup.querySelectorAll('[aria-checked="true"]')).toHaveLength(1)
    expect(screen.getByRole('menuitemradio', { name: '专辑名' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: '升序' })).toHaveAttribute('aria-checked', 'true')
  })

  it('选择歌手应该只通知一次、关闭菜单并回焦触发器', async () => {
    renderMenu()
    fireEvent.click(trigger())

    fireEvent.click(screen.getByRole('menuitemradio', { name: '歌手' }))

    expect(onSortByChange).toHaveBeenCalledTimes(1)
    expect(onSortByChange).toHaveBeenCalledWith('artist')
    expect(onSortOrderChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger()).toHaveFocus())
  })

  it('选择降序应该只通知一次、关闭菜单并回焦触发器', async () => {
    renderMenu()
    fireEvent.click(trigger())

    fireEvent.click(screen.getByRole('menuitemradio', { name: '降序' }))

    expect(onSortOrderChange).toHaveBeenCalledTimes(1)
    expect(onSortOrderChange).toHaveBeenCalledWith('desc')
    expect(onSortByChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger()).toHaveFocus())
  })

  it('受控 props 更新后摘要和两组选中态应该同步变化', () => {
    const view = renderMenu()

    view.rerender(
      <AlbumSortMenu
        sortBy="artist"
        sortOrder="desc"
        onSortByChange={onSortByChange}
        onSortOrderChange={onSortOrderChange}
      />,
    )
    expect(trigger()).toHaveTextContent('排序：歌手 · 降序')

    fireEvent.click(trigger())
    expect(screen.getByRole('menuitemradio', { name: '歌手' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: '降序' })).toHaveAttribute('aria-checked', 'true')
  })

  it('Escape 应该关闭菜单、回焦且不触发排序', async () => {
    renderMenu()
    fireEvent.click(trigger())

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onSortByChange).not.toHaveBeenCalled()
    expect(onSortOrderChange).not.toHaveBeenCalled()
    await waitFor(() => expect(trigger()).toHaveFocus())
  })

  it('外部 pointerdown 应该关闭菜单但不触发排序', () => {
    render(
      <div>
        <button type="button">外部按钮</button>
        <AlbumSortMenu
          sortBy="name"
          sortOrder="asc"
          onSortByChange={onSortByChange}
          onSortOrderChange={onSortOrderChange}
        />
      </div>,
    )
    fireEvent.click(trigger())

    fireEvent.pointerDown(screen.getByRole('button', { name: '外部按钮' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onSortByChange).not.toHaveBeenCalled()
    expect(onSortOrderChange).not.toHaveBeenCalled()
  })

  it('方向键、Home 和 End 应该在四个选项间循环移动焦点', async () => {
    renderMenu()
    fireEvent.click(trigger())
    await waitFor(() => expect(menuItems()[0]).toHaveFocus())

    fireEvent.keyDown(menuItems()[0], { key: 'ArrowDown' })
    expect(menuItems()[1]).toHaveFocus()
    fireEvent.keyDown(menuItems()[1], { key: 'End' })
    expect(menuItems()[3]).toHaveFocus()
    fireEvent.keyDown(menuItems()[3], { key: 'ArrowDown' })
    expect(menuItems()[0]).toHaveFocus()
    fireEvent.keyDown(menuItems()[0], { key: 'ArrowUp' })
    expect(menuItems()[3]).toHaveFocus()
    fireEvent.keyDown(menuItems()[3], { key: 'Home' })
    expect(menuItems()[0]).toHaveFocus()
  })

  it('Tab 应该关闭菜单并让焦点移动到菜单后的控件', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <AlbumSortMenu
          sortBy="name"
          sortOrder="asc"
          onSortByChange={onSortByChange}
          onSortOrderChange={onSortOrderChange}
        />
        <button type="button">后续按钮</button>
      </div>,
    )
    fireEvent.click(trigger())
    await waitFor(() => expect(menuItems()[0]).toHaveFocus())

    await user.tab()

    expect(screen.getByRole('button', { name: '后续按钮' })).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('卸载时应该清理 document 上的菜单监听', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const view = renderMenu()
    fireEvent.click(trigger())
    const pointerHandler = addSpy.mock.calls.findLast(([type]) => type === 'pointerdown')?.[1]
    const keyHandler = addSpy.mock.calls.findLast(([type]) => type === 'keydown')?.[1]
    const focusHandler = addSpy.mock.calls.findLast(([type]) => type === 'focusin')?.[1]

    view.unmount()

    expect(pointerHandler).toBeDefined()
    expect(keyHandler).toBeDefined()
    expect(focusHandler).toBeDefined()
    expect(removeSpy).toHaveBeenCalledWith('pointerdown', pointerHandler)
    expect(removeSpy).toHaveBeenCalledWith('keydown', keyHandler)
    expect(removeSpy).toHaveBeenCalledWith('focusin', focusHandler)
  })
})
