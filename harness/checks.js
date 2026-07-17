// =============================================================================
// QinPlayer — Harness 自动约束检查
// =============================================================================
// 职责：基于 TypeScript AST 检查永久约束，并用精确白名单隔离历史调用
// =============================================================================

const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const FS_MODULES = new Set(['fs', 'node:fs'])
const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts'])
const TYPED_IPC_PATH = 'electron/ipc/typedIpc.ts'
const IPC_CONTRACT_NAMES = {
  MAIN_WINDOW_INVOKE_CHANNELS: 'mainInvoke',
  CONTEXT_MENU_INVOKE_CHANNELS: 'contextInvoke',
  MAIN_WINDOW_SEND_CHANNELS: 'send',
  MAIN_WINDOW_EVENT_CHANNELS: 'event',
}

// 将路径统一为仓库相对路径，保证 Windows 与测试临时目录下结果一致。
function normalizeRelativePath(projectRoot, filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join('/')
}

// 白名单按规范化 AST 源码匹配，忽略无意义的空白差异。
function normalizePattern(pattern) {
  return pattern.replace(/\s+/g, ' ').trim()
}

// 去掉不影响运行时表达式含义的 TypeScript 包装节点。
function unwrapExpression(node) {
  let current = node
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(current))
  ) {
    current = current.expression
  }
  return current
}

// 返回字符串字面量值；非字符串节点返回 null。
function getStringLiteralValue(node) {
  return ts.isStringLiteralLike(node) ? node.text : null
}

// 判断节点是否为 require('module') 调用。
function getRequiredModule(node) {
  const expression = unwrapExpression(node)
  if (!ts.isCallExpression(expression)) return null
  if (!ts.isIdentifier(expression.expression) || expression.expression.text !== 'require') return null
  if (expression.arguments.length !== 1) return null
  return getStringLiteralValue(expression.arguments[0])
}

// 判断模块名是否指向 Node.js fs。
function isFsModule(moduleName) {
  return moduleName !== null && FS_MODULES.has(moduleName)
}

// 获取属性访问名称，兼容 fs.readFileSync 与 fs['readFileSync']。
function getAccessedPropertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    return getStringLiteralValue(node.argumentExpression)
  }
  return null
}

// 收集当前文件中来自 fs 的直接函数绑定和 namespace 绑定。
function collectFsBindings(sourceFile) {
  const directBindings = new Map()
  const namespaceBindings = new Set()

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const moduleName = getStringLiteralValue(statement.moduleSpecifier)
      if (!isFsModule(moduleName) || !statement.importClause) continue

      if (statement.importClause.name) {
        namespaceBindings.add(statement.importClause.name.text)
      }

      const bindings = statement.importClause.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) {
        namespaceBindings.add(bindings.name.text)
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const importedName = element.propertyName?.text || element.name.text
          if (importedName.endsWith('Sync')) {
            directBindings.set(element.name.text, importedName)
          }
        }
      }
      continue
    }

    if (ts.isImportEqualsDeclaration(statement)) {
      const reference = statement.moduleReference
      if (
        ts.isExternalModuleReference(reference)
        && reference.expression
        && isFsModule(getStringLiteralValue(reference.expression))
      ) {
        namespaceBindings.add(statement.name.text)
      }
      continue
    }

  }

  // require() 可能位于 IPC 回调等嵌套作用域，必须遍历全部变量声明。
  function visitVariableBindings(node) {
    if (ts.isVariableDeclaration(node)) {
      const initializer = node.initializer ? unwrapExpression(node.initializer) : null
      if (initializer && isFsModule(getRequiredModule(initializer))) {
        if (ts.isIdentifier(node.name)) {
          namespaceBindings.add(node.name.text)
        } else if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (!ts.isIdentifier(element.name)) continue
            const importedName = ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : element.name.text
            if (importedName.endsWith('Sync')) {
              directBindings.set(element.name.text, importedName)
            }
          }
        }
      }
    }
    ts.forEachChild(node, visitVariableBindings)
  }

  visitVariableBindings(sourceFile)

  return { directBindings, namespaceBindings }
}

