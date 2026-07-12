import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SortMenu from '../src/components/SortMenu'
import type { SortOrder } from '../src/types'

type Field = 'title' | 'artist' | 'playCount'
const fields = [
  { value: 'title', label: '歌名' },
  { value: 'artist', label: '歌手' },
  { value: 'playCount', label: '播放次数' },
] as const
const onField = vi.fn()
const onOrder = vi.fn()

function renderMenu(sortBy: Field = 'title', sortOrder: SortOrder = 'asc') {
  return render(
    <SortMenu
      fields={fields}
      sortBy={sortBy}
      sortOrder={sortOrder}
      ariaLabel="歌曲排序"
      onSortByChange={onField}
      onSortOrderChange={onOrder}
    />,
  )
}

describe('SortMenu', () => {
  beforeEach(() => {
    onField.mockReset()
    onOrder.mockReset()
  })

  it('根据动态字段显示摘要和菜单语义', () => {
    renderMenu('playCount', 'desc')
    fireEvent.click(screen.getByRole('button', { name: '播放次数 · 降序' }))

    expect(screen.getByRole('menu', { name: '歌曲排序' })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(5)
  })

  it('多实例生成唯一 popup id', () => {
    render(
      <>
        <SortMenu fields={fields} sortBy="title" sortOrder="asc" ariaLabel="甲" onSortByChange={onField} onSortOrderChange={onOrder} />
        <SortMenu fields={fields} sortBy="artist" sortOrder="desc" ariaLabel="乙" onSortByChange={onField} onSortOrderChange={onOrder} />
      </>,
    )
    const triggers = screen.getAllByRole('button')

    expect(triggers[0].getAttribute('aria-controls')).not.toBe(triggers[1].getAttribute('aria-controls'))
  })

  it('打开后聚焦当前字段，非法值回退第一项', async () => {
    const view = renderMenu('artist')
    fireEvent.click(screen.getByRole('button', { name: '歌手 · 升序' }))
    await waitFor(() => expect(screen.getByRole('menuitemradio', { name: '歌手' })).toHaveFocus())

    view.rerender(
      <SortMenu fields={fields} sortBy={'invalid' as Field} sortOrder="asc" ariaLabel="歌曲排序" onSortByChange={onField} onSortOrderChange={onOrder} />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '歌名 · 升序' }))
    await waitFor(() => expect(screen.getByRole('menuitemradio', { name: '歌名' })).toHaveFocus())
  })

  it('选择动态字段并回焦触发器', async () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: '歌名 · 升序' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitemradio', { name: '播放次数' }))

    expect(onField).toHaveBeenCalledWith('playCount')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('支持方向键、Home、End、Escape 和 Tab', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SortMenu fields={fields} sortBy="title" sortOrder="asc" ariaLabel="歌曲排序" onSortByChange={onField} onSortOrderChange={onOrder} />
        <button type="button">后续</button>
      </>,
    )
    const trigger = screen.getByRole('button', { name: '歌名 · 升序' })
    fireEvent.click(trigger)
    const items = screen.getAllByRole('menuitemradio')
    await waitFor(() => expect(items[0]).toHaveFocus())
    fireEvent.keyDown(items[0], { key: 'End' })
    expect(items[4]).toHaveFocus()
    fireEvent.keyDown(items[4], { key: 'Home' })
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0], { key: 'ArrowUp' })
    expect(items[4]).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
    fireEvent.click(trigger)
    await user.tab()
    expect(screen.getByRole('button', { name: '后续' })).toHaveFocus()
  })
})
