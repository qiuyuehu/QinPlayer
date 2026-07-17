import { win32 } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { runScannerCore, type ScannerCoreAdapters } from '../electron/workers/scannerCore'
import type { ScanResult, ScannerWorkerMessage } from '../electron/scanTypes'

type VirtualNode =
  | { kind: 'directory'; entries: string[] }
  | { kind: 'file'; mtimeMs: number }

interface VirtualScannerOptions {
  nodes: Record<string, VirtualNode>
  unavailableDirectories?: string[]
  unavailableEntries?: string[]
  parseFailures?: string[]
}

const ROOT = 'C:\\Music'

function pathKey(filePath: string): string {
  return win32.resolve(filePath).toLowerCase()
}

function createScanResult(filePath: string, mtime: number): ScanResult {
  return {
    filePath,
    fileName: win32.basename(filePath),
    title: null,
    artist: null,
    album: null,
    duration: null,
    coverPath: null,
    mtime
  }
}

function createVirtualScanner(options: VirtualScannerOptions): {
  adapters: ScannerCoreAdapters
  messages: ScannerWorkerMessage[]
  parse: ReturnType<typeof vi.fn>
} {
  const nodes = new Map(
    Object.entries(options.nodes).map(([filePath, node]) => [pathKey(filePath), node])
  )
  const unavailableDirectories = new Set(
    (options.unavailableDirectories ?? []).map(pathKey)
  )
  const unavailableEntries = new Set((options.unavailableEntries ?? []).map(pathKey))
  const parseFailures = new Set((options.parseFailures ?? []).map(pathKey))
  const messages: ScannerWorkerMessage[] = []
  const parse = vi.fn(async (filePath: string): Promise<ScanResult | null> => {
    if (parseFailures.has(pathKey(filePath))) {
      throw new Error('parse failed')
    }
    const node = nodes.get(pathKey(filePath))
    return createScanResult(filePath, node?.kind === 'file' ? node.mtimeMs : 0)
  })

  return {
    messages,
    parse,
    adapters: {
      readdir: async (dirPath) => {
        if (unavailableDirectories.has(pathKey(dirPath))) {
          throw new Error('readdir denied')
        }
        const node = nodes.get(pathKey(dirPath))
        if (!node || node.kind !== 'directory') {
          throw new Error('not a directory')
        }
        return node.entries
      },
      stat: async (filePath) => {
        if (unavailableEntries.has(pathKey(filePath))) {
          throw new Error('stat denied')
        }
        const node = nodes.get(pathKey(filePath))
        if (!node) throw new Error('missing node')
        return {
          isDirectory: () => node.kind === 'directory',
          mtimeMs: node.kind === 'file' ? node.mtimeMs : 0
        }
      },
      parse,
      emit: (message) => messages.push(message)
    }
  }
}

function messageOfType<T extends ScannerWorkerMessage['type']>(
  messages: ScannerWorkerMessage[],
  type: T
): Extract<ScannerWorkerMessage, { type: T }> | undefined {
  return messages.find(
    (message): message is Extract<ScannerWorkerMessage, { type: T }> => message.type === type
  )
}