// 从调用表达式解析出被调用的 fs 同步 API 名称。
function getFsSyncCallName(call, bindings) {
  const expression = unwrapExpression(call.expression)

  if (ts.isIdentifier(expression)) {
    return bindings.directBindings.get(expression.text) || null
  }

  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) {
    return null
  }

  const propertyName = getAccessedPropertyName(expression)
  if (!propertyName || !propertyName.endsWith('Sync')) return null

  const owner = unwrapExpression(expression.expression)
  if (ts.isIdentifier(owner) && bindings.namespaceBindings.has(owner.text)) {
    return propertyName
  }
  if (isFsModule(getRequiredModule(owner))) {
    return propertyName
  }

  return null
}

// 判断模块是否为 Worker 禁止依赖的数据库实现。
function isDatabaseModule(moduleName, sourcePath, projectRoot) {
  const normalizedModule = moduleName.replace(/\\/g, '/')
  if (
    normalizedModule === 'better-sqlite3'
    || normalizedModule.startsWith('better-sqlite3/')
    || normalizedModule === 'sqlite3'
    || normalizedModule === 'node:sqlite'
  ) {
    return true
  }

  if (/(^|\/)electron\/db(\/|$)/.test(normalizedModule)) return true
  if (/(^|\/)db\/database(?:\.[cm]?[jt]sx?)?$/.test(normalizedModule)) return true

  if (normalizedModule.startsWith('.')) {
    const resolved = path.resolve(path.dirname(sourcePath), normalizedModule)
    const relative = normalizeRelativePath(projectRoot, resolved)
    return relative === 'electron/db' || relative.startsWith('electron/db/')
  }

  return false
}

// 创建带行号和规范化表达式的内部违规记录。
function createViolation(rule, file, sourceFile, node, message, patternNode = node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return {
    rule,
    file,
    line: position.line + 1,
    message,
    pattern: normalizePattern(patternNode.getText(sourceFile)),
  }
}

