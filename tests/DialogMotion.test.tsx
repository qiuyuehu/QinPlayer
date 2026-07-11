import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CreatePlaylistDialog from '../src/components/CreatePlaylistDialog'
import SongInfoDialog from '../src/components/SongInfoDialog'
import type { Track } from '../src/types'

function deferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const track: Track = {
  id: 1, filePath: 'C:\\music\\song.mp3', fileName: 'song.mp3', title: 'Song',
  artist: 'Artist', album: 'Album', duration: 120, coverPath: null, mtime: 0,
  playCount: 0, createdAt: '2026-07-11',
}

describe('dialog motion', () => {
  beforeEach(() => document.documentElement.removeAttribute('data-reduced-motion'))
  afterEach(() => document.documentElement.removeAttribute('data-reduced-motion'))

  it('guards pending create, then exits once after resolve', async () => {
    const pending = deferred()
    const onConfirm = vi.fn(() => pending.promise)
    const onCancel = vi.fn()
    const { container } = render(<CreatePlaylistDialog onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('输入歌单名称'), { target: { value: '新歌单' } })
    fireEvent.click(screen.getByText('创建'))
    fireEvent.click(screen.getByText('创建'))
    fireEvent.click(screen.getByText('取消'))
    fireEvent.click(container.querySelector('.dialog-overlay')!)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByText('创建')).toBeDisabled()
    expect(screen.getByText('取消')).toBeDisabled()

    await act(async () => pending.resolve())
    expect(container.querySelector('.dialog-overlay')).toHaveClass('dialog-overlay--exit')
    fireEvent.animationEnd(container.querySelector('.dialog-overlay')!)
    fireEvent.animationEnd(container.querySelector('.dialog-overlay')!)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps the create dialog open and restores controls after rejection', async () => {
    const pending = deferred()
    const onCancel = vi.fn()
    render(<CreatePlaylistDialog onConfirm={() => pending.promise} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('输入歌单名称'), { target: { value: '失败歌单' } })
    fireEvent.click(screen.getByText('创建'))
    await act(async () => pending.reject(new Error('create failed')))
    expect(screen.getByText('新建歌单')).toBeInTheDocument()
    expect(screen.getByText('创建')).not.toBeDisabled()
    expect(screen.getByText('取消')).not.toBeDisabled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('routes SongInfo close through the root exit animation', () => {
    const onClose = vi.fn()
    const { container } = render(<SongInfoDialog track={track} onClose={onClose} />)
    fireEvent.click(screen.getByText('关闭'))
    expect(onClose).not.toHaveBeenCalled()
    expect(container.querySelector('.dialog-overlay')).toHaveClass('dialog-overlay--exit')
    fireEvent.animationEnd(container.querySelector('.dialog-overlay')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
