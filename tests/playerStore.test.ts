/**
 * playerStore 测试
 * 覆盖：nextTrack/prevTrack 切歌逻辑、播放模式循环、音量边界、togglePlayMode
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePlayerStore, togglePlayMode } from '../src/stores/playerStore'
import { useUIStore } from '../src/stores/uiStore'
import { currentTimeRef } from '../src/utils/currentTimeRef'
import { DEFAULT_FEATURE_FLAGS } from '../src/utils/featureFlags'
import type { Track } from '../src/types'

// 模拟 window.electronAPI（invoke 用于记录播放历史）
const invokeMock = vi.fn(async () => null)
window.electronAPI = {
  ...window.electronAPI,
  invoke: invokeMock,
}

// 测试用歌曲数据
const songs: Track[] = [
  { id: 1, filePath: '/a.mp3', fileName: 'a.mp3', title: '歌曲A', artist: '歌手1', album: '专辑1', duration: 180, coverPath: null, mtime: 0, playCount: 0, createdAt: '' },
  { id: 2, filePath: '/b.mp3', fileName: 'b.mp3', title: '歌曲B', artist: '歌手2', album: '专辑2', duration: 200, coverPath: null, mtime: 0, playCount: 0, createdAt: '' },
  { id: 3, filePath: '/c.mp3', fileName: 'c.mp3', title: '歌曲C', artist: '歌手3', album: '专辑3', duration: 220, coverPath: null, mtime: 0, playCount: 0, createdAt: '' },
]

describe('playerStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.electronAPI.invoke = invokeMock
    useUIStore.setState({ featureFlags: { ...DEFAULT_FEATURE_FLAGS } })
    // 重置 store 到初始状态
    usePlayerStore.setState({
      isPlaying: false,
      currentTrack: null,
      playlist: [],
      volume: 0.8,
      playMode: 'sequential',
      fadeEnabled: true,
      lyricOffset: 0,
      duration: 0,
      seekTime: null,
    })
    currentTimeRef.current = 0
  })

  // --- 统一播放入口 ---
  describe('playTrack', () => {
    it('播放歌曲时应该原子更新播放状态并重置时间', () => {
      currentTimeRef.current = 123

      usePlayerStore.getState().playTrack(songs[1])

      expect(usePlayerStore.getState()).toMatchObject({
        currentTrack: songs[1],
        duration: songs[1].duration,
        isPlaying: true,
      })
      expect(currentTimeRef.current).toBe(0)
    })

    it('播放歌曲且 recent=true 时应该各记录一次播放历史和次数', () => {
      usePlayerStore.getState().playTrack(songs[1])

      expect(invokeMock.mock.calls.filter(([channel]) => channel === 'songs:recordPlay')).toEqual([
        ['songs:recordPlay', { songId: songs[1].id }],
      ])
      expect(invokeMock.mock.calls.filter(([channel]) => channel === 'songs:updatePlayCount')).toEqual([
        ['songs:updatePlayCount', { songId: songs[1].id }],
      ])
    })

    it('播放歌曲且 recent=false 时应该只更新播放次数', () => {
      useUIStore.setState({
        featureFlags: { ...DEFAULT_FEATURE_FLAGS, recent: false },
      })

      usePlayerStore.getState().playTrack(songs[1])

      expect(invokeMock).not.toHaveBeenCalledWith('songs:recordPlay', { songId: songs[1].id })
      expect(invokeMock).toHaveBeenCalledTimes(1)
      expect(invokeMock).toHaveBeenCalledWith('songs:updatePlayCount', { songId: songs[1].id })
    })

    it('关闭播放功能时应该保持状态且不产生记账', () => {
      useUIStore.setState({
        featureFlags: { ...DEFAULT_FEATURE_FLAGS, playback: false },
      })
      usePlayerStore.setState({
        currentTrack: songs[0],
        duration: songs[0].duration,
        isPlaying: false,
      })
      currentTimeRef.current = 88

      usePlayerStore.getState().playTrack(songs[1])

      expect(usePlayerStore.getState()).toMatchObject({
        currentTrack: songs[0],
        duration: songs[0].duration,
        isPlaying: false,
      })
      expect(currentTimeRef.current).toBe(88)
      expect(invokeMock).not.toHaveBeenCalled()
    })
  })

  // --- 音量边界 ---
  describe('setVolume', () => {
    it('正常音量设置', () => {
      usePlayerStore.getState().setVolume(0.5)
      expect(usePlayerStore.getState().volume).toBe(0.5)
    })

    it('音量上限为 1', () => {
      usePlayerStore.getState().setVolume(1.5)
      expect(usePlayerStore.getState().volume).toBe(1)
    })

    it('音量下限为 0', () => {
      usePlayerStore.getState().setVolume(-0.5)
      expect(usePlayerStore.getState().volume).toBe(0)
    })

    it('音量 0 是合法值', () => {
      usePlayerStore.getState().setVolume(0)
      expect(usePlayerStore.getState().volume).toBe(0)
    })

    it('音量 1 是合法值', () => {
      usePlayerStore.getState().setVolume(1)
      expect(usePlayerStore.getState().volume).toBe(1)
    })
  })

  // --- setCurrentTrack 使用歌曲库时长 ---
  describe('setCurrentTrack', () => {
    it('设置当前歌曲时先使用曲库 duration', () => {
      usePlayerStore.setState({ duration: 999 })
      usePlayerStore.getState().setCurrentTrack(songs[0])
      expect(usePlayerStore.getState().duration).toBe(180)
    })

    it('设置当前歌曲时重置共享播放时间', () => {
      currentTimeRef.current = 123
      usePlayerStore.getState().setCurrentTrack(songs[0])
      expect(currentTimeRef.current).toBe(0)
    })

    it('设置 null 清空当前歌曲', () => {
      usePlayerStore.setState({ currentTrack: songs[0] })
      usePlayerStore.getState().setCurrentTrack(null)
      expect(usePlayerStore.getState().currentTrack).toBeNull()
    })
  })

  // --- nextTrack 顺序播放 ---
  describe('nextTrack（顺序播放）', () => {
    it('播放列表为空时不崩溃', () => {
      usePlayerStore.setState({ playlist: [], currentTrack: null, playMode: 'sequential' })
      usePlayerStore.getState().nextTrack()
      expect(usePlayerStore.getState().currentTrack).toBeNull()
    })

    it('无当前歌曲时不切换', () => {
      usePlayerStore.setState({ playlist: songs, currentTrack: null, playMode: 'sequential' })
      usePlayerStore.getState().nextTrack()
      expect(usePlayerStore.getState().currentTrack).toBeNull()
    })

    it('顺序播放：A → B', () => {
      usePlayerStore.setState({ playlist: songs, currentTrack: songs[0], playMode: 'sequential' })
      usePlayerStore.getState().nextTrack()
      expect(usePlayerStore.getState().currentTrack?.id).toBe(2)
    })

    it('顺序播放：最后一首 → 回到第一首', () => {
      usePlayerStore.setState({ playlist: songs, currentTrack: songs[2], playMode: 'sequential' })
      usePlayerStore.getState().nextTrack()
      expect(usePlayerStore.getState().currentTrack?.id).toBe(1)
    })

    it('切歌后自动播放', () => {
      usePlayerStore.setState({ playlist: songs, currentTrack: songs[0], isPlaying: false, playMode: 'sequential' })
      usePlayerStore.getState().nextTrack()
      expect(usePlayerStore.getState().isPlaying).toBe(true)
    })

    it('切歌后先使用下一首的曲库 duration', () => {
      usePlayerStore.setState({ playlist: songs, currentTrack: songs[0], duration: 180, playMode: 'sequential' })
      usePlayerStore.getState().nextTrack()
      expect(usePlayerStore.getState().duration).toBe(200)
    })
  })

  // --- prevTrack 顺序播放 ---
  describe('prevTrack（顺序播放）', () => {
    it('顺序播放：B → A', () => {
      usePlayerStore.setState({ playlist: songs, currentTrack: songs[1], playMode: 'sequential' })
      usePlayerStore.getState().prevTrack()
      expect(usePlayerStore.getState().currentTrack?.id).toBe(1)
    })

    it('顺序播放：第一首 → 回到最后一首', () => {
      usePlayerStore.setState({ playlist: songs, currentTrack: songs[0], playMode: 'sequential' })
      usePlayerStore.getState().prevTrack()
      expect(usePlayerStore.getState().currentTrack?.id).toBe(3)
    })
  })

  // --- 单曲循环 ---
  describe('nextTrack（单曲循环）', () => {
    it('单曲循环：切到下一首（不是重复当前）', () => {
      usePlayerStore.setState({ playlist: songs, currentTrack: songs[0], playMode: 'loop' })
      usePlayerStore.getState().nextTrack()
      // loop 模式走的是 sequential 分支，下一首是 B
      expect(usePlayerStore.getState().currentTrack?.id).toBe(2)
    })
  })

  // --- 随机播放 ---
  describe('nextTrack（随机播放）', () => {
    it('随机播放：切到不同歌曲', () => {
      usePlayerStore.setState({ playlist: songs, currentTrack: songs[0], playMode: 'shuffle' })
      usePlayerStore.getState().nextTrack()
      const newId = usePlayerStore.getState().currentTrack?.id
      // 随机播放一定不切回自己（playlist.length > 1 时）
      expect(newId).not.toBe(1)
      expect([2, 3]).toContain(newId)
    })

    it('随机播放：只有一首时不切换', () => {
      usePlayerStore.setState({ playlist: [songs[0]], currentTrack: songs[0], playMode: 'shuffle' })
      usePlayerStore.getState().nextTrack()
      expect(usePlayerStore.getState().currentTrack?.id).toBe(1)
    })
  })

  // --- togglePlayMode ---
  describe('togglePlayMode', () => {
    it('sequential → loop', () => {
      expect(togglePlayMode('sequential')).toBe('loop')
    })

    it('loop → shuffle', () => {
      expect(togglePlayMode('loop')).toBe('shuffle')
    })

    it('shuffle → sequential', () => {
      expect(togglePlayMode('shuffle')).toBe('sequential')
    })
  })
})
