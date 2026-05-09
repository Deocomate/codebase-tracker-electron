/**
 * Worker Process Entry Point
 * 
 * This runs as a standalone Node.js process (either via `node` on Windows
 * or via `wsl.exe -e node` for WSL projects). It communicates with the
 * Electron Main Process through stdin/stdout using NDJSON protocol.
 * 
 * All heavy FS operations (scan, search, combine) run here on the native
 * file system, bypassing the slow \\wsl.localhost\ network bridge.
 */

import { IgnoreRules } from '../core/ignoreRules'
import { ProjectProcessor } from '../core/processor'
import { SearchEngine } from '../core/searchEngine'
import type { WorkerRequest, WorkerResponse, TreeNode } from './protocol'
import fs from 'fs/promises'
import path from 'path'

// ==================== Worker State ====================

let rules: IgnoreRules | null = null
let searchEngine: SearchEngine | null = null
let projectPath: string | null = null
let searchPreviewRequestId = 0
let searchStatsRequestId = 0
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

function resetSearchEngine(): SearchEngine | null {
  if (!rules || !projectPath) {
    searchEngine = null
    searchPreviewRequestId += 1
    searchStatsRequestId += 1
    return null
  }

  searchEngine = new SearchEngine(projectPath, rules)
  searchPreviewRequestId += 1
  searchStatsRequestId += 1
  searchEngine.warmIndex()
  return searchEngine
}

function getSearchEngine(): SearchEngine | null {
  if (!rules) return null
  if (!searchEngine) return resetSearchEngine()
  return searchEngine
}

// ==================== Action Handlers ====================

async function handleInit(id: string, payload: Record<string, unknown>): Promise<void> {
  const fsPath = payload.path as string
  const wslConfig = payload.wslConfig as { enabled: boolean; basePath: string } | undefined

  try {
    await fs.stat(fsPath)

    projectPath = fsPath
    rules = new IgnoreRules(fsPath)
    await rules.initialize()

    // Save WSL config if provided
    if (wslConfig) {
      await rules.updateWslConfig(wslConfig.enabled, wslConfig.basePath, true)
    }

    resetSearchEngine()
    const rootNode = await buildTreeNode(rules, fsPath, '.')

    const cached_search_stats: Record<string, number> = {}
    const cache = rules.getSearchCache()
    for (const [k, v] of Object.entries(cache)) {
      cached_search_stats[k] = v.length
    }

    sendSuccess(id, { tree: rootNode, cached_search_stats, project_path: fsPath })
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

async function handleSearchPreview(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendSuccess(id, { files: [] })

  const keyword = typeof payload.keyword === 'string' ? payload.keyword : ''
  const maxResults =
    typeof payload.maxResults === 'number' ? Math.min(Math.max(payload.maxResults, 1), 100) : 50
  if (!keyword.trim()) return sendSuccess(id, { files: [] })

  const engine = getSearchEngine()
  if (!engine) return sendSuccess(id, { files: [] })

  const requestId = ++searchPreviewRequestId
  const files = await engine.searchPreview(keyword, maxResults, {
    shouldCancel: () => searchPreviewRequestId !== requestId
  })
  sendSuccess(id, { files })
}

async function handleCancelSearchPreview(id: string): Promise<void> {
  searchPreviewRequestId += 1
  sendSuccess(id, { status: 'cancelled' })
}

async function handleSearchStats(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendSuccess(id, { stats: {} })

  const keywords = payload.keywords as string[] | undefined
  const quickOnly = Boolean(payload.quickOnly)
  const safeKeywords = Array.isArray(keywords)
    ? keywords.map((k) => k.trim()).filter(Boolean)
    : []
  if (safeKeywords.length === 0) return sendSuccess(id, { stats: {} })

  const engine = getSearchEngine()
  if (!engine) return sendSuccess(id, { stats: {} })

  // Read cache first for quick return
  const cache = rules.getSearchCache()
  const stats: Record<string, number> = {}
  const uncachedKeywords: string[] = []

  for (const keyword of safeKeywords) {
    if (cache[keyword]) {
      stats[keyword] = cache[keyword].length
    } else {
      uncachedKeywords.push(keyword)
    }
  }

  if (uncachedKeywords.length > 0) {
    const requestId = ++searchStatsRequestId
    const newlyFetchedStats = await engine.getSearchStats(uncachedKeywords, {
      quickOnly,
      shouldCancel: () => searchStatsRequestId !== requestId
    })
    for (const [k, count] of Object.entries(newlyFetchedStats)) {
      stats[k] = count
    }
  }

  sendSuccess(id, { stats })
}

async function handleSearchAddKeyword(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')

  const keyword = payload.keyword as string
  const current = rules.getSearchKeywords()
  const trimmed = typeof keyword === 'string' ? keyword.trim() : ''
  if (!trimmed) return sendSuccess(id, { keywords: current })

  await rules.updateSearchKeywords([...current, trimmed], true)
  sendSuccess(id, { keywords: rules.getSearchKeywords() })
}

async function handleSearchRemoveKeyword(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')

  const keyword = payload.keyword as string
  const trimmed = typeof keyword === 'string' ? keyword.trim() : ''
  const current = rules.getSearchKeywords()
  const updated = current.filter((item) => item !== trimmed)
  await rules.updateSearchKeywords(updated, true)
  sendSuccess(id, { keywords: rules.getSearchKeywords() })
}

async function handleSearchGetKeywords(id: string): Promise<void> {
  if (!rules) return sendSuccess(id, { keywords: [] })
  sendSuccess(id, { keywords: rules.getSearchKeywords() })
}

async function handleSearchGetMatchCount(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendSuccess(id, { count: 0 })

  const keywords = payload.keywords as string[]
  const safeKeywords = Array.isArray(keywords) ? keywords : []
  if (safeKeywords.length === 0) return sendSuccess(id, { count: 0 })

  const engine = getSearchEngine()
  if (!engine) return sendSuccess(id, { count: 0 })

  const results = await engine.search(safeKeywords, { quickOnly: true })
  sendSuccess(id, { count: results.length })
}

async function handleGetSettings(id: string): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  sendSuccess(id, {
    ui_preferences: rules.getUiPreferences(),
    priority_roots: rules.getPriorityRoots()
  })
}

async function handleSaveSettings(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  const selectedFormats = payload.selectedFormats as string[]
  const splitEnabled = payload.splitEnabled as boolean
  const splitCount = payload.splitCount as number
  await rules.updateUiPreferences(selectedFormats, splitEnabled, splitCount, true)
  sendSuccess(id, {})
}

async function handleGetWslConfig(id: string): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  sendSuccess(id, { config: rules.getWslConfig() })
}

