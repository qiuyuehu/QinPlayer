import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  applyScanReconciliation,
  findDeletionCandidates,
  type ReconciliationSong
} from '../electron/ipc/scanReconciliation'
import type { FilesystemSnapshot } from '../electron/scanTypes'

const ROOT = 'C:\\Music'
const OTHER_ROOT = 'D:\\Audio'

function snapshot(overrides: Partial<FilesystemSnapshot> = {}): FilesystemSnapshot {
  return {
    roots: [ROOT],
    existingPaths: [],
    unavailablePaths: [],
    ...overrides
  }
}

function song(id: number, filePath: string): ReconciliationSong {
  return { id, filePath }
}

function createTransactionalDatabase(
  initialRows: ReconciliationSong[],
  failDeleteAt?: number
): { db: Database.Database; ids: () => number[] } {
  let rows = initialRows.map((row) => ({ ...row }))
  let deleteCount = 0

  const fake = {
    prepare: (sql: string) => {
      if (sql.startsWith('SELECT')) {
        return {
          all: () => rows.map((row) => ({ id: row.id, file_path: row.filePath }))
        }
      }
      if (sql.startsWith('DELETE')) {
        return {
          run: (id: number) => {
            deleteCount += 1
            if (deleteCount === failDeleteAt) throw new Error('injected delete failure')
            const before = rows.length
            rows = rows.filter((row) => row.id !== id)
            return { changes: before - rows.length, lastInsertRowid: 0 }
          }
        }
      }
      throw new Error(`unexpected SQL: ${sql}`)
    },
    transaction: (operation: (...args: unknown[]) => unknown) => {
      return (...args: unknown[]) => {
        const before = rows.map((row) => ({ ...row }))
        try {
          return operation(...args)
        } catch (error) {
          rows = before
          throw error
        }
      }
    }
  }

  return {
    db: fake as unknown as Database.Database,
    ids: () => rows.map((row) => row.id)
  }
}

describe('scanReconciliation', () => {
  it('deletion-only 完整快照应该只删除缺失文件', () => {
    const aPath = `${ROOT}\\A.mp3`
    const bPath = `${ROOT}\\B.mp3`
    const candidates = findDeletionCandidates(
      [song(1, aPath), song(2, bPath)],
      snapshot({ existingPaths: [aPath] })
    )

    expect(candidates).toEqual([song(2, bPath)])
  })

  it('不可用 root 应该全部保留且另一完整 root 仍可清理', () => {
    const protectedPath = `${ROOT}\\keep.mp3`
    const missingOther = `${OTHER_ROOT}\\missing.mp3`
    const candidates = findDeletionCandidates(
      [song(1, protectedPath), song(2, missingOther)],
      snapshot({
        roots: [ROOT, OTHER_ROOT],
        unavailablePaths: [ROOT]
      })
    )

    expect(candidates).toEqual([song(2, missingOther)])
  })

  it('不可用 subtree 应该只保护该 subtree', () => {
    const protectedPath = `${ROOT}\\Blocked\\keep.mp3`
    const missingSibling = `${ROOT}\\Sibling\\missing.mp3`
    const candidates = findDeletionCandidates(
      [song(1, protectedPath), song(2, missingSibling)],
      snapshot({ unavailablePaths: [`${ROOT}\\Blocked`] })
    )

    expect(candidates).toEqual([song(2, missingSibling)])
  })

  it('stat 失败的 entry 应该保护同一路径及潜在后代', () => {
    const uncertain = `${ROOT}\\Unknown`
    const candidates = findDeletionCandidates(
      [song(1, uncertain), song(2, `${uncertain}\\child.mp3`), song(3, `${ROOT}\\missing.mp3`)],
      snapshot({ unavailablePaths: [uncertain] })
    )

    expect(candidates).toEqual([song(3, `${ROOT}\\missing.mp3`)])
  })

  it.each([
    ['全部 roots 不可用', snapshot({ unavailablePaths: [ROOT] })],
    ['roots 为空', snapshot({ roots: [] })],
    ['字段畸形', { roots: [ROOT], existingPaths: 'bad', unavailablePaths: [] }]
  ])('%s 时应该删除 0 条', (_label, unsafeSnapshot) => {
    expect(findDeletionCandidates(
      [song(1, `${ROOT}\\missing.mp3`)],
      unsafeSnapshot
    )).toEqual([])
  })

  it('成功扫描到空目录时应该删除 root 下全部旧记录', () => {
    const rows = [song(1, `${ROOT}\\A.mp3`), song(2, `${ROOT}\\B.mp3`)]
    expect(findDeletionCandidates(rows, snapshot())).toEqual(rows)
  })

  it('root 外歌曲绝不应该被本轮对账删除', () => {
    const outside = song(1, 'D:\\Elsewhere\\outside.mp3')
    expect(findDeletionCandidates([outside], snapshot())).toEqual([])
  })

  it('containment 应该处理边界、嵌套 root、重复、尾分隔符和大小写', () => {
    const inside = song(1, 'c:\\music\\Nested\\missing.mp3')
    const prefixCollision = song(2, 'C:\\Music2\\keep.mp3')
    const candidates = findDeletionCandidates(
      [inside, prefixCollision],
      snapshot({ roots: ['C:\\Music\\', 'c:\\music', 'C:\\Music\\Nested'] })
    )

    expect(candidates).toEqual([inside])
  })

  it('existing path 永远不应该被删除', () => {
    const existing = song(1, `${ROOT}\\A.mp3`)
    expect(findDeletionCandidates(
      [existing],
      snapshot({ existingPaths: ['c:\\music\\a.mp3'] })
    )).toEqual([])
  })

  it('第二次 delete 失败时应该回滚整个 transaction', () => {
    const rows = [song(1, `${ROOT}\\A.mp3`), song(2, `${ROOT}\\B.mp3`)]
    const { db, ids } = createTransactionalDatabase(rows, 2)

    expect(() => applyScanReconciliation(db, snapshot())).toThrow('injected delete failure')
    expect(ids()).toEqual([1, 2])
  })

  it('成功 transaction 应该返回并提交实际删除数', () => {
    const rows = [song(1, `${ROOT}\\A.mp3`), song(2, `${ROOT}\\B.mp3`)]
    const { db, ids } = createTransactionalDatabase(rows)

    expect(applyScanReconciliation(
      db,
      snapshot({ existingPaths: [`${ROOT}\\A.mp3`] })
    )).toBe(1)
    expect(ids()).toEqual([1])
  })
})