// 检查主进程文件中的 fs 同步调用。
function checkSyncIo(sourceFile, relativePath) {
  const violations = []
  const bindings = collectFsBindings(sourceFile)

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const syncName = getFsSyncCallName(node, bindings)
      if (syncName) {
        violations.push(createViolation(
          'no-sync-io',
          relativePath,
          sourceFile,
          node,
          `主进程禁止调用 fs.${syncName}()`
        ))
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

// 检查 Worker 是否导入数据库模块。
function checkWorkerDatabaseImports(sourceFile, relativePath, projectRoot) {
  const violations = []

  function report(node, moduleName, patternNode = node) {
    violations.push(createViolation(
      'worker-no-database',
      relativePath,
      sourceFile,
      node,
      `Worker 禁止导入数据库模块 ${moduleName}`,
      patternNode
    ))
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const moduleName = getStringLiteralValue(node.moduleSpecifier)
      if (moduleName && isDatabaseModule(moduleName, sourceFile.fileName, projectRoot)) {
        report(node, moduleName)
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference
      const moduleName = ts.isExternalModuleReference(reference) && reference.expression
        ? getStringLiteralValue(reference.expression)
        : null
      if (moduleName && isDatabaseModule(moduleName, sourceFile.fileName, projectRoot)) {
        report(node, moduleName)
      }
    } else if (ts.isCallExpression(node)) {
      const moduleName = getRequiredModule(node)
        || (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1
          ? getStringLiteralValue(node.arguments[0])
          : null)
      if (moduleName && isDatabaseModule(moduleName, sourceFile.fileName, projectRoot)) {
        report(node, moduleName)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

function getObjectPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  return null
}

function collectRuntimeIdentifierUsage(sourceFile, identifierName) {
  let found = false

  function visit(node) {
    if (found) return
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) return
    if (ts.isIdentifier(node) && node.text === identifierName) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

function collectNamedCalls(sourceFile, callName) {
  const calls = []

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = unwrapExpression(node.expression)
      if (ts.isIdentifier(expression) && expression.text === callName) calls.push(node)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return calls
}

function collectIpcBindings(sourceFile) {
  const ipcMainBindings = new Set()
  const electronNamespaces = new Set()
  const typedFunctionBindings = new Map()
  const typedNamespaces = new Set()
  const webContentsBindings = new Set()

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const moduleName = getStringLiteralValue(statement.moduleSpecifier)?.replace(/\\/g, '/')
    const namedBindings = statement.importClause.namedBindings
    if (moduleName === 'electron') {
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        electronNamespaces.add(namedBindings.name.text)
      } else if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text || element.name.text
          if (importedName === 'ipcMain') ipcMainBindings.add(element.name.text)
        }
      }
    }

    if (moduleName && /(^|\/)typedIpc$/.test(moduleName)) {
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        typedNamespaces.add(namedBindings.name.text)
      } else if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text || element.name.text
          if (importedName === 'handleIpc' || importedName === 'onIpc' || importedName === 'sendIpc') {
            typedFunctionBindings.set(element.name.text, importedName)
          }
        }
      }
    }
  }

  function visitAliases(node) {
    if (ts.isVariableDeclaration(node)) {
      if (ts.isIdentifier(node.name) && node.initializer) {
        const initializer = unwrapExpression(node.initializer)
        if (ts.isIdentifier(initializer)) {
          if (ipcMainBindings.has(initializer.text)) ipcMainBindings.add(node.name.text)
          if (electronNamespaces.has(initializer.text)) electronNamespaces.add(node.name.text)
          if (typedNamespaces.has(initializer.text)) typedNamespaces.add(node.name.text)
          const typedFunction = typedFunctionBindings.get(initializer.text)
          if (typedFunction) typedFunctionBindings.set(node.name.text, typedFunction)
        } else if (ts.isPropertyAccessExpression(initializer) || ts.isElementAccessExpression(initializer)) {
          const owner = unwrapExpression(initializer.expression)
          const propertyName = getAccessedPropertyName(initializer)
          if (ts.isIdentifier(owner) && electronNamespaces.has(owner.text) && propertyName === 'ipcMain') {
            ipcMainBindings.add(node.name.text)
          }
          if (
            ts.isIdentifier(owner)
            && typedNamespaces.has(owner.text)
            && (propertyName === 'handleIpc' || propertyName === 'onIpc' || propertyName === 'sendIpc')
          ) {
            typedFunctionBindings.set(node.name.text, propertyName)
          }
        }
        const aliasesWebContents = (
          (ts.isPropertyAccessExpression(initializer) || ts.isElementAccessExpression(initializer))
          && getAccessedPropertyName(initializer) === 'webContents'
        ) || (ts.isIdentifier(initializer) && webContentsBindings.has(initializer.text))
        if (aliasesWebContents) webContentsBindings.add(node.name.text)
      } else if (ts.isObjectBindingPattern(node.name)) {
        const initializer = node.initializer ? unwrapExpression(node.initializer) : null
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue
          const propertyName = element.propertyName
            ? getObjectPropertyName(element.propertyName)
            : element.name.text
          if (propertyName === 'webContents') webContentsBindings.add(element.name.text)
          if (initializer && ts.isIdentifier(initializer)) {
            if (electronNamespaces.has(initializer.text) && propertyName === 'ipcMain') {
              ipcMainBindings.add(element.name.text)
            }
            if (
              typedNamespaces.has(initializer.text)
              && (propertyName === 'handleIpc' || propertyName === 'onIpc' || propertyName === 'sendIpc')
            ) {
              typedFunctionBindings.set(element.name.text, propertyName)
            }
          }
        }
      }
    }
    ts.forEachChild(node, visitAliases)
  }
  visitAliases(sourceFile)

  return {
    ipcMainBindings,
    electronNamespaces,
    typedFunctionBindings,
    typedNamespaces,
    webContentsBindings,
  }
}

