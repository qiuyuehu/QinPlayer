import { describe, expect, it } from 'vitest'

import { parseProtocolRequest, resolveByteRange } from '../electron/ipc/protocolPolicy'

describe('qinplayer protocol request policy', () => {
  it.each([
    ['qinplayer://audio?id=1&v=10', { kind: 'audio', songId: 1 }],
    ['qinplayer://cover?id=9&v=20', { kind: 'cover', songId: 9 }],
    ['qinplayer://avatar?id=current&v=avatar.png', { kind: 'avatar' }],
  ] as const)('解析合法请求 %s', (url, resource) => {
    expect(parseProtocolRequest({ url, method: 'GET' })).toEqual({
      ok: true,
      method: 'GET',
      resource,
    })
  })

  it.each(['POST', 'PUT', 'DELETE'])('%s 返回 405', (method) => {
    expect(parseProtocolRequest({ url: 'qinplayer://audio?id=1', method })).toEqual({ ok: false, status: 405 })
  })

  it.each([
    ['qinplayer://unknown?id=1', 404],
    [`qinplayer://audio?${'path'}=C%3A%5Csecret.txt`, 400],
    ['qinplayer://audio', 400],
    ['qinplayer://audio?id=0', 400],
    ['qinplayer://audio?id=-1', 400],
    ['qinplayer://audio?id=1.5', 400],
    ['qinplayer://audio?id=9007199254740992', 400],
    ['qinplayer://avatar?id=1', 400],
    ['qinplayer://user@audio?id=1', 400],
    ['qinplayer://audio/secret?id=1', 400],
  ] as const)('拒绝非法请求 %s', (url, status) => {
    expect(parseProtocolRequest({ url, method: 'GET' })).toEqual({ ok: false, status })
  })

  it('HEAD 与 GET 都可进入资源解析', () => {
    expect(parseProtocolRequest({ url: 'qinplayer://cover?id=1', method: 'HEAD' })).toMatchObject({
      ok: true,
      method: 'HEAD',
    })
  })
})

describe('single byte range policy', () => {
  it('无 Range 返回完整文件计划', () => {
    expect(resolveByteRange(null, 10)).toEqual({
      ok: true,
      partial: false,
      start: 0,
      end: 9,
      length: 10,
    })
  })

  it.each([
    ['bytes=2-5', 10, { start: 2, end: 5, length: 4 }],
    ['bytes=7-', 10, { start: 7, end: 9, length: 3 }],
    ['bytes=-4', 10, { start: 6, end: 9, length: 4 }],
  ] as const)('解析合法 Range %s', (range, size, expected) => {
    expect(resolveByteRange(range, size)).toEqual({ ok: true, partial: true, ...expected })
  })

  it.each([
    ['bytes=0-10', 10],
    ['bytes=10-', 10],
    ['bytes=-11', 10],
    ['bytes=-0', 10],
    ['bytes=5-4', 10],
    ['bytes=1-2,4-5', 10],
    ['items=1-2', 10],
    ['bytes=abc-def', 10],
    ['bytes=-1-2', 10],
    ['bytes=', 10],
    ['bytes=0-', 0],
    ['bytes=9007199254740992-', 10],
  ] as const)('严格拒绝非法或越界 Range %s', (range, size) => {
    expect(resolveByteRange(range, size)).toEqual({ ok: false, status: 416 })
  })
})