async function handleSaveWslConfig(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')

  const enabled = payload.enabled as boolean
  const basePath = payload.basePath as string

  if (enabled && basePath) {
    const trimmed = basePath.trim()
    if (!trimmed.startsWith('\\\\wsl.localhost\\') && !trimmed.startsWith('\\\\wsl$\\')) {
      return sendError(id, 'WSL Base Path phải bắt đầu bằng \\\\wsl.localhost\\ hoặc \\\\wsl$\\')
    }
  }

  await rules.updateWslConfig(enabled, basePath, true)
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
    resetSearchEngine()
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
    resetSearchEngine()
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
  const searchKeywords = payload.searchKeywords as string[] | undefined
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
      searchKeywords
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
      case 'SEARCH_PREVIEW':
        return handleSearchPreview(id, p)
      case 'CANCEL_SEARCH_PREVIEW':
        return handleCancelSearchPreview(id)
      case 'SEARCH_STATS':
        return handleSearchStats(id, p)
      case 'SEARCH_ADD_KEYWORD':
        return handleSearchAddKeyword(id, p)
      case 'SEARCH_REMOVE_KEYWORD':
        return handleSearchRemoveKeyword(id, p)
      case 'SEARCH_GET_KEYWORDS':
        return handleSearchGetKeywords(id)
      case 'SEARCH_GET_MATCH_COUNT':
        return handleSearchGetMatchCount(id, p)
      case 'GET_SETTINGS':
        return handleGetSettings(id)
      case 'SAVE_SETTINGS':
        return handleSaveSettings(id, p)
      case 'GET_WSL_CONFIG':
        return handleGetWslConfig(id)
      case 'SAVE_WSL_CONFIG':
        return handleSaveWslConfig(id, p)
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
