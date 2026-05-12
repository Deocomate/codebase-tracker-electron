/**
 * Worker Process Entry Point
 * 
 * This runs as a standalone local Node.js process. It communicates with the
 * Electron Main Process through stdin/stdout using NDJSON protocol.
 * 
 * All heavy FS operations (scan, search, combine) run here to keep the
 * Electron Main Process responsive.
 */

import { IgnoreRules } from '../core/ignoreRules'
import { ProjectProcessor } from '../core/processor'
import { collectRelatedDependencies } from '../core/dependencyParser'
import type { WorkerRequest, WorkerResponse, TreeNode, AttentionFileEntry } from './protocol'
import fs from 'fs/promises'
import path from 'path'

// ==================== Worker State ====================

let rules: IgnoreRules | null = null
let projectPath: string | null = null
let cancelRef = { cancelled: false }

// ==================== NDJSON I/O ====================

let inputBuffer = ''

function sendResponse(response: WorkerResponse): void {
  const line = JSON.stringify(response) + '\n'
  process.stdout.write(line)
}

function sendSuccess(id: string, data?: unknown): void {
  sendResponse({ id, status: 'success', data })
}

function sendError(id: string, error: string): void {
  sendResponse({ id, status: 'error', error })
}

function sendProgress(id: string, progress: number, message: string): void {
  sendResponse({ id, status: 'progress', progress, message })
}

function log(...args: unknown[]): void {
  // Use stderr for debug logs so they don't interfere with NDJSON on stdout
  process.stderr.write(`[Worker] ${args.map(String).join(' ')}\n`)
}

// ==================== Helper Functions ====================

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '') || '.'
}

function isDescendantPath(childPath: string, parentPath: string): boolean {
  const normalizedChild = normalizeRelPath(childPath)
  const normalizedParent = normalizeRelPath(parentPath)
  if (normalizedParent === '.') return normalizedChild !== '.'
  return normalizedChild !== normalizedParent && normalizedChild.startsWith(`${normalizedParent}/`)
}

function pruneSelectionPaths(paths: string[], targetPath: string): string[] {
  return paths.filter(
    (candidate) => candidate !== targetPath && !isDescendantPath(candidate, targetPath)
  )
}

function sortTreeChildren(
  a: TreeNode,
  b: TreeNode,
  priorityMap: Map<string, number>
): number {
  const idxA = priorityMap.has(a.id) ? priorityMap.get(a.id)! : Infinity
  const idxB = priorityMap.has(b.id) ? priorityMap.get(b.id)! : Infinity

  if (idxA !== Infinity || idxB !== Infinity) {
    if (idxA !== idxB) return idxA - idxB
  }

  const weightA = a.checked === 'checked' || a.checked === 'partial' ? 0 : 1
  const weightB = b.checked === 'checked' || b.checked === 'partial' ? 0 : 1
  if (weightA !== weightB) return weightA - weightB
  if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
  return a.name.localeCompare(b.name)
}

async function buildTreeNode(
  rulesInstance: IgnoreRules,
  absPath: string,
  relPath: string
): Promise<TreeNode> {
  const stat = await fs.stat(absPath)
  const isDir = stat.isDirectory()
  const name = path.basename(absPath)
  const blocked = relPath !== '.' && rulesInstance.isGloballyIgnoredByRelPath(relPath, isDir)
  const checkedState = rulesInstance.getPathSelectionState(relPath, isDir)

  const node: TreeNode = {
    id: relPath,
    name,
    is_dir: isDir,
    is_ignored: blocked,
    selectable: true,
    checked: checkedState,
    tokens: isDir ? 0 : Math.ceil(stat.size / 4),
    children: []
  }

  if (isDir && !blocked) {
    const priorityRoots = rulesInstance.getPriorityRoots()
    const priorityMap = new Map(priorityRoots.map((p, i) => [p, i]))
    const entries = await fs.readdir(absPath, { withFileTypes: true })
    let totalTokens = 0

    for (const entry of entries) {
      if (entry.name === '_codebase') continue
      const childAbs = path.join(absPath, entry.name)
      const childRel = relPath === '.' ? entry.name : `${relPath}/${entry.name}`
      if (rulesInstance.isCustomIgnoredByRelPath(childRel, entry.isDirectory())) continue
      const child = await buildTreeNode(rulesInstance, childAbs, childRel)
      node.children.push(child)
      totalTokens += child.tokens
    }

    node.children.sort((a, b) => sortTreeChildren(a, b, priorityMap))
    node.tokens = totalTokens
  }

  return node
}