function getTypedIpcCallName(expression, bindings) {
  if (ts.isIdentifier(expression)) {
    return bindings.typedFunctionBindings.get(expression.text) || null
  }
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) {
    return null
  }
  const owner = unwrapExpression(expression.expression)
  if (!ts.isIdentifier(owner) || !bindings.typedNamespaces.has(owner.text)) return null
  const method = getAccessedPropertyName(expression)
  return method === 'handleIpc' || method === 'onIpc' || method === 'sendIpc' ? method : null
}

function getDirectIpcCallKind(call, bindings) {
  const expression = unwrapExpression(call.expression)
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) {
    return null
  }

  const method = getAccessedPropertyName(expression)
  const owner = unwrapExpression(expression.expression)
  const directIpcMain = ts.isIdentifier(owner) && bindings.ipcMainBindings.has(owner.text)
  const namespacedIpcMain = (
    (ts.isPropertyAccessExpression(owner) || ts.isElementAccessExpression(owner))
    && getAccessedPropertyName(owner) === 'ipcMain'
    && ts.isIdentifier(unwrapExpression(owner.expression))
    && bindings.electronNamespaces.has(unwrapExpression(owner.expression).text)
  )
  if (
    (method === 'handle' || method === 'on')
    && (directIpcMain || namespacedIpcMain)
  ) {
    return `ipcMain.${method}`
  }

  if (method !== 'send') return null
  if (ts.isIdentifier(owner) && bindings.webContentsBindings.has(owner.text)) return 'webContents.send'
  if (!ts.isPropertyAccessExpression(owner) && !ts.isElementAccessExpression(owner)) return null
  return getAccessedPropertyName(owner) === 'webContents' ? 'webContents.send' : null
}

