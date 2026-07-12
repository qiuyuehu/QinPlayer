import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MyProfile from '../src/pages/MyProfile'
import { usePlayerStore } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { ListeningDay, ListeningRankingEntry } from '../src/types/ipc'
import type { Track } from '../src/types'

const trackerMock = vi.hoisted(() => ({ flush: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../src/utils/listeningTracker', () => ({ listeningTracker: trackerMock }))

const trackA: Track = {
  id: 1,
  filePath: 'C:\\music\\a.mp3',
  fileName: 'a.mp3',
  title: '歌曲 A',
  artist: '歌手 A',
  album: '专辑 A',
  duration: 120,
  coverPath: null,
  mtime: 0,
  playCount: 8,
  createdAt: '2026-07-01',
}
const trackB: Track = { ...trackA, id: 2, title: '歌曲 B', artist: '歌手 B', playCount: 5 }
const ranking: ListeningRankingEntry[] = [
  { track: trackA, playCount: 8 },
  { track: trackB, playCount: 5 },
]
const days: ListeningDay[] = [
  { date: '2026-07-06', seconds: 60 },
  { date: '2026-07-08', seconds: 120 },
  { date: '2026-07-11', seconds: 180 },
  { date: '2026-07-12', seconds: 240 },
]

describe('MyProfile', () => {
  const invokeMock = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 12, 12))
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (channel: string) => {
      if (channel === 'listening:getDays') return days
      if (channel === 'listening:getRanking') return ranking
      return null
    })
    window.electronAPI.invoke = invokeMock
    trackerMock.flush.mockReset().mockResolvedValue(undefined)
    useUIStore.setState({ featureFlags: { ...DEFAULT_FEATURE_FLAGS } })
    usePlayerStore.setState({
      currentTrack: null,
      playlist: [],
      isPlaying: false,
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('应该区分 loading、错误重试和成功状态', async () => {
    let rejectFirst!: (error: Error) => void
    let rejected = false
    invokeMock.mockImplementation(async (channel: string) => {
      if (channel === 'listening:getDays') {
        if (!rejected) {
          rejected = true
          return new Promise((_resolve, reject) => { rejectFirst = reject })
        }
        return days
      }
      if (channel === 'listening:getRanking') return ranking
      return null
    })
    render(<MyProfile />)
    expect(screen.getByText('正在加载听歌统计...')).toBeInTheDocument()

    await waitFor(() => expect(rejectFirst).toBeTypeOf('function'))
    await act(async () => rejectFirst(new Error('load failed')))
    expect(await screen.findByText('听歌统计加载失败')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('秋月')).toBeInTheDocument()
  })

  it('零数据仍应渲染完整统计和空排行榜', async () => {
    invokeMock.mockImplementation(async (channel: string) => {
      if (channel === 'listening:getDays') return []
      if (channel === 'listening:getRanking') return []
      return null
    })
    render(<MyProfile />)

    expect(await screen.findByText('秋月')).toBeInTheDocument()
    expect(screen.getByText('尚无记录')).toBeInTheDocument()
    expect(screen.getByText('0/7')).toBeInTheDocument()
    expect(screen.getAllByText('0 分钟').length).toBeGreaterThanOrEqual(4)
    expect(screen.getByText('暂无播放记录')).toBeInTheDocument()
    expect(document.querySelectorAll('.profile-trend__bar')).toHaveLength(7)
    for (const bar of document.querySelectorAll<HTMLElement>('.profile-trend__bar')) {
      expect(bar.style.height).not.toContain('NaN')
      expect(bar.style.height).not.toContain('Infinity')
    }
  })

  it('应该显示固定昵称、日期、四周期统计、连续天数、活跃环和排行榜', async () => {
    render(<MyProfile />)

    expect(await screen.findByText('秋月')).toBeInTheDocument()
    expect(screen.getByText('自 2026.07.06 开始记录')).toBeInTheDocument()
    expect(screen.getByLabelText('本周活跃 4/7')).toBeInTheDocument()
    expect(screen.getByText('连续 2 天')).toBeInTheDocument()
    expect(screen.getAllByText('10 分钟').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('歌曲 A')).toBeInTheDocument()
    expect(screen.getByText('歌曲 B')).toBeInTheDocument()
    expect(screen.getByText('8 次')).toBeInTheDocument()
    expect(document.querySelectorAll('.profile-trend__bar')).toHaveLength(7)
  })

  it.each(['doubleClick', 'enter'] as const)(
    'playback 开启时应通过 %s 播放排行歌曲并设置 Top 队列',
    async (interaction) => {
      render(<MyProfile />)
      const row = await screen.findByRole('row', { name: /歌曲 B 歌手 B 5 次/ })

      if (interaction === 'doubleClick') fireEvent.doubleClick(row)
      else fireEvent.keyDown(row, { key: 'Enter' })

      expect(usePlayerStore.getState().playlist).toEqual([trackA, trackB])
      expect(usePlayerStore.getState().currentTrack).toEqual(trackB)
    },
  )

  it('playback 关闭时排行榜应该只读', async () => {
    useUIStore.setState({ featureFlags: { ...DEFAULT_FEATURE_FLAGS, playback: false } })
    render(<MyProfile />)
    const row = await screen.findByRole('row', { name: /歌曲 A 歌手 A 8 次/ })

    fireEvent.doubleClick(row)
    fireEvent.keyDown(row, { key: 'Enter' })

    expect(row).not.toHaveAttribute('tabindex')
    expect(usePlayerStore.getState().currentTrack).toBeNull()
  })

  it('刷新必须先 flush，30 秒轮询应清理且旧请求不能覆盖新结果', async () => {
    let resolveFlush!: () => void
    trackerMock.flush.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFlush = resolve }))
    let resolveOldDays!: (value: ListeningDay[]) => void
    let daysRequest = 0
    invokeMock.mockImplementation((channel: string) => {
      if (channel === 'listening:getDays') {
        daysRequest++
        if (daysRequest === 1) {
          return new Promise<ListeningDay[]>((resolve) => { resolveOldDays = resolve })
        }
        return Promise.resolve([{ date: '2026-07-12', seconds: 600 }])
      }
      if (channel === 'listening:getRanking') return Promise.resolve(ranking)
      return Promise.resolve(null)
    })
    const view = render(<MyProfile />)

    expect(invokeMock).not.toHaveBeenCalledWith('listening:getDays')
    await act(async () => resolveFlush())
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('listening:getDays'))

    await act(async () => vi.advanceTimersByTime(30_000))
    expect((await screen.findAllByText('10 分钟')).length).toBeGreaterThan(0)
    await act(async () => resolveOldDays(days))
    expect(screen.getAllByText('10 分钟').length).toBeGreaterThan(0)

    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