async function rebuildProjectTree(): Promise<TreeNode | null> {
  if (!rules || !projectPath) return null
  return buildTreeNode(rules, projectPath, '.')
}

// ==================== Action Handlers ====================

async function handleInit(id: string, payload: Record<string, unknown>): Promise<void> {
  const fsPath = payload.path as string

  try {
    await fs.stat(fsPath)

    projectPath = fsPath
    rules = new IgnoreRules(fsPath)
    await rules.initialize()

    const rootNode = await buildTreeNode(rules, fsPath, '.')

    sendSuccess(id, {
      tree: rootNode,
      attention_patterns: rules.getAttentionPatterns(),
      project_path: fsPath
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('ENOENT') || message.includes('no such file')) {
      sendError(id, 'Không thể truy cập thư mục. Kiểm tra đường dẫn dự án.')
    } else {
      sendError(id, message)
    }
  }
}

async function handleBuildTree(id: string): Promise<void> {
  if (!rules || !projectPath) return sendError(id, 'Project chưa được load')
  const tree = await rebuildProjectTree()
  sendSuccess(id, { tree })
}

async function handleToggleNode(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')

  const nodePath = payload.path as string
  const isChecked = payload.isChecked as boolean
  const normalizedPath = normalizeRelPath(nodePath)
  const inc = pruneSelectionPaths([...rules.settings.included_paths], normalizedPath)
  const exc = pruneSelectionPaths([...rules.settings.excluded_paths], normalizedPath)

  if (isChecked) {
    if (!inc.includes(normalizedPath)) inc.push(normalizedPath)
  } else {
    if (!exc.includes(normalizedPath)) exc.push(normalizedPath)
  }

  await rules.updateSelectionPaths(inc, exc, true)
  const tree = await rebuildProjectTree()
  sendSuccess(id, { tree })
}

async function handleUpdateSelection(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  const includedPaths = payload.includedPaths as string[]
  const excludedPaths = payload.excludedPaths as string[]
  await rules.updateSelectionPaths(includedPaths, excludedPaths, true)
  sendSuccess(id, {})
}

async function handleUpdatePriority(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  const listRoots = payload.listRoots as string[]
  await rules.updatePriorityRoots(listRoots, true)
  sendSuccess(id, {})
}

async function handleAttentionPreview(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules || !projectPath) return sendSuccess(id, { files: [] })

  const patterns = Array.isArray(payload.patterns)
    ? (payload.patterns as string[]).filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : []

  if (patterns.length === 0) return sendSuccess(id, { files: [] })

  const attnIg = (await import('ignore')).default().add(patterns)
  const results: AttentionFileEntry[] = []

  const walk = async (relDir: string): Promise<void> => {
    const absDir = relDir ? path.join(projectPath!, relDir) : projectPath!
    let entries
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === '_codebase') continue
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
      if (rules!.isGloballyIgnoredByRelPath(relPath, entry.isDirectory())) continue
      if (entry.isDirectory()) {
        await walk(relPath)
        continue
      }
      const checkPath = relPath.replace(/\\/g, '/')
      if (attnIg.ignores(checkPath)) {
        try {
          const stat = await fs.stat(path.join(projectPath!, relPath))
          results.push({ absPath: path.join(projectPath!, relPath), relPath, tokens: Math.ceil(stat.size / 4) })
        } catch {
          results.push({ absPath: path.join(projectPath!, relPath), relPath })
        }
      }
    }
  }

  await walk('')
  const existingRelPaths = new Set(results.map((file) => file.relPath))
  const relatedFiles = await collectRelatedDependencies(projectPath, results, {
    ignoreRules: rules,
    maxSourceFiles: 20,
    existingRelPaths
  })
  results.push(...relatedFiles)
  sendSuccess(id, { files: results })
}

