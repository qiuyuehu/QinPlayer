export type ProtocolMethod = 'GET' | 'HEAD'

export type ProtocolResourceRequest =
  | { kind: 'audio'; songId: number }
  | { kind: 'cover'; songId: number }
  | { kind: 'avatar' }

export type ProtocolRequestResult =
  | { ok: true; method: ProtocolMethod; resource: ProtocolResourceRequest }
  | { ok: false; status: 400 | 404 | 405 }

export interface ByteRangePlan {
  ok: true
  partial: boolean
  start: number
  end: number
  length: number
}

export type ByteRangeResult = ByteRangePlan | { ok: false; status: 416 }

function parsePositiveSongId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const songId = Number(value)
  return Number.isSafeInteger(songId) && songId > 0 ? songId : null
}

export function parseProtocolRequest(request: { url: string; method: string }): ProtocolRequestResult {
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return { ok: false, status: 405 }

  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return { ok: false, status: 400 }
  }
  if (url.protocol !== 'qinplayer:') return { ok: false, status: 400 }
  if (url.username || url.password || url.port || url.pathname) return { ok: false, status: 400 }
  const keys = [...url.searchParams.keys()]
  if (keys.some((key) => key !== 'id' && key !== 'v')) return { ok: false, status: 400 }
  if (url.searchParams.getAll('id').length !== 1 || url.searchParams.getAll('v').length > 1) {
    return { ok: false, status: 400 }
  }

  const normalizedMethod = method as ProtocolMethod
  if (url.hostname === 'avatar') {
    return url.searchParams.get('id') === 'current'
      ? { ok: true, method: normalizedMethod, resource: { kind: 'avatar' } }
      : { ok: false, status: 400 }
  }
  if (url.hostname !== 'audio' && url.hostname !== 'cover') return { ok: false, status: 404 }
  const songId = parsePositiveSongId(url.searchParams.get('id'))
  if (songId === null) return { ok: false, status: 400 }
  return {
    ok: true,
    method: normalizedMethod,
    resource: { kind: url.hostname, songId },
  }
}

function parseSafeInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function resolveByteRange(rangeHeader: string | null, size: number): ByteRangeResult {
  if (!Number.isSafeInteger(size) || size < 0) return { ok: false, status: 416 }
  if (rangeHeader === null) {
    return { ok: true, partial: false, start: 0, end: size - 1, length: size }
  }
  if (size === 0 || rangeHeader.includes(',')) return { ok: false, status: 416 }

  let match = /^bytes=(\d+)-(\d+)$/.exec(rangeHeader)
  if (match) {
    const start = parseSafeInteger(match[1])
    const end = parseSafeInteger(match[2])
    if (start === null || end === null || start > end || end >= size) return { ok: false, status: 416 }
    return { ok: true, partial: true, start, end, length: end - start + 1 }
  }

  match = /^bytes=(\d+)-$/.exec(rangeHeader)
  if (match) {
    const start = parseSafeInteger(match[1])
    if (start === null || start >= size) return { ok: false, status: 416 }
    return { ok: true, partial: true, start, end: size - 1, length: size - start }
  }

  match = /^bytes=-(\d+)$/.exec(rangeHeader)
  if (match) {
    const suffixLength = parseSafeInteger(match[1])
    if (suffixLength === null || suffixLength < 1 || suffixLength > size) {
      return { ok: false, status: 416 }
    }
    return {
      ok: true,
      partial: true,
      start: size - suffixLength,
      end: size - 1,
      length: suffixLength,
    }
  }

  return { ok: false, status: 416 }
}
