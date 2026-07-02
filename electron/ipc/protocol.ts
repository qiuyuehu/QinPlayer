// =============================================================================
// QinPlayer — 自定义协议处理
// =============================================================================
// 职责：拦截 qinplayer:// 协议请求，返回本地音频/封面文件流
// 支持 Range Requests（拖动进度条需要 206 响应）
// =============================================================================

import { protocol } from 'electron'
import * as fs from 'fs'
import { Readable } from 'stream'

/**
 * 注册 qinplayer:// 协议拦截器
 * 在 app.whenReady() 之后调用
 *
 * 用法：
 *   qinplayer://audio?path=xxx  → 返回音频流
 *   qinplayer://cover?path=xxx  → 返回封面图片
 *
 * ⚠️ 使用异步 I/O 避免阻塞主线程
 */
export function registerProtocol(): void {
  protocol.handle('qinplayer', async (request) => {
    try {
      const url = new URL(request.url)
      const filePath = decodeURIComponent(url.searchParams.get('path') || '')
      const host = url.hostname  // 'audio' 或 'cover'

      if (!filePath) {
        console.error('[Protocol] 缺少 path 参数:', request.url)
        return new Response('Not Found', { status: 404 })
      }

      console.log('[Protocol] 请求:', host, '→', filePath)

      // 异步检查文件是否存在（替代 existsSync）
      try {
        await fs.promises.access(filePath, fs.constants.R_OK)
      } catch (accessErr) {
        console.error('[Protocol] 文件不可访问:', filePath, accessErr)
        return new Response('Not Found', { status: 404 })
      }

      // 异步获取文件信息（替代 statSync）
      const stat = await fs.promises.stat(filePath)

      // 根据类型确定 Content-Type
      let contentType: string
      if (host === 'cover') {
        // 封面图片
        const ext = filePath.toLowerCase()
        if (ext.endsWith('.png')) contentType = 'image/png'
        else contentType = 'image/jpeg'
      } else {
        // 音频文件
        const ext = filePath.toLowerCase()
        if (ext.endsWith('.flac')) contentType = 'audio/flac'
        else if (ext.endsWith('.wav')) contentType = 'audio/wav'
        else if (ext.endsWith('.ogg')) contentType = 'audio/ogg'
        else if (ext.endsWith('.m4a') || ext.endsWith('.aac')) contentType = 'audio/mp4'
        else contentType = 'audio/mpeg'
      }

      const range = request.headers.get('range')

      if (range) {
        // ---- Range Request（拖动进度条 / 缓冲）----
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
        const chunkSize = (end - start) + 1

        const stream = fs.createReadStream(filePath, { start, end })
        const webStream = Readable.toWeb(stream) as ReadableStream

        return new Response(webStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize.toString(),
            'Content-Type': contentType
          }
        })
      } else {
        // ---- 完整文件请求 ----
        const stream = fs.createReadStream(filePath)
        const webStream = Readable.toWeb(stream) as ReadableStream

        return new Response(webStream, {
          headers: {
            'Content-Length': stat.size.toString(),
            'Content-Type': contentType
          }
        })
      }
    } catch (err) {
      console.error('[Protocol] 处理异常:', err)
      return new Response('Internal Error', { status: 500 })
    }
  })
}