async function handleReadPromptFile(id: string): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  const content = await rules.readPromptFile()
  sendSuccess(id, { content })
}

async function handleResetPromptFile(id: string): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  await rules.resetPromptFile()
  const content = await rules.readPromptFile()
  sendSuccess(id, { content })
}

async function handleSaveAttentionPatterns(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  const patterns = Array.isArray(payload.patterns)
    ? (payload.patterns as string[]).filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : []
  await rules.updateAttentionPatterns(patterns, true)
  sendSuccess(id, { patterns: rules.getAttentionPatterns() })
}

async function handleGetSettings(id: string): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  sendSuccess(id, {
    ui_preferences: rules.getUiPreferences(),
    priority_roots: rules.getPriorityRoots(),
    instructions_config: rules.getInstructionsConfig()
  })
}

async function handleSaveSettings(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  const selectedFormats = payload.selectedFormats as string[]
  const splitEnabled = payload.splitEnabled as boolean
  const splitCount = payload.splitCount as number
  const instructionsEnabled = payload.instructionsEnabled as boolean | undefined
  await rules.updateUiPreferences(selectedFormats, splitEnabled, splitCount, true)
  if (instructionsEnabled !== undefined) {
    await rules.updateInstructionsConfig(instructionsEnabled, true)
  }
  sendSuccess(id, {})
}

async function handleGetIgnorePatterns(id: string): Promise<void> {
  if (!rules) return sendSuccess(id, { patterns: [] })
  sendSuccess(id, { patterns: rules.getCustomIgnorePatterns() })
}

async function handleAddIgnorePattern(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')

  try {
    const pattern = payload.pattern as string
    const patterns = await rules.addCustomIgnorePattern(pattern, true)
    const tree = await rebuildProjectTree()
    sendSuccess(id, { patterns, tree })
  } catch (err: unknown) {
    sendError(id, err instanceof Error ? err.message : String(err))
  }
}

async function handleRemoveIgnorePattern(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')

  try {
    const pattern = payload.pattern as string
    const patterns = await rules.removeCustomIgnorePattern(pattern, true)
    const tree = await rebuildProjectTree()
    sendSuccess(id, { patterns, tree })
  } catch (err: unknown) {
    sendError(id, err instanceof Error ? err.message : String(err))
  }
}

async function handlePreviewIgnorePattern(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendSuccess(id, { files: [] })

  const pattern = typeof payload.pattern === 'string' ? payload.pattern : ''
  const maxResults =
    typeof payload.maxResults === 'number' ? Math.min(Math.max(payload.maxResults, 1), 100) : 50
  if (!pattern.trim()) return sendSuccess(id, { files: [] })

  try {
    const files = await rules.previewCustomPattern(pattern, maxResults)
    sendSuccess(id, { files })
  } catch (err: unknown) {
    sendSuccess(id, { files: [], error: err instanceof Error ? err.message : String(err) })
  }
}

