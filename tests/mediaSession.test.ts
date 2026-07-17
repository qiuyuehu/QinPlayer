import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearMediaSession,
  registerMediaSessionActions,
  updateMediaSession,
} from '../src/utils/mediaSession'
import type { Track } from '../src/types'

function createTrack(id: number, title: string, hasCover = true): Track {
  return {
    id,
    filePath: `C:\\music\\${id}.mp3`,
    fileName: `${id}.mp3`,
    title,
    artist: `Artist ${id}`,
    album: `Album ${id}`,
    duration: 180,
    coverPath: hasCover ? `C:\\music\\${id}.jpg` : null,
    mtime: id,
    playCount: 0,
    createdAt: '2026-07-17',
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function responseFor(label: string): Response {
  return {
    ok: true,
    status: 200,
    blob: vi.fn().mockResolvedValue(new Blob([label], { type: 'image/jpeg' })),
  } as unknown as Response
}

const trackA = createTrack(1, 'A')
const trackB = createTrack(2, 'B')
const fetchMock = vi.fn()
const createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}:${createObjectURL.mock.calls.length}`)
const revokeObjectURL = vi.fn()
const setActionHandler = vi.fn()
const mediaSession = {
  metadata: null as MediaMetadata | null,
  playbackState: 'none' as MediaSessionPlaybackState,
  setActionHandler,
  setPositionState: vi.fn(),
}

class FakeMediaMetadata {
  title: string
  artist: string
  album: string
  artwork: MediaImage[]

  constructor(init: MediaMetadataInit) {
    this.title = init.title ?? ''
    this.artist = init.artist ?? ''
    this.album = init.album ?? ''
    this.artwork = init.artwork ?? []
  }
}

describe('Media Session latest-wins', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('MediaMetadata', FakeMediaMetadata)
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: mediaSession,
    })
    window.electronAPI.getCoverUrl = vi.fn((id: number) => `qinplayer://cover?id=${id}`)
    clearMediaSession()
    mediaSession.metadata = null
    vi.clearAllMocks()
  })

  afterEach(() => {
    clearMediaSession()
    vi.unstubAllGlobals()
  })

  it('A 后请求、B 先完成时最终 metadata 只能是 B', async () => {
    const a = createDeferred<Response>()
    const b = createDeferred<Response>()
    fetchMock.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)

    const updateA = updateMediaSession(trackA)
    const updateB = updateMediaSession(trackB)
    expect(mediaSession.metadata).toMatchObject({ title: 'B', artwork: [] })
    b.resolve(responseFor('B'))
    await updateB
    a.resolve(responseFor('A'))
    await updateA

    expect(mediaSession.metadata).toMatchObject({
      title: 'B',
      artwork: [{ src: expect.stringMatching(/^blob:/) }],
    })
  })

  it('过期 A Blob 应被 revoke，B 有效 Blob 不得被 A revoke', async () => {
    const a = createDeferred<Response>()
    const b = createDeferred<Response>()
    fetchMock.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    const updateA = updateMediaSession(trackA)
    const updateB = updateMediaSession(trackB)

    b.resolve(responseFor('valid-B'))
    await updateB
    const validB = (mediaSession.metadata as unknown as FakeMediaMetadata).artwork[0].src
    a.resolve(responseFor('stale-A'))
    await updateA

    expect(revokeObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalledWith(validB)
  })

  it('pending A 后 clear，A 完成也不能恢复 metadata', async () => {
    const a = createDeferred<Response>()
    fetchMock.mockReturnValueOnce(a.promise)
    const updateA = updateMediaSession(trackA)

    clearMediaSession()
    a.resolve(responseFor('stale-after-clear'))
    await updateA

    expect(mediaSession.metadata).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalled()
  })

  it('最新歌曲无封面时保留文字、清空 artwork 并 revoke 旧 Blob', async () => {
    fetchMock.mockResolvedValueOnce(responseFor('A'))
    await updateMediaSession(trackA)
    const oldBlob = (mediaSession.metadata as unknown as FakeMediaMetadata).artwork[0].src

    await updateMediaSession(createTrack(2, 'B no cover', false))

    expect(mediaSession.metadata).toMatchObject({ title: 'B no cover', artwork: [] })
    expect(revokeObjectURL).toHaveBeenCalledWith(oldBlob)
  })

  it('fetch 失败仍保留最新文字 metadata', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))

    await updateMediaSession(trackB)

    expect(mediaSession.metadata).toMatchObject({ title: 'B', artwork: [] })
  })

  it('AbortError 不应该记录普通 warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))

    await updateMediaSession(trackA)

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('action handlers 应该可对称注销', () => {
    const unregister = registerMediaSessionActions({
      play: vi.fn(),
      pause: vi.fn(),
      prevTrack: vi.fn(),
      nextTrack: vi.fn(),
      seekTo: vi.fn(),
    })

    unregister()

    for (const action of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto']) {
      expect(setActionHandler).toHaveBeenCalledWith(action, null)
    }
  })

  it('单个 action 不受支持时仍应注册其余 handlers 并返回清理函数', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setActionHandler.mockImplementation((action: MediaSessionAction) => {
      if (action === 'seekto') throw new Error('unsupported')
    })

    const unregister = registerMediaSessionActions({
      play: vi.fn(),
      pause: vi.fn(),
      prevTrack: vi.fn(),
      nextTrack: vi.fn(),
      seekTo: vi.fn(),
    })

    expect(setActionHandler).toHaveBeenCalledWith('play', expect.any(Function))
    expect(setActionHandler).toHaveBeenCalledWith('nexttrack', expect.any(Function))
    expect(unregister).toBeTypeOf('function')
    expect(() => unregister()).not.toThrow()
    warn.mockRestore()
  })
})