function checkIpcContracts(sourceFiles) {
  const violations = []
  const contracts = {
    mainInvoke: new Map(),
    contextInvoke: new Map(),
    send: new Map(),
    event: new Map(),
  }
  const calls = { invoke: [], send: [], event: [] }
  let contractEnabled = false

  function report(rule, record, message, patternNode = record.node) {
    violations.push(createViolation(
      rule,
      record.relativePath,
      record.sourceFile,
      record.node,
      message,
      patternNode
    ))
  }

  for (const [relativePath, sourceFile] of sourceFiles) {
    const ipcBindings = collectIpcBindings(sourceFile)
    function visit(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const groupName = IPC_CONTRACT_NAMES[node.name.text]
        if (groupName && node.initializer) {
          contractEnabled = true
          const initializer = unwrapExpression(node.initializer)
          if (ts.isObjectLiteralExpression(initializer)) {
            for (const property of initializer.properties) {
              if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
                report('ipc-static-channel', {
                  relativePath,
                  sourceFile,
                  node: property,
                }, `${node.name.text} 只能包含静态 channel 属性`)
                continue
              }
              const channel = getObjectPropertyName(property.name)
              if (!channel) {
                report('ipc-static-channel', {
                  relativePath,
                  sourceFile,
                  node: property,
                }, `${node.name.text} 包含动态 channel`)
                continue
              }
              const record = { channel, relativePath, sourceFile, node: property }
              if (contracts[groupName].has(channel)) {
                report('ipc-duplicate-channel', record, `${node.name.text} 重复声明 ${channel}`)
              } else {
                contracts[groupName].set(channel, record)
              }
            }
          }
        }
      }

      if (ts.isCallExpression(node)) {
        const directKind = getDirectIpcCallKind(node, ipcBindings)
        if (directKind && relativePath !== TYPED_IPC_PATH) {
          report('ipc-boundary', {
            relativePath,
            sourceFile,
            node,
          }, `${directKind} 只能在 ${TYPED_IPC_PATH} 中使用`)
        }

        const expression = unwrapExpression(node.expression)
        const callName = getTypedIpcCallName(expression, ipcBindings)
        const callConfig = callName === 'handleIpc'
          ? { direction: 'invoke', argumentIndex: 0 }
          : callName === 'onIpc'
            ? { direction: 'send', argumentIndex: 0 }
            : callName === 'sendIpc'
              ? { direction: 'event', argumentIndex: 1 }
              : null
        if (callConfig && relativePath !== TYPED_IPC_PATH) {
          const channelNode = node.arguments[callConfig.argumentIndex]
          const channel = channelNode ? getStringLiteralValue(unwrapExpression(channelNode)) : null
          const record = { channel, relativePath, sourceFile, node }
          if (!channel) {
            report('ipc-static-channel', record, `${callName} 必须使用字符串字面量 channel`, channelNode || node)
          } else {
            calls[callConfig.direction].push(record)
          }
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  if (!contractEnabled) return violations

  const contractSource = sourceFiles.get('src/types/ipc.ts')
  for (const contractName of Object.keys(IPC_CONTRACT_NAMES)) {
    if (contracts[IPC_CONTRACT_NAMES[contractName]].size === 0 && contractSource) {
      report('ipc-contract-consistency', {
        relativePath: 'src/types/ipc.ts',
        sourceFile: contractSource,
        node: contractSource,
      }, `缺少或清空了 ${contractName}`, contractSource)
    }
  }

  const expected = {
    invoke: new Map([...contracts.mainInvoke, ...contracts.contextInvoke]),
    send: contracts.send,
    event: contracts.event,
  }
  const directionLabels = { invoke: 'handleIpc', send: 'onIpc', event: 'sendIpc' }

  for (const direction of Object.keys(calls)) {
    const seen = new Map()
    for (const record of calls[direction]) {
      const previous = seen.get(record.channel)
      if (previous && direction !== 'event') {
        report('ipc-duplicate-channel', record, `${directionLabels[direction]} 重复注册或发送 ${record.channel}`)
      } else if (!previous) {
        seen.set(record.channel, record)
      }
    }

    for (const [channel, contractRecord] of expected[direction]) {
      if (!seen.has(channel)) {
        report(
          'ipc-contract-consistency',
          contractRecord,
          `合同 channel ${channel} 缺少 ${directionLabels[direction]}`
        )
      }
    }

    for (const [channel, record] of seen) {
      if (expected[direction].has(channel)) continue
      const declaredDirection = Object.keys(expected).find((candidate) => expected[candidate].has(channel))
      const suffix = declaredDirection
        ? `，合同方向应为 ${directionLabels[declaredDirection]}`
        : '，合同中没有该 channel'
      report(
        'ipc-contract-consistency',
        record,
        `${directionLabels[direction]} 使用了 ${channel}${suffix}`
      )
    }
  }

  const mainPreload = sourceFiles.get('electron/preload.ts')
  if (mainPreload) {
    const expectedAllowlistBindings = new Map([
      ['INVOKE_CHANNELS', 'MAIN_WINDOW_INVOKE_CHANNELS'],
      ['SEND_CHANNELS', 'MAIN_WINDOW_SEND_CHANNELS'],
      ['ON_CHANNELS', 'MAIN_WINDOW_EVENT_CHANNELS'],
    ])
    const allowlistDeclarations = new Map()
    function collectAllowlistDeclaration(node) {
      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && expectedAllowlistBindings.has(node.name.text)
      ) {
        allowlistDeclarations.set(node.name.text, node)
      }
      ts.forEachChild(node, collectAllowlistDeclaration)
    }
    collectAllowlistDeclaration(mainPreload)

    for (const [binding, contractName] of expectedAllowlistBindings) {
      const declaration = allowlistDeclarations.get(binding)
      const initializer = declaration?.initializer ? unwrapExpression(declaration.initializer) : null
      const setArgument = initializer && ts.isNewExpression(initializer)
        && ts.isIdentifier(initializer.expression)
        && initializer.expression.text === 'Set'
        && initializer.arguments?.length === 1
        ? unwrapExpression(initializer.arguments[0])
        : null
      const keysExpression = setArgument && ts.isCallExpression(setArgument)
        ? unwrapExpression(setArgument.expression)
        : null
      const objectKeysCall = keysExpression
        && ts.isPropertyAccessExpression(keysExpression)
        && ts.isIdentifier(keysExpression.expression)
        && keysExpression.expression.text === 'Object'
        && keysExpression.name.text === 'keys'
        && setArgument.arguments.length === 1
        && ts.isIdentifier(unwrapExpression(setArgument.arguments[0]))
        && unwrapExpression(setArgument.arguments[0]).text === contractName
      if (!objectKeysCall) {
        report('ipc-preload-contract', {
          relativePath: 'electron/preload.ts',
          sourceFile: mainPreload,
          node: declaration || mainPreload,
        }, `${binding} 必须精确由 Object.keys(${contractName}) 构造`)
      }
    }

    for (const name of [
      'MAIN_WINDOW_INVOKE_CHANNELS',
      'MAIN_WINDOW_SEND_CHANNELS',
      'MAIN_WINDOW_EVENT_CHANNELS',
    ]) {
      if (!collectRuntimeIdentifierUsage(mainPreload, name)) {
        report('ipc-preload-contract', {
          relativePath: 'electron/preload.ts',
          sourceFile: mainPreload,
          node: mainPreload,
        }, `main preload 没有在运行时使用共享 allowlist ${name}`, mainPreload)
      }
    }
    if (collectRuntimeIdentifierUsage(mainPreload, 'CONTEXT_MENU_INVOKE_CHANNELS')) {
      report('ipc-preload-contract', {
        relativePath: 'electron/preload.ts',
        sourceFile: mainPreload,
        node: mainPreload,
      }, 'main preload 不得暴露 context menu invoke allowlist', mainPreload)
    }

    const allowlistBindings = new Set(expectedAllowlistBindings.keys())
    function visitAllowlistMutation(node) {
      if (ts.isCallExpression(node)) {
        const expression = unwrapExpression(node.expression)
        if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
          const method = getAccessedPropertyName(expression)
          const owner = unwrapExpression(expression.expression)
          if (
            (method === 'add' || method === 'delete' || method === 'clear')
            && ts.isIdentifier(owner)
            && allowlistBindings.has(owner.text)
          ) {
            report('ipc-preload-contract', {
              relativePath: 'electron/preload.ts',
              sourceFile: mainPreload,
              node,
            }, `main preload 不得运行时修改共享 allowlist：${owner.text}.${method}`)
          }
        }
      }
      ts.forEachChild(node, visitAllowlistMutation)
    }
    visitAllowlistMutation(mainPreload)
  }

  const contextPreload = sourceFiles.get('electron/contextMenuPreload.ts')
  if (contextPreload) {
    const exposedCalls = collectNamedCalls(contextPreload, 'invokeContextMenu')
    const exposedChannels = new Map()
    for (const call of exposedCalls) {
      const channelNode = call.arguments[0]
      const channel = channelNode ? getStringLiteralValue(unwrapExpression(channelNode)) : null
      const record = {
        channel,
        relativePath: 'electron/contextMenuPreload.ts',
        sourceFile: contextPreload,
        node: call,
      }
      if (!channel) {
        report('ipc-static-channel', record, 'context menu preload 必须使用字符串字面量 channel')
      } else if (exposedChannels.has(channel)) {
        report('ipc-duplicate-channel', record, `context menu preload 重复暴露 ${channel}`)
      } else {
        exposedChannels.set(channel, record)
      }
    }
    for (const [channel, contractRecord] of contracts.contextInvoke) {
      if (!exposedChannels.has(channel)) {
        report('ipc-preload-contract', contractRecord, `context menu preload 未暴露 ${channel}`)
      }
    }
    for (const [channel, record] of exposedChannels) {
      if (!contracts.contextInvoke.has(channel)) {
        report('ipc-preload-contract', record, `context menu preload 暴露了合同外 channel ${channel}`)
      }
    }
  }

  return violations
}