async function handleGenerate(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules || !projectPath) return sendError(id, 'Project chưa được load')

  // Create fresh cancelRef for each generation
  cancelRef = { cancelled: false }

  const selectedFormats = payload.selectedFormats as string[]
  const splitEnabled = payload.splitEnabled as boolean
  const splitCount = payload.splitCount as number
  const attentionPatterns = payload.attentionPatterns as string[] | undefined
  const actualSplitCount = splitEnabled ? splitCount : 0

  let processor: ProjectProcessor
  try {
    processor = new ProjectProcessor(projectPath, rules)
  } catch (err: unknown) {
    return sendError(id, `Lỗi khởi tạo Processor: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Run generation (async, streaming progress)
  try {
    const sendProgressCb = (msg: string, prog: number): void => {
      sendProgress(id, prog, msg)
    }

    const { success, message, stats } = await processor.run(
      sendProgressCb,
      sendProgressCb,
      cancelRef,
      selectedFormats,
      actualSplitCount,
      attentionPatterns
    )

    sendSuccess(id, { success, message, stats })
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log('[FATAL ERROR] Generation Process Failed:', errorMsg)
    sendSuccess(id, { success: false, message: `Lỗi hệ thống: ${errorMsg}`, stats: null })
  }
}

async function handleCancelGenerate(id: string): Promise<void> {
  cancelRef.cancelled = true
  sendSuccess(id, { status: 'cancelling' })
}

async function handleClearOutput(id: string): Promise<void> {
  if (!rules || !projectPath) return sendError(id, 'Chưa load dự án')
  const outputDir = path.join(projectPath, '_codebase')
  try {
    await fs.rm(outputDir, { recursive: true, force: true })
    sendSuccess(id, { message: 'Đã dọn dẹp thư mục output.' })
  } catch {
    sendSuccess(id, {})
  }
}

// ==================== Action Dispatcher ====================

async function dispatch(request: WorkerRequest): Promise<void> {
  const { id, action, payload } = request
  const p = payload || {}

  try {
    switch (action) {
      case 'INIT':
        return handleInit(id, p)
      case 'BUILD_TREE':
        return handleBuildTree(id)
      case 'TOGGLE_NODE':
        return handleToggleNode(id, p)
      case 'UPDATE_SELECTION':
        return handleUpdateSelection(id, p)
      case 'UPDATE_PRIORITY':
        return handleUpdatePriority(id, p)
      case 'ATTENTION_PREVIEW':
        return handleAttentionPreview(id, p)
      case 'READ_PROMPT_FILE':
        return handleReadPromptFile(id)
      case 'RESET_PROMPT_FILE':
        return handleResetPromptFile(id)
      case 'SAVE_ATTENTION_PATTERNS':
        return handleSaveAttentionPatterns(id, p)
      case 'GET_SETTINGS':
        return handleGetSettings(id)
      case 'SAVE_SETTINGS':
        return handleSaveSettings(id, p)
      case 'GET_IGNORE_PATTERNS':
        return handleGetIgnorePatterns(id)
      case 'ADD_IGNORE_PATTERN':
        return handleAddIgnorePattern(id, p)
      case 'REMOVE_IGNORE_PATTERN':
        return handleRemoveIgnorePattern(id, p)
      case 'PREVIEW_IGNORE_PATTERN':
        return handlePreviewIgnorePattern(id, p)
      case 'GENERATE':
        return handleGenerate(id, p)
      case 'CANCEL_GENERATE':
        return handleCancelGenerate(id)
      case 'CLEAR_OUTPUT':
        return handleClearOutput(id)
      case 'SHUTDOWN':
        sendSuccess(id, { message: 'Shutting down' })
        process.exit(0)
        return
      default:
        sendError(id, `Unknown action: ${action}`)
    }
  } catch (err: unknown) {
    sendError(id, `Unhandled error in ${action}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ==================== stdin Line Buffer ====================

process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk: string) => {
  inputBuffer += chunk
  const lines = inputBuffer.split('\n')

  // Keep last incomplete line in buffer
  inputBuffer = lines.pop() || ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    try {
      const request = JSON.parse(trimmed) as WorkerRequest
      if (!request.id || !request.action) {
        log('Invalid request (missing id or action):', trimmed)
        continue
      }
      dispatch(request).catch((err) => {
        log('Dispatch error:', err)
        sendError(request.id, `Dispatch error: ${err instanceof Error ? err.message : String(err)}`)
      })
    } catch (parseErr) {
      log('JSON parse error:', parseErr, 'Line:', trimmed)
    }
  }
})

process.stdin.on('end', () => {
  log('stdin closed, shutting down worker')
  process.exit(0)
})

process.on('uncaughtException', (err) => {
  log('Uncaught exception:', err.message)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  log('Unhandled rejection:', reason)
})

log('Worker started, waiting for commands...')
