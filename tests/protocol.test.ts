import { describe, expect, it, vi } from 'vitest'

import { createProtocolHandler, type ProtocolHandlerDependencies } from '../electron/ipc/protocol'

function createFixture(overrides: Partial<ProtocolHandlerDependencies> = {}) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.close()
    },
  })
  const dependencies: ProtocolHandlerDependencies = {
    resolveResource: vi.fn(async () => ({ filePath: 'C:\\Music\\song.mp3', contentType: 'audio/mpeg' })),
    stat: vi.fn(async () => ({ size: 10, isFile: () => true })),
    createReadStream: vi.fn(async () => stream),
    logError: vi.fn(),
    ...overrides,
  }
  return { dependencies, handler: createProtocolHandler(dependencies) }
}

describe('qinplayer protocol handler', () => {
  it('旧 path、未知 host 和非 GET/HEAD 不访问 repository 或 stream', async () => {
    const { dependencies, handler } = createFixture()
    for (const request of [
      new Request(`qinplayer://audio?${'path'}=C%3A%5Csecret.txt`),
      new Request('qinplayer://unknown?id=1'),
      new Request('qinplayer://audio?id=1', { method: 'POST' }),
    ]) {
      const response = await handler(request)
      expect([400, 404, 405]).toContain(response.status)
    }
    expect(dependencies.resolveResource).not.toHaveBeenCalled()
    expect(dependencies.createReadStream).not.toHaveBeenCalled()
  })

  it('未知 id 或非普通文件返回不泄露路径的 404', async () => {
    const missing = createFixture({ resolveResource: vi.fn(async () => null) })
    const missingResponse = await missing.handler(new Request('qinplayer://audio?id=999'))
    expect(missingResponse.status).toBe(404)
    expect(await missingResponse.text()).toBe('Not Found')
    expect(missing.dependencies.stat).not.toHaveBeenCalled()

    const directory = createFixture({ stat: vi.fn(async () => ({ size: 10, isFile: () => false })) })
    expect((await directory.handler(new Request('qinplayer://audio?id=1'))).status).toBe(404)
    expect(directory.dependencies.createReadStream).not.toHaveBeenCalled()
  })

  it('完整 GET 返回准确 headers 并创建无 range stream', async () => {
    const { dependencies, handler } = createFixture()
    const response = await handler(new Request('qinplayer://audio?id=1&v=100'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Length')).toBe('10')
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(dependencies.resolveResource).toHaveBeenCalledWith({ kind: 'audio', songId: 1 })
    expect(dependencies.createReadStream).toHaveBeenCalledWith('C:\\Music\\song.mp3', undefined)
  })

  it('合法单段 Range 返回 206 和准确边界', async () => {
    const { dependencies, handler } = createFixture()
    const response = await handler(new Request('qinplayer://audio?id=1', {
      headers: { Range: 'bytes=2-5' },
    }))

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(dependencies.createReadStream).toHaveBeenCalledWith('C:\\Music\\song.mp3', { start: 2, end: 5 })
  })

  it('越界 Range 返回 416 且绝不创建 stream', async () => {
    const { dependencies, handler } = createFixture()
    const response = await handler(new Request('qinplayer://audio?id=1', {
      headers: { Range: 'bytes=0-10' },
    }))

    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */10')
    expect(dependencies.createReadStream).not.toHaveBeenCalled()
  })

  it('HEAD 与 GET headers 一致但不创建 body stream', async () => {
    const getFixture = createFixture()
    const headFixture = createFixture()
    const getResponse = await getFixture.handler(new Request('qinplayer://cover?id=1'))
    const headResponse = await headFixture.handler(new Request('qinplayer://cover?id=1', { method: 'HEAD' }))

    expect([...headResponse.headers.entries()]).toEqual([...getResponse.headers.entries()])
    expect(headResponse.body).toBeNull()
    expect(headFixture.dependencies.createReadStream).not.toHaveBeenCalled()
  })

  it('HEAD 的 416 响应也没有 body 或 stream', async () => {
    const { dependencies, handler } = createFixture()
    const response = await handler(new Request('qinplayer://audio?id=1', {
      method: 'HEAD',
      headers: { Range: 'bytes=10-' },
    }))

    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */10')
    expect(response.body).toBeNull()
    expect(dependencies.createReadStream).not.toHaveBeenCalled()
  })

  it('stream 打开失败记录错误并返回安全 500', async () => {
    const { dependencies, handler } = createFixture({
      createReadStream: vi.fn(async () => { throw new Error('C:\\secret\\song.mp3 locked') }),
    })
    const response = await handler(new Request('qinplayer://audio?id=1'))

    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Internal Error')
    expect(dependencies.logError).toHaveBeenCalled()
  })

  it('stream 打开后的读取错误只向消费者暴露固定消息', async () => {
    const leakedMessage = 'C:\\secret\\song.mp3 read failed'
    const failingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error(leakedMessage))
      },
    })
    const { dependencies, handler } = createFixture({
      createReadStream: vi.fn(async () => failingStream),
    })
    const response = await handler(new Request('qinplayer://audio?id=1'))

    let exposedError: unknown
    try {
      await response.arrayBuffer()
    } catch (error) {
      exposedError = error
    }

    expect(response.status).toBe(200)
    expect(exposedError).toBeInstanceOf(Error)
    expect((exposedError as Error).message).toBe('Resource stream failed')
    expect(String(exposedError)).not.toContain('C:\\secret')
    expect(dependencies.logError).toHaveBeenCalledWith(
      '[Protocol] 文件流读取失败:',
      expect.objectContaining({ message: leakedMessage }),
    )
  })
})