// 将 TypeScript 配置中的源文件合并并按绝对路径去重。
function collectSourcePaths(projectRoot, configPaths, violations) {
  const sourcePaths = new Map()

  for (const configuredPath of configPaths) {
    const configPath = path.resolve(projectRoot, configuredPath)
    const readResult = ts.readConfigFile(configPath, ts.sys.readFile)
    if (readResult.error) {
      violations.push({
        rule: 'config',
        file: normalizeRelativePath(projectRoot, configPath),
        line: 1,
        message: ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n'),
        pattern: '',
      })
      continue
    }

    const parsed = ts.parseJsonConfigFileContent(
      readResult.config,
      ts.sys,
      path.dirname(configPath),
      undefined,
      configPath
    )
    for (const diagnostic of parsed.errors) {
      violations.push({
        rule: 'config',
        file: normalizeRelativePath(projectRoot, configPath),
        line: 1,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        pattern: '',
      })
    }

    for (const fileName of parsed.fileNames) {
      const absolutePath = path.resolve(fileName)
      if (!TYPESCRIPT_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) continue
      const key = process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath
      sourcePaths.set(key, absolutePath)
    }
  }

  return [...sourcePaths.values()].sort((left, right) => left.localeCompare(right))
}

// 读取并校验白名单；无效条目直接作为配置违规返回。
function loadWhitelist(projectRoot, whitelistPath, violations) {
  const entries = []
  const resolvedPath = path.resolve(projectRoot, whitelistPath)
  let config

  try {
    config = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
  } catch (error) {
    violations.push({
      rule: 'whitelist-config',
      file: normalizeRelativePath(projectRoot, resolvedPath),
      line: 1,
      message: `无法读取白名单：${String(error)}`,
      pattern: '',
    })
    return entries
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    violations.push({
      rule: 'whitelist-config',
      file: normalizeRelativePath(projectRoot, resolvedPath),
      line: 1,
      message: '白名单根节点必须是规则对象',
      pattern: '',
    })
    return entries
  }

  for (const [rule, ruleEntries] of Object.entries(config)) {
    if (!Array.isArray(ruleEntries)) {
      violations.push({
        rule: 'whitelist-config',
        file: normalizeRelativePath(projectRoot, resolvedPath),
        line: 1,
        message: `白名单规则 ${rule} 必须是数组`,
        pattern: '',
      })
      continue
    }

    for (const entry of ruleEntries) {
      if (
        !entry
        || typeof entry !== 'object'
        || typeof entry.file !== 'string'
        || typeof entry.pattern !== 'string'
        || typeof entry.reason !== 'string'
        || !entry.file.trim()
        || !entry.pattern.trim()
        || !entry.reason.trim()
      ) {
        violations.push({
          rule: 'whitelist-config',
          file: normalizeRelativePath(projectRoot, resolvedPath),
          line: 1,
          message: `白名单规则 ${rule} 的每个条目都必须包含 file、pattern 和 reason`,
          pattern: '',
        })
        continue
      }

      entries.push({
        rule,
        file: entry.file.replace(/\\/g, '/'),
        pattern: normalizePattern(entry.pattern),
        reason: entry.reason,
        used: false,
      })
    }
  }

  return entries
}

