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

const IPC_CONTRACT_SOURCE = [
  "export const MAIN_WINDOW_INVOKE_CHANNELS = { 'main:invoke': true } as const",
  "export const CONTEXT_MENU_INVOKE_CHANNELS = { 'context:invoke': true } as const",
  "export const MAIN_WINDOW_SEND_CHANNELS = { 'renderer:send': true } as const",
  "export const MAIN_WINDOW_EVENT_CHANNELS = { 'main:event': true } as const",
].join('\n')

const IPC_REGISTRATION_SOURCE = [
  "import { handleIpc, onIpc } from './typedIpc'",
  "handleIpc('main:invoke', async () => 'ok')",
  "handleIpc('context:invoke', async () => null)",
  "onIpc('renderer:send', () => {})",
].join('\n')

const MAIN_PRELOAD_SOURCE = [
  "import { MAIN_WINDOW_EVENT_CHANNELS, MAIN_WINDOW_INVOKE_CHANNELS, MAIN_WINDOW_SEND_CHANNELS } from '../src/types/ipc'",
  'const INVOKE_CHANNELS = new Set(Object.keys(MAIN_WINDOW_INVOKE_CHANNELS))',
  'const SEND_CHANNELS = new Set(Object.keys(MAIN_WINDOW_SEND_CHANNELS))',
  'const ON_CHANNELS = new Set(Object.keys(MAIN_WINDOW_EVENT_CHANNELS))',
].join('\n')

const CONTEXT_PRELOAD_SOURCE = [
  'function invokeContextMenu(channel: string) { return channel }',
  "void invokeContextMenu('context:invoke')",
].join('\n')