describe('scannerCore', () => {
  it('仅删除文件且无需解析时仍应该先发送完整快照再完成', async () => {
    const aPath = `${ROOT}\\A.mp3`
    const bPath = `${ROOT}\\B.mp3`
    const { adapters, messages, parse } = createVirtualScanner({
      nodes: {
        [ROOT]: { kind: 'directory', entries: ['A.mp3'] },
        [aPath]: { kind: 'file', mtimeMs: 100 }
      }
    })

    await runScannerCore({
      folderPaths: [ROOT, 'c:\\music\\'],
      coversDir: 'C:\\Covers',
      mode: 'incremental',
      existingFiles: { [aPath]: 100, [bPath]: 100 }
    }, adapters)

    const snapshot = messageOfType(messages, 'filesystem-snapshot')
    const done = messageOfType(messages, 'done')
    expect(snapshot?.data.existingPaths).toEqual([aPath])
    expect(done?.data.total).toBe(0)
    expect(parse).not.toHaveBeenCalled()
    expect(messages.indexOf(snapshot!)).toBeLessThan(messages.indexOf(done!))
  })

  it('根目录读取失败时应该把整个 root 标记为 unavailable', async () => {
    const { adapters, messages } = createVirtualScanner({
      nodes: { [ROOT]: { kind: 'directory', entries: [] } },
      unavailableDirectories: [ROOT]
    })

    await runScannerCore({
      folderPaths: [ROOT],
      coversDir: 'C:\\Covers',
      mode: 'incremental',
      existingFiles: {}
    }, adapters)

    expect(messageOfType(messages, 'filesystem-snapshot')?.data).toEqual({
      roots: [ROOT],
      existingPaths: [],
      unavailablePaths: [ROOT]
    })
  })

  it('子目录读取失败时应该只保护该 subtree 并保留完整 sibling', async () => {
    const blocked = `${ROOT}\\Blocked`
    const sibling = `${ROOT}\\Sibling`
    const song = `${sibling}\\ok.flac`
    const { adapters, messages } = createVirtualScanner({
      nodes: {
        [ROOT]: { kind: 'directory', entries: ['Blocked', 'Sibling'] },
        [blocked]: { kind: 'directory', entries: [] },
        [sibling]: { kind: 'directory', entries: ['ok.flac'] },
        [song]: { kind: 'file', mtimeMs: 10 }
      },
      unavailableDirectories: [blocked]
    })

    await runScannerCore({
      folderPaths: [ROOT],
      coversDir: 'C:\\Covers',
      mode: 'incremental',
      existingFiles: { [song]: 10 }
    }, adapters)

    const snapshot = messageOfType(messages, 'filesystem-snapshot')?.data
    expect(snapshot?.existingPaths).toEqual([song])
    expect(snapshot?.unavailablePaths).toEqual([blocked])
  })

  it('单个 entry stat 失败时应该把该路径标记为不确定 scope', async () => {
    const unknownEntry = `${ROOT}\\Unknown`
    const { adapters, messages } = createVirtualScanner({
      nodes: {
        [ROOT]: { kind: 'directory', entries: ['Unknown'] },
        [unknownEntry]: { kind: 'directory', entries: [] }
      },
      unavailableEntries: [unknownEntry]
    })

    await runScannerCore({
      folderPaths: [ROOT],
      coversDir: 'C:\\Covers',
      mode: 'incremental',
      existingFiles: {}
    }, adapters)

    expect(messageOfType(messages, 'filesystem-snapshot')?.data.unavailablePaths)
      .toEqual([unknownEntry])
  })

  it('成功遍历空目录时应该与访问失败明确区分', async () => {
    const { adapters, messages } = createVirtualScanner({
      nodes: { [ROOT]: { kind: 'directory', entries: [] } }
    })

    await runScannerCore({
      folderPaths: [ROOT],
      coversDir: 'C:\\Covers',
      mode: 'incremental',
      existingFiles: {}
    }, adapters)

    expect(messageOfType(messages, 'filesystem-snapshot')?.data).toEqual({
      roots: [ROOT],
      existingPaths: [],
      unavailablePaths: []
    })
  })

  it('full total 应该等于发现数且解析失败仍计入尝试数', async () => {
    const aPath = `${ROOT}\\A.mp3`
    const bPath = `${ROOT}\\B.flac`
    const { adapters, messages, parse } = createVirtualScanner({
      nodes: {
        [ROOT]: { kind: 'directory', entries: ['A.mp3', 'B.flac'] },
        [aPath]: { kind: 'file', mtimeMs: 1 },
        [bPath]: { kind: 'file', mtimeMs: 2 }
      },
      parseFailures: [aPath]
    })

    const result = await runScannerCore({
      folderPaths: [ROOT],
      coversDir: 'C:\\Covers',
      mode: 'full',
      existingFiles: {}
    }, adapters)

    expect(result?.attemptedParseCount).toBe(2)
    expect(messageOfType(messages, 'done')?.data.total).toBe(2)
    expect(messageOfType(messages, 'progress')?.data.total).toBe(2)
    expect(messageOfType(messages, 'file-error')?.data.file).toBe(aPath)
    expect(parse).toHaveBeenCalledTimes(2)
  })

  it('incremental total 应该只统计新增或修改文件', async () => {
    const unchanged = `${ROOT}\\unchanged.mp3`
    const created = `${ROOT}\\created.mp3`
    const changed = `${ROOT}\\changed.mp3`
    const { adapters, messages, parse } = createVirtualScanner({
      nodes: {
        [ROOT]: { kind: 'directory', entries: ['unchanged.mp3', 'created.mp3', 'changed.mp3'] },
        [unchanged]: { kind: 'file', mtimeMs: 10 },
        [created]: { kind: 'file', mtimeMs: 20 },
        [changed]: { kind: 'file', mtimeMs: 30 }
      }
    })

    const result = await runScannerCore({
      folderPaths: [ROOT],
      coversDir: 'C:\\Covers',
      mode: 'incremental',
      existingFiles: { [unchanged]: 10, [changed]: 25 }
    }, adapters)

    expect(result?.filesToProcess.map((file) => file.filePath)).toEqual([created, changed])
    expect(result?.attemptedParseCount).toBe(2)
    expect(messageOfType(messages, 'done')?.data.total).toBe(2)
    expect(parse).toHaveBeenCalledTimes(2)
  })

  it('roots 和音频路径应该按 Windows 语义去重', async () => {
    const song = `${ROOT}\\Song.mp3`
    const { adapters, messages } = createVirtualScanner({
      nodes: {
        [ROOT]: { kind: 'directory', entries: ['Song.mp3'] },
        [song]: { kind: 'file', mtimeMs: 1 }
      }
    })

    await runScannerCore({
      folderPaths: [ROOT, 'c:\\music\\'],
      coversDir: 'C:\\Covers',
      mode: 'incremental',
      existingFiles: { [song]: 1 }
    }, adapters)

    const snapshot = messageOfType(messages, 'filesystem-snapshot')?.data
    expect(snapshot?.roots).toEqual([ROOT])
    expect(snapshot?.existingPaths).toEqual([song])
  })

  it('遍历编排异常时应该发送 fatal-error 且不得发送 done', async () => {
    const { adapters, messages } = createVirtualScanner({ nodes: {} })

    await runScannerCore({
      folderPaths: [null as unknown as string],
      coversDir: 'C:\\Covers',
      mode: 'incremental',
      existingFiles: {}
    }, adapters)

    expect(messageOfType(messages, 'fatal-error')).toBeDefined()
    expect(messageOfType(messages, 'done')).toBeUndefined()
  })
})