// 用一个白名单条目精确消费一个违规，重复或失效条目会保留为错误。
function applyWhitelist(rawViolations, whitelistEntries) {
  const violations = []

  for (const violation of rawViolations) {
    const matchedEntry = whitelistEntries.find((entry) => (
      !entry.used
      && entry.rule === violation.rule
      && entry.file === violation.file
      && entry.pattern === violation.pattern
    ))

    if (matchedEntry) {
      matchedEntry.used = true
    } else {
      violations.push(violation)
    }
  }

  const unusedWhitelistEntries = whitelistEntries
    .filter((entry) => !entry.used)
    .map((entry) => ({ rule: entry.rule, file: entry.file, pattern: entry.pattern }))

  for (const entry of unusedWhitelistEntries) {
    violations.push({
      rule: 'unused-whitelist',
      file: entry.file,
      line: 1,
      message: `白名单条目未匹配任何违规：${entry.rule} / ${entry.pattern}`,
      pattern: entry.pattern,
    })
  }

  return { violations, unusedWhitelistEntries }
}

// 执行全部约束检查，返回结构化结果供 CLI 和 Vitest 共用。
function runChecks(options) {
  const projectRoot = path.resolve(options.projectRoot)
  const rawViolations = []
  const sourcePaths = collectSourcePaths(projectRoot, options.configPaths, rawViolations)
  const scannedFiles = { electron: 0, workers: 0, src: 0 }
  const sourceFiles = new Map()

  for (const sourcePath of sourcePaths) {
    const relativePath = normalizeRelativePath(projectRoot, sourcePath)
    const isWorker = relativePath.startsWith('electron/workers/')
    const isElectron = relativePath.startsWith('electron/') && !isWorker
    const isRenderer = relativePath.startsWith('src/')

    if (!isElectron && !isWorker && !isRenderer) continue
    if (isElectron) scannedFiles.electron += 1
    if (isWorker) scannedFiles.workers += 1
    if (isRenderer) scannedFiles.src += 1

    const content = fs.readFileSync(sourcePath, 'utf8')
    const scriptKind = sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sourceFile = ts.createSourceFile(sourcePath, content, ts.ScriptTarget.Latest, true, scriptKind)
    sourceFiles.set(relativePath, sourceFile)

    if (isElectron) {
      rawViolations.push(...checkSyncIo(sourceFile, relativePath))
    }
    if (isWorker) {
      rawViolations.push(...checkWorkerDatabaseImports(sourceFile, relativePath, projectRoot))
    }
  }

  rawViolations.push(...checkIpcContracts(sourceFiles))

  for (const [scope, count] of Object.entries(scannedFiles)) {
    if (count === 0) {
      rawViolations.push({
        rule: 'scan-scope',
        file: scope,
        line: 1,
        message: `扫描作用域 ${scope} 未命中任何 TypeScript 文件，拒绝假绿`,
        pattern: scope,
      })
    }
  }

  const whitelistEntries = loadWhitelist(
    projectRoot,
    options.whitelistPath,
    rawViolations
  )
  const filtered = applyWhitelist(rawViolations, whitelistEntries)
  const publicViolations = filtered.violations.map(({ pattern: _pattern, ...violation }) => violation)

  return {
    passed: publicViolations.length === 0,
    violations: publicViolations,
    scannedFiles,
    unusedWhitelistEntries: filtered.unusedWhitelistEntries,
  }
}

// CLI 只负责展示结果并设置退出码，不在库函数中终止进程。
function runCli() {
  const projectRoot = path.resolve(__dirname, '..')
  const result = runChecks({
    projectRoot,
    configPaths: ['tsconfig.node.json', 'tsconfig.web.json'],
    whitelistPath: 'harness/checks-whitelist.json',
  })

  console.log(
    `[Harness] 扫描文件：electron=${result.scannedFiles.electron}, `
    + `workers=${result.scannedFiles.workers}, src=${result.scannedFiles.src}`
  )

  if (result.passed) {
    console.log('[Harness] 约束检查通过')
    return
  }

  console.error(`[Harness] 约束检查失败：${result.violations.length} 个问题`)
  for (const violation of result.violations) {
    console.error(`- [${violation.rule}] ${violation.file}:${violation.line} ${violation.message}`)
  }
  process.exitCode = 1
}

module.exports = { runChecks }

if (require.main === module) {
  runCli()
}
