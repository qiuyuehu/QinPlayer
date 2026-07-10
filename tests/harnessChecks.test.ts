/**
 * Harness 约束检查器测试
 * 覆盖 AST 检查、白名单消费和空扫描保护
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

interface Violation {
  rule: string
  file: string
  line: number
  message: string
}

interface WhitelistEntry {
  rule: string
  file: string
  pattern: string
}

interface CheckResult {
  passed: boolean
  violations: Violation[]
  scannedFiles: { electron: number; workers: number; src: number }
  unusedWhitelistEntries: WhitelistEntry[]
}

interface CheckOptions {
  projectRoot: string
  configPaths: string[]
  whitelistPath: string
}

type RunChecks = (options: CheckOptions) => CheckResult
type WhitelistConfig = Record<string, Array<{ file: string; pattern: string; reason: string }>>

const require = createRequire(import.meta.url)
const { runChecks } = require('../harness/checks.js') as { runChecks: RunChecks }
const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

// 创建独立的临时 TypeScript 项目，避免测试依赖真实工作树内容。
function createFixture(
  files: Record<string, string>,
  whitelist: WhitelistConfig = {},
): CheckOptions {
  const projectRoot = mkdtempSync(join(tmpdir(), 'qinplayer-harness-'))
  temporaryRoots.push(projectRoot)

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(projectRoot, relativePath)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, content, 'utf8')
  }

  const nodeConfigPath = join(projectRoot, 'tsconfig.node.json')
  const webConfigPath = join(projectRoot, 'tsconfig.web.json')
  const whitelistPath = join(projectRoot, 'checks-whitelist.json')

  writeFileSync(nodeConfigPath, JSON.stringify({ include: ['electron/**/*.ts'] }), 'utf8')
  writeFileSync(webConfigPath, JSON.stringify({ include: ['src/**/*.ts', 'src/**/*.tsx'] }), 'utf8')
  writeFileSync(whitelistPath, JSON.stringify(whitelist), 'utf8')

  return {
    projectRoot,
    configPaths: [nodeConfigPath, webConfigPath],
    whitelistPath,
  }
}

// 每个正常 fixture 都包含三个扫描作用域，避免零文件保护干扰规则断言。
function createScopedFixture(
  overrides: Record<string, string> = {},
  whitelist: WhitelistConfig = {},
): CheckOptions {
  return createFixture({
    'electron/main.ts': 'export const main = true',
    'electron/workers/scanner.ts': "import { readdir } from 'fs/promises'\nvoid readdir",
    'src/index.ts': 'export const renderer = true',
    ...overrides,
  }, whitelist)
}

describe('Harness 约束检查器', () => {
  it('合法代码应该通过并分别统计三个作用域', () => {
    const result = runChecks(createScopedFixture())

    expect(result.passed).toBe(true)
    expect(result.violations).toEqual([])
    expect(result.scannedFiles).toEqual({ electron: 1, workers: 1, src: 1 })
  })

  it('应该检测四种 fs 同步调用形式', () => {
    const result = runChecks(createScopedFixture({
      'electron/main.ts': [
        "import { readFileSync } from 'fs'",
        "import { statSync as statNow } from 'node:fs'",
        "import * as fs from 'fs'",
        'function cleanup() {',
        "  const legacyFs = require('node:fs')",
        "  legacyFs.unlinkSync('d.txt')",
        '}',
        "readFileSync('a.txt')",
        "statNow('b.txt')",
        "fs.existsSync('c.txt')",
        'cleanup()',
      ].join('\n'),
    }))

    const syncViolations = result.violations.filter((item) => item.rule === 'no-sync-io')
    expect(syncViolations).toHaveLength(4)
    expect(syncViolations.map((item) => item.line)).toEqual([6, 8, 9, 10])
  })

  it('Worker 导入数据库模块时应该失败', () => {
    const result = runChecks(createScopedFixture({
      'electron/workers/scanner.ts': "import Database from 'better-sqlite3'\nvoid Database",
    }))

    expect(result.passed).toBe(false)
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'worker-no-database', file: 'electron/workers/scanner.ts' }),
    ]))
  })

  it('精确白名单应该消费已知违规', () => {
    const pattern = "require('fs').existsSync(iconPath)"
    const result = runChecks(createScopedFixture({
      'electron/main.ts': `const iconPath = 'icon.ico'\n${pattern}`,
    }, {
      'no-sync-io': [{
        file: 'electron/main.ts',
        pattern,
        reason: '测试中的历史调用',
      }],
    }))

    expect(result.passed).toBe(true)
    expect(result.violations).toEqual([])
    expect(result.unusedWhitelistEntries).toEqual([])
  })

  it('过期白名单应该报告错误', () => {
    const result = runChecks(createScopedFixture({}, {
      'no-sync-io': [{
        file: 'electron/main.ts',
        pattern: "require('fs').existsSync(iconPath)",
        reason: '已经不存在的历史调用',
      }],
    }))

    expect(result.passed).toBe(false)
    expect(result.unusedWhitelistEntries).toHaveLength(1)
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'unused-whitelist' }),
    ]))
  })

  it('任一作用域扫描为零时应该失败', () => {
    const result = runChecks(createFixture({}))

    expect(result.passed).toBe(false)
    expect(result.scannedFiles).toEqual({ electron: 0, workers: 0, src: 0 })
    expect(result.violations.filter((item) => item.rule === 'scan-scope')).toHaveLength(3)
  })
})
