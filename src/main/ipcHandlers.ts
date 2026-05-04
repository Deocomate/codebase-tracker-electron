import { ipcMain, dialog, shell } from 'electron'
import fs from 'fs/promises'
import { IgnoreRules } from './core/ignoreRules'
import { ProjectProcessor } from './core/processor'
import { copyFilesToClipboard } from './core/clipboard'
import path from 'path'

// ---- QUẢN LÝ STATE THEO TỪNG WINDOW ----
interface WindowState {
  rules: IgnoreRules | null
  cancelRef: { cancelled: boolean }
}

const windowStates = new Map<number, WindowState>()

export function getWindowState(event: Electron.IpcMainInvokeEvent): WindowState {
  const id = event.sender.id
  if (!windowStates.has(id)) {
    windowStates.set(id, { rules: null, cancelRef: { cancelled: false } })
  }
  return windowStates.get(id)!
}

export function cleanupWindowState(webContentsId: number): void {
  windowStates.delete(webContentsId)
}

// Gửi IPC an toàn, tránh crash nếu Window đã bị đóng
function safeSend(sender: Electron.WebContents, channel: string, ...args: any[]): void {
  if (!sender.isDestroyed()) {
    sender.send(channel, ...args)
  }
}

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
  return paths.filter((candidate) => candidate !== targetPath && !isDescendantPath(candidate, targetPath))
}

function sortTreeChildren(a: any, b: any, priorityMap: Map<string, number>): number {
  const idxA = priorityMap.has(a.id) ? priorityMap.get(a.id)! : Infinity
  const idxB = priorityMap.has(b.id) ? priorityMap.get(b.id)! : Infinity

  if (idxA !== Infinity || idxB !== Infinity) {
    if (idxA !== idxB) return idxA - idxB
  }

  const weightA = (a.checked === 'checked' || a.checked === 'partial') ? 0 : 1
  const weightB = (b.checked === 'checked' || b.checked === 'partial') ? 0 : 1
  if (weightA !== weightB) return weightA - weightB
  if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
  return a.name.localeCompare(b.name)
}

