import { protocol } from 'electron'
import { createReadStream as createNodeReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'

import { mediaResourceRepository, type ResolvedMediaResource } from '../db/mediaResourceRepository'
import {
  parseProtocolRequest,
  resolveByteRange,
  type ProtocolResourceRequest,
} from './protocolPolicy'

export interface ProtocolHandlerDependencies {
  resolveResource: (request: ProtocolResourceRequest) => Promise<ResolvedMediaResource | null>
  stat: (path: string) => Promise<{ size: number; isFile(): boolean }>
  createReadStream: (
    path: string,
    range: { start: number; end: number } | undefined,
  ) => Promise<ReadableStream<Uint8Array>>
  logError: (...args: unknown[]) => void
}

function responseText(status: number): string {
  if (status === 404) return 'Not Found'
  if (status === 405) return 'Method Not Allowed'
  if (status === 416) return 'Range Not Satisfiable'
  if (status === 500) return 'Internal Error'
  return 'Bad Request'
}

function sanitizeReadStream(
  source: ReadableStream<Uint8Array>,
  logError: (...args: unknown[]) => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  let terminal = false

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read()
        if (result.done) {
          terminal = true
          controller.close()
          return
        }
        controller.enqueue(result.value)
      } catch (error) {
        if (terminal) return
        terminal = true
        logError('[Protocol] 文件流读取失败:', error)
        controller.error(new Error('Resource stream failed'))
      }
    },
    async cancel(reason) {
      terminal = true
      try {
        await reader.cancel(reason)
      } catch (error) {
        logError('[Protocol] 文件流取消失败:', error)
      }
    },
  })
}

export function createProtocolHandler(dependencies: ProtocolHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const isHead = request.method.toUpperCase() === 'HEAD'
    const safeBody = (body: string): string | null => isHead ? null : body
    const parsed = parseProtocolRequest(request)
    if (!parsed.ok) return new Response(safeBody(responseText(parsed.status)), { status: parsed.status })

    let resource: ResolvedMediaResource | null
    let fileStat: { size: number; isFile(): boolean }
    try {
      resource = await dependencies.resolveResource(parsed.resource)
      if (!resource) return new Response(safeBody('Not Found'), { status: 404 })
      fileStat = await dependencies.stat(resource.filePath)
      if (!fileStat.isFile() || !Number.isSafeInteger(fileStat.size) || fileStat.size < 0) {
        return new Response(safeBody('Not Found'), { status: 404 })
      }
    } catch (error) {
      dependencies.logError('[Protocol] 资源解析失败:', error)
      return new Response(safeBody('Not Found'), { status: 404 })
    }

    const range = resolveByteRange(request.headers.get('range'), fileStat.size)
    if (!range.ok) {
      return new Response(safeBody('Range Not Satisfiable'), {
        status: 416,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes */${fileStat.size}`,
        },
      })
    }

    const headers: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(range.length),
      'Content-Type': resource.contentType,
    }
    if (range.partial) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${fileStat.size}`
    const status = range.partial ? 206 : 200
    if (parsed.method === 'HEAD') return new Response(null, { status, headers })

    try {
      const body = await dependencies.createReadStream(
        resource.filePath,
        range.partial ? { start: range.start, end: range.end } : undefined,
      )
      return new Response(sanitizeReadStream(body, dependencies.logError) as BodyInit, { status, headers })
    } catch (error) {
      dependencies.logError('[Protocol] 文件流打开失败:', error)
      return new Response(safeBody('Internal Error'), { status: 500 })
    }
  }
}

async function openWebReadStream(
  filePath: string,
  range: { start: number; end: number } | undefined,
): Promise<ReadableStream<Uint8Array>> {
  const nodeStream = createNodeReadStream(filePath, range)
  await new Promise<void>((resolve, reject) => {
    const handleOpen = () => {
      nodeStream.removeListener('error', handleInitialError)
      resolve()
    }
    const handleInitialError = (error: Error) => {
      nodeStream.removeListener('open', handleOpen)
      reject(error)
    }
    nodeStream.once('open', handleOpen)
    nodeStream.once('error', handleInitialError)
  })
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>
}

const protocolHandler = createProtocolHandler({
  resolveResource: async (request) => {
    if (request.kind === 'audio') return mediaResourceRepository.resolveAudio(request.songId)
    if (request.kind === 'cover') return mediaResourceRepository.resolveCover(request.songId)
    return mediaResourceRepository.resolveAvatar()
  },
  stat,
  createReadStream: openWebReadStream,
  logError: (...args) => console.error(...args),
})

export function registerProtocol(): void {
  protocol.handle('qinplayer', protocolHandler)
}
