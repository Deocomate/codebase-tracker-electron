import { ipcMain, dialog, shell } from 'electron'
import fs from 'fs/promises'
import { IgnoreRules } from './core/ignoreRules'
import { ProjectProcessor } from './core/processor'
import { copyFilesToClipboard } from './core/clipboard'
import path from 'path'

// ---- State ----
let currentRules: IgnoreRules | null = null
let cancelRef: { cancelled: boolean } = { cancelled: false }

export function registerIpcHandlers(): void {
  // ==================== DIALOGS ====================
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return canceled ? null : filePaths[0]
  })

  // ==================== PROJECT ====================
  ipcMain.handle('project:load', async (_event, folderPath: string) => {
    if (!folderPath) return { error: 'Invalid path' }

    try {
      const resolvedPath = path.resolve(folderPath)
      currentRules = new IgnoreRules(resolvedPath)
      await currentRules.initialize()

      // Build tree node recursively
      async function buildTreeNode(absPath: string, relPath: string): Promise<any> {
        const stat = await fs.stat(absPath)
        const isDir = stat.isDirectory()
        const name = path.basename(absPath)

        const blocked = relPath !== '.' && currentRules!.isGloballyIgnoredByRelPath(relPath, isDir)
        const selectable = isDir || true // isTextFile check in scan
        const checkedState = currentRules!.getPathSelectionState(relPath, isDir)

        const node: any = {
          id: relPath,
          name,
          is_dir: isDir,
          is_ignored: blocked,
          selectable,
          checked: checkedState,
          children: []
        }

        if (isDir && !blocked) {
          // Lấy danh sách ưu tiên từ settings
          const priorityRoots = currentRules!.getPriorityRoots()
          // Tối ưu hóa bằng Map để tra cứu O(1)
          const priorityMap = new Map(priorityRoots.map((p, i) => [p, i]))

          const entries = await fs.readdir(absPath, { withFileTypes: true })
          // Build children map trước
          for (const entry of entries) {
            if (entry.name === '_codebase') continue
            const childAbs = path.join(absPath, entry.name)
            const childRel = relPath === '.' ? entry.name : `${relPath}/${entry.name}`
            const child = await buildTreeNode(childAbs, childRel)
            node.children.push(child)
          }

          // --- THUẬT TOÁN SẮP XẾP CHILDREN ---
          node.children.sort((a: any, b: any) => {
            // 1. Ưu tiên thứ tự kéo thả (priority_roots)
            const idxA = priorityMap.has(a.id) ? priorityMap.get(a.id)! : Infinity
            const idxB = priorityMap.has(b.id) ? priorityMap.get(b.id)! : Infinity
            if (idxA !== Infinity || idxB !== Infinity) {
              if (idxA !== idxB) return idxA - idxB
            }

            // 2. Ưu tiên trạng thái Track (Checked)
            const weightA = (a.checked === 'checked' || a.checked === 'partial') ? 0 : 1
            const weightB = (b.checked === 'checked' || b.checked === 'partial') ? 0 : 1
            if (weightA !== weightB) return weightA - weightB

            // 3. Ưu tiên Thư mục xếp trên File
            if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1

            // 4. Bằng cấp thì xếp theo Alphabet
            return a.name.localeCompare(b.name)
          })
        }

        return node
      }

      const rootNode = await buildTreeNode(resolvedPath, '.')
      return { status: 'success', project_path: resolvedPath, tree: rootNode }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('tree:toggleNode', async (_event, args: { path: string; isChecked: boolean }) => {
    if (!currentRules) return { error: 'Project chưa được load' }

    const { path: nodePath, isChecked } = args
    const inc = [...currentRules.settings.included_paths]
    const exc = [...currentRules.settings.excluded_paths]

    if (isChecked) {
      if (!inc.includes(nodePath)) inc.push(nodePath)
      const idx = exc.indexOf(nodePath)
      if (idx >= 0) exc.splice(idx, 1)
    } else {
      if (!exc.includes(nodePath)) exc.push(nodePath)
      const idx = inc.indexOf(nodePath)
      if (idx >= 0) inc.splice(idx, 1)
    }

    await currentRules.updateSelectionPaths(inc, exc, true)

    // Rebuild tree
    const resolvedPath = currentRules.projectPath
    async function rebuildTree(absPath: string, relPath: string): Promise<any> {
      const stat = await fs.stat(absPath)
      const isDir = stat.isDirectory()
      const name = path.basename(absPath)
      const blocked = relPath !== '.' && currentRules!.isGloballyIgnoredByRelPath(relPath, isDir)
      const checkedState = currentRules!.getPathSelectionState(relPath, isDir)

      const node: any = {
        id: relPath, name, is_dir: isDir, is_ignored: blocked,
        selectable: isDir || true, checked: checkedState, children: []
      }

      if (isDir && !blocked) {
        const priorityRoots = currentRules!.getPriorityRoots()
        const priorityMap = new Map(priorityRoots.map((p, i) => [p, i]))

        const entries = await fs.readdir(absPath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name === '_codebase') continue
          const childAbs = path.join(absPath, entry.name)
          const childRel = relPath === '.' ? entry.name : `${relPath}/${entry.name}`
          node.children.push(await rebuildTree(childAbs, childRel))
        }

        // Sắp xếp lại sau khi có children
        node.children.sort((a: any, b: any) => {
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
        })
      }
      return node
    }

    const tree = await rebuildTree(resolvedPath, '.')
    return { status: 'success', tree }
  })

  ipcMain.handle('tree:updateSelection', async (_event, args: { includedPaths: string[]; excludedPaths: string[] }) => {
    if (!currentRules) return { error: 'Project chưa được load' }
    await currentRules.updateSelectionPaths(args.includedPaths, args.excludedPaths, true)
    return { status: 'success' }
  })

  ipcMain.handle('tree:updatePriority', async (_event, listRoots: string[]) => {
    if (!currentRules) return { error: 'Project chưa được load' }
    await currentRules.updatePriorityRoots(listRoots, true)
    return { status: 'success' }
  })

  // ==================== SETTINGS ====================
  ipcMain.handle('settings:get', async () => {
    if (!currentRules) return { error: 'Project chưa được load' }
    return {
      status: 'success',
      ui_preferences: currentRules.getUiPreferences(),
      priority_roots: currentRules.getPriorityRoots()
    }
  })

  ipcMain.handle('settings:save', async (_event, args: { selectedFormats: string[]; splitEnabled: boolean; splitCount: number }) => {
    if (!currentRules) return { error: 'Project chưa được load' }
    await currentRules.updateUiPreferences(args.selectedFormats, args.splitEnabled, args.splitCount, true)
    return { status: 'success' }
  })

  // ==================== GENERATION ====================
  ipcMain.handle('generate:start', async (event, args: { selectedFormats: string[]; splitEnabled: boolean; splitCount: number }) => {
    if (!currentRules) return { error: 'Project chưa được load' }

    cancelRef = { cancelled: false }
    const actualSplitCount = args.splitEnabled ? args.splitCount : 0

    const processor = new ProjectProcessor(currentRules.projectPath, currentRules)

    // Run async — don't await (keep IPC handler responsive)
    const runGeneration = async (): Promise<void> => {
      const sendProgress = (msg: string, prog: number) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('generate:progress', prog, msg)
        }
      }

      const { success, message, stats } = await processor.run(
        sendProgress,
        sendProgress,
        cancelRef,
        args.selectedFormats,
        actualSplitCount
      )

      if (!event.sender.isDestroyed()) {
        event.sender.send('generate:finished', success, message, stats)
      }
    }

    runGeneration()
    return { status: 'started' }
  })

  ipcMain.handle('generate:cancel', async () => {
    cancelRef.cancelled = true
    return { status: 'cancelling' }
  })

  // ==================== FILE OPERATIONS ====================
  ipcMain.handle('file:openExplorer', async (_event, filePath: string) => {
    const resolvedPath = path.resolve(filePath)
    if (process.platform === 'linux') {
      // Dùng xdg-open cho Linux (shell.showItemInFolder không ổn định trên một số DE)
      const { exec } = await import('child_process')
      exec(`xdg-open "${path.dirname(resolvedPath)}"`)
    } else {
      shell.showItemInFolder(resolvedPath)
    }
    return { status: 'success' }
  })

  ipcMain.handle('file:openOutputFolder', async () => {
    if (!currentRules) return { error: 'Chưa load dự án' }
    const outputDir = path.join(currentRules.projectPath, '_codebase')
    try {
      await fs.access(outputDir)
      shell.openPath(outputDir)
      return { status: 'success' }
    } catch {
      return { error: 'Thư mục output chưa tồn tại, hãy chạy Scan trước!' }
    }
  })

  ipcMain.handle('file:openSettingsFile', async () => {
    if (!currentRules) return { error: 'Chưa load dự án' }
    const settingsPath = currentRules.getSettingsPath()
    try {
      await fs.access(settingsPath)
      shell.openPath(settingsPath)
      return { status: 'success' }
    } catch {
      return { error: 'File cấu hình chưa tồn tại' }
    }
  })

  ipcMain.handle('file:autoCopy', async (_event, fileNames: string[]) => {
    if (!currentRules) return { error: 'Chưa load dự án' }

    const outputDir = path.join(currentRules.projectPath, '_codebase')
    const absPaths = fileNames.map(f => path.resolve(outputDir, f))

    const result = await copyFilesToClipboard(absPaths)
    if (result.success) {
      return { status: 'success', message: result.message }
    }
    return { error: result.message }
  })

  ipcMain.handle('file:clearOutput', async () => {
    if (!currentRules) return { error: 'Chưa load dự án' }
    const outputDir = path.join(currentRules.projectPath, '_codebase')
    try {
      await fs.rm(outputDir, { recursive: true, force: true })
      return { status: 'success', message: 'Đã dọn dẹp thư mục output.' }
    } catch {
      return { status: 'success' } // Already doesn't exist
    }
  })

  // ==================== UTILITY ====================
  ipcMain.handle('util:testConnection', async (_event, message: string) => {
    console.log(`Renderer -> Main: ${message}`)
    return 'Kết nối thành công từ Electron (Main Process)!'
  })
}