async function buildTreeNode(rules: IgnoreRules, absPath: string, relPath: string): Promise<any> {
  const stat = await fs.stat(absPath)
  const isDir = stat.isDirectory()
  const name = path.basename(absPath)
  const blocked = relPath !== '.' && rules.isGloballyIgnoredByRelPath(relPath, isDir)
  const checkedState = rules.getPathSelectionState(relPath, isDir)

  const node: any = {
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
    const priorityRoots = rules.getPriorityRoots()
    const priorityMap = new Map(priorityRoots.map((p, i) => [p, i]))
    const entries = await fs.readdir(absPath, { withFileTypes: true })
    let totalTokens = 0

    for (const entry of entries) {
      if (entry.name === '_codebase') continue
      const childAbs = path.join(absPath, entry.name)
      const childRel = relPath === '.' ? entry.name : `${relPath}/${entry.name}`
      const child = await buildTreeNode(rules, childAbs, childRel)
      node.children.push(child)
      totalTokens += child.tokens
    }

    node.children.sort((a: any, b: any) => sortTreeChildren(a, b, priorityMap))
    node.tokens = totalTokens
  }

  return node
}
// ------------------------------------------

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('project:load', async (event, folderPath: string) => {
    if (!folderPath) return { error: 'Invalid path' }

    const state = getWindowState(event)

    try {
      const resolvedPath = path.resolve(folderPath)
      state.rules = new IgnoreRules(resolvedPath)
      await state.rules.initialize()

      const rootNode = await buildTreeNode(state.rules, resolvedPath, '.')
      return { status: 'success', project_path: resolvedPath, tree: rootNode }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('tree:toggleNode', async (event, args: { path: string; isChecked: boolean }) => {
    const state = getWindowState(event)
    if (!state.rules) return { error: 'Project chưa được load' }

    const { path: nodePath, isChecked } = args
    const normalizedPath = normalizeRelPath(nodePath)
    const inc = pruneSelectionPaths([...state.rules.settings.included_paths], normalizedPath)
    const exc = pruneSelectionPaths([...state.rules.settings.excluded_paths], normalizedPath)

    if (isChecked) {
      if (!inc.includes(normalizedPath)) inc.push(normalizedPath)
    } else {
      if (!exc.includes(normalizedPath)) exc.push(normalizedPath)
    }

    await state.rules.updateSelectionPaths(inc, exc, true)
    const resolvedPath = state.rules.projectPath

    const tree = await buildTreeNode(state.rules, resolvedPath, '.')
    return { status: 'success', tree }
  })

  ipcMain.handle('tree:updateSelection', async (event, args: { includedPaths: string[]; excludedPaths: string[] }) => {
    const state = getWindowState(event)
    if (!state.rules) return { error: 'Project chưa được load' }
    await state.rules.updateSelectionPaths(args.includedPaths, args.excludedPaths, true)
    return { status: 'success' }
  })

  ipcMain.handle('tree:updatePriority', async (event, listRoots: string[]) => {
    const state = getWindowState(event)
    if (!state.rules) return { error: 'Project chưa được load' }
    await state.rules.updatePriorityRoots(listRoots, true)
    return { status: 'success' }
  })

  ipcMain.handle('settings:get', async (event) => {
    const state = getWindowState(event)
    if (!state.rules) return { error: 'Project chưa được load' }
    return {
      status: 'success',
      ui_preferences: state.rules.getUiPreferences(),
      priority_roots: state.rules.getPriorityRoots()
    }
  })

  ipcMain.handle('settings:save', async (event, args: { selectedFormats: string[]; splitEnabled: boolean; splitCount: number }) => {
    const state = getWindowState(event)
    if (!state.rules) return { error: 'Project chưa được load' }
    await state.rules.updateUiPreferences(args.selectedFormats, args.splitEnabled, args.splitCount, true)
    return { status: 'success' }
  })

  ipcMain.handle('generate:start', async (event, args: { selectedFormats: string[]; splitEnabled: boolean; splitCount: number }) => {
    const state = getWindowState(event)
    if (!state.rules) return { error: 'Project chưa được load' }

    // Tạo mới cancelRef cho mỗi lần generate để tránh chia sẻ state giữa các worker
    const cancelRef = { cancelled: false }
    state.cancelRef = cancelRef
    const actualSplitCount = args.splitEnabled ? args.splitCount : 0

    // Bọc khởi tạo Processor trong try/catch đề phòng Constructor lỗi
    let processor: ProjectProcessor
    try {
      processor = new ProjectProcessor(state.rules.projectPath, state.rules)
    } catch (err: any) {
      return { error: `Lỗi khởi tạo Processor: ${err.message || String(err)}` }
    }

    // Hàm chạy ngầm (Background worker)
    const runGeneration = async (): Promise<void> => {
      try {
        const sendProgress = (msg: string, prog: number) => {
          safeSend(event.sender, 'generate:progress', prog, msg)
        }

        const { success, message, stats } = await processor.run(
          sendProgress,
          sendProgress,
          cancelRef,
          args.selectedFormats,
          actualSplitCount
        )

        safeSend(event.sender, 'generate:finished', success, message, stats)

      } catch (error: any) {
        // [BẮT LỖI TỐI THƯỢNG] Ngăn treo app
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('\n[FATAL ERROR] Generation Process Failed:', error)

        safeSend(
          event.sender,
          'generate:finished',
          false,
          `Lỗi hệ thống: ${errorMsg}`,
          null
        )
      }
    }

    // Chạy bất đồng bộ, trả về "started" ngay lập tức cho UI
    runGeneration()
    return { status: 'started' }
  })

  ipcMain.handle('generate:cancel', async (event) => {
    const state = getWindowState(event)
    if (state.cancelRef) {
      state.cancelRef.cancelled = true
    }
    return { status: 'cancelling' }
  })

  ipcMain.handle('file:openExplorer', async (_event, filePath: string) => {
    const resolvedPath = path.resolve(filePath)
    if (process.platform === 'linux') {
      const { exec } = await import('child_process')
      exec(`xdg-open "${path.dirname(resolvedPath)}"`)
    } else {
      shell.showItemInFolder(resolvedPath)
    }
    return { status: 'success' }
  })

  ipcMain.handle('file:openOutputFolder', async (event) => {
    const state = getWindowState(event)
    if (!state.rules) return { error: 'Chưa load dự án' }
    const outputDir = path.join(state.rules.projectPath, '_codebase')
    try {
      await fs.access(outputDir)
      shell.openPath(outputDir)
      return { status: 'success' }
    } catch {
      return { error: 'Thư mục output chưa tồn tại, hãy chạy Scan trước!' }
    }
  })

  ipcMain.handle('file:openSettingsFile', async (event) => {
    const state = getWindowState(event)
    if (!state.rules) return { error: 'Chưa load dự án' }
    const settingsPath = state.rules.getSettingsPath()
    try {
      await fs.access(settingsPath)
      shell.openPath(settingsPath)
      return { status: 'success' }
    } catch {
      return { error: 'File cấu hình chưa tồn tại' }
    }
  })

  ipcMain.handle('file:autoCopy', async (event, fileNames: string[]) => {
    const state = getWindowState(event)
    if (!state.rules) return { error: 'Chưa load dự án' }
    const outputDir = path.join(state.rules.projectPath, '_codebase')
    const absPaths = fileNames.map(f => path.resolve(outputDir, f))
    const result = await copyFilesToClipboard(absPaths)
    if (result.success) {
      return { status: 'success', message: result.message }
    }
    return { error: result.message }
  })

  ipcMain.handle('file:clearOutput', async (event) => {
    const state = getWindowState(event)
    if (!state.rules) return { error: 'Chưa load dự án' }
    const outputDir = path.join(state.rules.projectPath, '_codebase')
    try {
      await fs.rm(outputDir, { recursive: true, force: true })
      return { status: 'success', message: 'Đã dọn dẹp thư mục output.' }
    } catch {
      return { status: 'success' }
    }
  })

  ipcMain.handle('util:testConnection', async (_event, message: string) => {
    console.log(`Renderer -> Main: ${message}`)
    return 'Kết nối thành công từ Electron (Main Process)!'
  })
}