function createIpcFixture(overrides: Record<string, string> = {}): CheckOptions {
  return createScopedFixture({
    'src/types/ipc.ts': IPC_CONTRACT_SOURCE,
    'electron/ipc/typedIpc.ts': [
      "import { ipcMain } from 'electron'",
      'export function handleIpc(channel: string, handler: Function) { ipcMain.handle(channel, handler) }',
      'export function onIpc(channel: string, handler: Function) { ipcMain.on(channel, handler) }',
      'export function sendIpc(target: { send: Function }, channel: string, ...args: unknown[]) { target.send(channel, ...args) }',
    ].join('\n'),
    'electron/ipc/register.ts': IPC_REGISTRATION_SOURCE,
    'electron/main.ts': [
      "import { sendIpc } from './ipc/typedIpc'",
      "sendIpc({ send() {} }, 'main:event', 'payload')",
    ].join('\n'),
    'electron/preload.ts': MAIN_PRELOAD_SOURCE,
    'electron/contextMenuPreload.ts': CONTEXT_PRELOAD_SOURCE,
    ...overrides,
  })
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

  it('完整 IPC 合同、注册、发送与 preload 表面应该通过', () => {
    const result = runChecks(createIpcFixture())

    expect(result.passed).toBe(true)
    expect(result.violations).toEqual([])
  })

  it.each([
    ['ipcMain.handle', "import { ipcMain } from 'electron'\nipcMain.handle('main:invoke', () => 'bad')"],
    ['ipcMain.on', "import { ipcMain } from 'electron'\nipcMain.on('renderer:send', () => {})"],
    ['webContents.send', "const window = { webContents: { send() {} } }\nwindow.webContents.send('main:event', 'bad')"],
  ])('typedIpc 边界外直接调用 %s 应该失败', (_name, source) => {
    const result = runChecks(createIpcFixture({ 'electron/rogue.ts': source }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-boundary', file: 'electron/rogue.ts' }),
    ]))
  })

  it.each([
    [
      'ipcMain import alias',
      "import { ipcMain as mainIpc } from 'electron'\nmainIpc.handle('main:invoke', () => 'bad')",
    ],
    [
      'ipcMain local alias',
      "import { ipcMain } from 'electron'\nconst mainIpc = ipcMain\nmainIpc.handle('main:invoke', () => 'bad')",
    ],
    [
      'webContents local alias',
      "const window = { webContents: { send() {} } }\nconst contents = window.webContents\ncontents.send('main:event', 'bad')",
    ],
    [
      'webContents shorthand destructuring',
      "const window = { webContents: { send() {} } }\nconst { webContents } = window\nwebContents.send('main:event', 'bad')",
    ],
  ])('%s 不应该绕过 typedIpc 边界', (_name, source) => {
    const result = runChecks(createIpcFixture({ 'electron/rogue.ts': source }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-boundary', file: 'electron/rogue.ts' }),
    ]))
  })

  it('typed wrapper import alias 的合同外 channel 也应该失败', () => {
    const result = runChecks(createIpcFixture({
      'electron/ipc/rogue.ts': [
        "import { handleIpc as registerInvoke } from './typedIpc'",
        "registerInvoke('alias:extra', async () => null)",
      ].join('\n'),
    }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-contract-consistency', file: 'electron/ipc/rogue.ts' }),
    ]))
  })

  it('typed wrapper local alias 的合同外 channel 也应该失败', () => {
    const result = runChecks(createIpcFixture({
      'electron/ipc/rogue.ts': [
        "import { handleIpc } from './typedIpc'",
        'const registerInvoke = handleIpc',
        "registerInvoke('alias:extra', async () => null)",
      ].join('\n'),
    }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-contract-consistency', file: 'electron/ipc/rogue.ts' }),
    ]))
  })

  it('没有真实 import 的同名本地函数不应该伪造 IPC 合同调用', () => {
    const result = runChecks(createIpcFixture({
      'electron/rogue.ts': [
        'function handleIpc(..._args: unknown[]) {}',
        'function onIpc(..._args: unknown[]) {}',
        'function sendIpc(..._args: unknown[]) {}',
        "handleIpc('fake:invoke', () => null)",
        "onIpc('fake:send', () => null)",
        "sendIpc({}, 'fake:event')",
      ].join('\n'),
    }))

    expect(result.passed).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('合同中的 invoke channel 没有注册时应该失败', () => {
    const contract = IPC_CONTRACT_SOURCE.replace(
      "{ 'main:invoke': true }",
      "{ 'main:invoke': true, 'missing:invoke': true }",
    )
    const result = runChecks(createIpcFixture({ 'src/types/ipc.ts': contract }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-contract-consistency' }),
    ]))
  })

  it('注册了合同外 channel 时应该失败', () => {
    const result = runChecks(createIpcFixture({
      'electron/ipc/register.ts': `${IPC_REGISTRATION_SOURCE}\nhandleIpc('missing:map', async () => null)`,
    }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-contract-consistency' }),
    ]))
  })

  it('同一方向重复注册 channel 时应该失败', () => {
    const result = runChecks(createIpcFixture({
      'electron/ipc/register.ts': `${IPC_REGISTRATION_SOURCE}\nhandleIpc('main:invoke', async () => 'duplicate')`,
    }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-duplicate-channel' }),
    ]))
  })

  it('channel 注册到错误方向时应该失败', () => {
    const result = runChecks(createIpcFixture({
      'electron/ipc/register.ts': IPC_REGISTRATION_SOURCE.replace(
        "onIpc('renderer:send', () => {})",
        "handleIpc('renderer:send', async () => null)",
      ),
    }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-contract-consistency' }),
    ]))
  })

  it('动态 channel 不能绕过静态合同检查', () => {
    const result = runChecks(createIpcFixture({
      'electron/ipc/register.ts': `${IPC_REGISTRATION_SOURCE}\nconst channel = 'dynamic:invoke'\nhandleIpc(channel, async () => null)`,
    }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-static-channel' }),
    ]))
  })

  it('main preload 缺少共享 allowlist 常量时应该失败', () => {
    const result = runChecks(createIpcFixture({
      'electron/preload.ts': MAIN_PRELOAD_SOURCE.replace(
        'Object.keys(MAIN_WINDOW_EVENT_CHANNELS)',
        '[]',
      ),
    }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-preload-contract', file: 'electron/preload.ts' }),
    ]))
  })

  it('main preload 运行时扩写 allowlist 多余 key 时应该失败', () => {
    const result = runChecks(createIpcFixture({
      'electron/preload.ts': MAIN_PRELOAD_SOURCE.replace(
        'Object.keys(MAIN_WINDOW_INVOKE_CHANNELS)',
        "[...Object.keys(MAIN_WINDOW_INVOKE_CHANNELS), 'extra:invoke']",
      ),
    }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-preload-contract', file: 'electron/preload.ts' }),
    ]))
  })

  it('context menu invoke allowlist 泄漏到 main preload 时应该失败', () => {
    const result = runChecks(createIpcFixture({
      'electron/preload.ts': `${MAIN_PRELOAD_SOURCE}\nvoid CONTEXT_MENU_INVOKE_CHANNELS`,
    }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-preload-contract', file: 'electron/preload.ts' }),
    ]))
  })

  it('event 合同中没有对应 sender 的 channel 应该失败', () => {
    const contract = IPC_CONTRACT_SOURCE.replace(
      "{ 'main:event': true }",
      "{ 'main:event': true, 'missing:event': true }",
    )
    const result = runChecks(createIpcFixture({ 'src/types/ipc.ts': contract }))

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'ipc-contract-consistency' }),
    ]))
  })

  it('任一作用域扫描为零时应该失败', () => {
    const result = runChecks(createFixture({}))

    expect(result.passed).toBe(false)
    expect(result.scannedFiles).toEqual({ electron: 0, workers: 0, src: 0 })
    expect(result.violations.filter((item) => item.rule === 'scan-scope')).toHaveLength(3)
  })
})
