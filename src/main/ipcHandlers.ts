import { ipcMain, dialog, shell, clipboard, Menu, BrowserWindow } from 'electron'
import type { Rectangle } from 'electron'
import fs from 'fs/promises'
import { readTextFile } from './core/fileUtils'
import { copyFilesToClipboard } from './clipboard'
import { WorkerManager } from './WorkerManager'
import type { WorkerAction } from './worker/protocol'
import path from 'path'

// ---- QUẢN LÝ STATE THEO TỪNG WINDOW ----
interface WindowState {
  workerManager: WorkerManager | null
}

const windowStates = new Map<number, WindowState>()
const MINI_CONTENT_WIDTH = 320
const MINI_CONTENT_HEIGHT = 160
const MINI_MIN_CONTENT_WIDTH = 300
const MINI_MIN_CONTENT_HEIGHT = 150

export function getWindowState(event: Electron.IpcMainInvokeEvent): WindowState {
  const id = event.sender.id
  if (!windowStates.has(id)) {
    windowStates.set(id, {
      workerManager: null
    })
  }
  return windowStates.get(id)!
}

export async function cleanupWindowState(webContentsId: number): Promise<void> {
  const state = windowStates.get(webContentsId)
  if (state) {
    // Kill the worker process when window closes
    if (state.workerManager) {
      await state.workerManager.kill().catch(() => {})
    }
    windowStates.delete(webContentsId)
  }
}

// Gửi IPC an toàn, tránh crash nếu Window đã bị đóng
function safeSend(sender: Electron.WebContents, channel: string, ...args: unknown[]): void {
  if (!sender.isDestroyed()) {
    sender.send(channel, ...args)
  }
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Helper: Gửi request tới Worker, tự xử lý trường hợp Worker chưa sẵn sàng
async function workerSend(
  state: WindowState,
  action: string,
  payload?: Record<string, unknown>,
  progressCallback?: (progress: number, message: string) => void
): Promise<unknown> {
  if (!state.workerManager || !state.workerManager.isRunning) {
    throw new Error('Project chưa được load')
  }
  return state.workerManager.send(action as WorkerAction, payload, progressCallback)
}

// ------------------------------------------

export function registerIpcHandlers(): void {
  const windowBoundsMap = new Map<number, Rectangle>()

  ipcMain.handle('window:togglePin', (event, isPinned: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { error: 'Window not found', isPinned: !isPinned }

    const winId = window.id

    if (isPinned) {
      windowBoundsMap.set(winId, window.getBounds())

      const bounds = window.getBounds()
      const contentBounds = window.getContentBounds()
      const frameWidth = Math.max(0, bounds.width - contentBounds.width)
      const frameHeight = Math.max(0, bounds.height - contentBounds.height)

      window.setMinimumSize(
        MINI_MIN_CONTENT_WIDTH + frameWidth,
        MINI_MIN_CONTENT_HEIGHT + frameHeight
      )
      window.setContentSize(MINI_CONTENT_WIDTH, MINI_CONTENT_HEIGHT, true)
      window.setAlwaysOnTop(true, 'screen-saver')
    } else {
      window.setAlwaysOnTop(false)
      window.setMinimumSize(900, 600)

      const oldBounds = windowBoundsMap.get(winId)
      if (oldBounds) {
        window.setBounds(oldBounds, true)
        windowBoundsMap.delete(winId)
      } else {
        window.setSize(1200, 750, true)
      }
    }

    return { status: 'success', isPinned }
  })

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
      // 1. Kill previous worker if any
      if (state.workerManager) {
        await state.workerManager.kill().catch(() => {})
        state.workerManager = null
      }

      // 2. Resolve the actual FS path for validation
      const actualFsPath = folderPath.trim()

      // 3. Create and start WorkerManager
      const manager = new WorkerManager({
        projectPath: actualFsPath
      })

      await manager.start()
      state.workerManager = manager

      // 4. Set up crash handler
      manager.on('crash', (err: Error) => {
        safeSend(event.sender, 'generate:finished', false, `Worker crashed: ${err.message}`, null)
      })

      // 5. Send INIT to Worker
      const result = await manager.send('INIT', {
        path: actualFsPath
      }) as Record<string, unknown>

      if (result.error) {
        // INIT failed — kill zombie worker to prevent issues
        await manager.kill().catch(() => {})
        state.workerManager = null
        return { error: String(result.error) }
      }

      // 6. Mark as initialized — enables auto-restart on crash
      manager.markInitialized()

      return {
        status: 'success',
        project_path: actualFsPath,
        tree: result.tree,
        attention_patterns: Array.isArray(result.attention_patterns) ? result.attention_patterns : []
      }
    } catch (err: unknown) {
      // Clean up worker if it was started but INIT threw
      if (state.workerManager) {
        await state.workerManager.kill().catch(() => {})
        state.workerManager = null
      }
      const message = getErrorMessage(err)
      if (message.includes('ENOENT') || message.includes('no such file')) {
        return {
          error: 'Không thể truy cập thư mục. Kiểm tra đường dẫn dự án.'
        }
      }
      return { error: message }
    }
  })

  ipcMain.handle('tree:toggleNode', async (event, args: { path: string; isChecked: boolean }) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'TOGGLE_NODE', {
        path: args.path,
        isChecked: args.isChecked
      })
      return { status: 'success', ...(result as Record<string, unknown>) }
    } catch (err: unknown) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('tree:showContextMenu', async (event, args: { path: string; isDir: boolean }) => {
    // Context menu needs Electron Menu — stays on Main process
    return new Promise((resolve) => {
      const pattern = args.isDir ? `${args.path}/` : args.path;
      const menu = Menu.buildFromTemplate([
        { label: `Add "${pattern}" to Global Ignore`, click: () => resolve(pattern) },
        { type: 'separator' },
        { label: 'Cancel', click: () => resolve(null) }
      ]);
      menu.once('menu-will-close', () => setTimeout(() => resolve(null), 100));
      const window = BrowserWindow.fromWebContents(event.sender);
      menu.popup(window ? { window } : undefined);
    });
  })

  ipcMain.handle('tree:updateSelection', async (event, args: { includedPaths: string[]; excludedPaths: string[] }) => {
    const state = getWindowState(event)
    try {
      await workerSend(state, 'UPDATE_SELECTION', {
        includedPaths: args.includedPaths,
        excludedPaths: args.excludedPaths
      })
      return { status: 'success' }
    } catch (err: unknown) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('tree:updatePriority', async (event, listRoots: string[]) => {
    const state = getWindowState(event)
    try {
      await workerSend(state, 'UPDATE_PRIORITY', { listRoots })
      return { status: 'success' }
    } catch (err: unknown) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('settings:get', async (event) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'GET_SETTINGS') as Record<string, unknown>
      return { status: 'success', ...result }
    } catch (err: unknown) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('settings:save', async (event, args: { selectedFormats: string[]; splitEnabled: boolean; splitCount: number; instructionsEnabled?: boolean }) => {
    const state = getWindowState(event)
    try {
      await workerSend(state, 'SAVE_SETTINGS', {
        selectedFormats: args.selectedFormats,
        splitEnabled: args.splitEnabled,
        splitCount: args.splitCount,
        instructionsEnabled: args.instructionsEnabled
      })
      return { status: 'success' }
    } catch (err: unknown) {
      return { error: getErrorMessage(err) }
    }
  })

  // ---- Attention Context ----

  ipcMain.handle('attention:preview', async (event, patterns: string[]) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'ATTENTION_PREVIEW', { patterns }) as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { files: [], error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('prompt:getInstruction', async (event) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'READ_PROMPT_FILE') as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { content: '', error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('prompt:resetInstruction', async (event) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'RESET_PROMPT_FILE') as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { content: '', error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('attention:savePatterns', async (event, patterns: string[]) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'SAVE_ATTENTION_PATTERNS', { patterns }) as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { patterns: [], error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('plan:preview', async (event, text: string) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'PREVIEW_PLAN', { text }) as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { files: [], patterns: [], error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('plan:getText', async (event) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'READ_PLAN_TEXT') as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { content: '', error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('plan:saveText', async (event, text: string) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'SAVE_PLAN_TEXT', { text }) as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { content: '', error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('ignore:getCustomPatterns', async (event) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'GET_IGNORE_PATTERNS') as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { patterns: [], error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('ignore:addCustomPattern', async (event, pattern: string) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'ADD_IGNORE_PATTERN', { pattern }) as Record<string, unknown>
      return { status: 'success', ...result }
    } catch (err: unknown) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('ignore:removeCustomPattern', async (event, pattern: string) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'REMOVE_IGNORE_PATTERN', { pattern }) as Record<string, unknown>
      return { status: 'success', ...result }
    } catch (err: unknown) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('ignore:previewPattern', async (event, args: { pattern: string; maxResults?: number }) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'PREVIEW_IGNORE_PATTERN', {
        pattern: args.pattern,
        maxResults: args.maxResults
      }) as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { files: [], error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('generate:start', async (event, args: { selectedFormats: string[]; splitEnabled: boolean; splitCount: number; attentionPatterns?: string[]; planText?: string }) => {
    const state = getWindowState(event)
    if (!state.workerManager || !state.workerManager.isRunning) {
      return { error: 'Project chưa được load' }
    }

    // Progress callback: forward to Renderer
    const progressCallback = (progress: number, message: string): void => {
      safeSend(event.sender, 'generate:progress', progress, message)
    }

    // Run generation asynchronously
    const runGeneration = async (): Promise<void> => {
      try {
        const result = await state.workerManager!.send('GENERATE', {
          selectedFormats: args.selectedFormats,
          splitEnabled: args.splitEnabled,
          splitCount: args.splitCount,
          attentionPatterns: args.attentionPatterns,
          planText: args.planText
        }, progressCallback) as Record<string, unknown>

        const success = Boolean(result?.success)
        const message = String(result?.message || '')
        const stats = result?.stats || null

        safeSend(event.sender, 'generate:finished', success, message, stats)
      } catch (error: unknown) {
        const errorMsg = getErrorMessage(error)
        console.error('\n[FATAL ERROR] Generation Process Failed:', error)
        safeSend(event.sender, 'generate:finished', false, `Lỗi hệ thống: ${errorMsg}`, null)
      }
    }

    // Fire and forget — return "started" immediately
    runGeneration()
    return { status: 'started' }
  })

  ipcMain.handle('generate:cancel', async (event) => {
    const state = getWindowState(event)
    try {
      await workerSend(state, 'CANCEL_GENERATE')
      return { status: 'cancelling' }
    } catch {
      return { status: 'cancelling' }
    }
  })

  // ---- File Operations (stay on Main Process — need Electron APIs) ----

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

  ipcMain.handle('file:openFile', async (_event, filePath: string) => {
    if (!filePath) return { error: 'Invalid path' }

    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath)

    const openError = await shell.openPath(resolvedPath)
    if (openError) return { error: openError }
    return { status: 'success' }
  })

  ipcMain.handle('file:openOutputFolder', async (event) => {
    const state = getWindowState(event)
    if (!state.workerManager) return { error: 'Chưa load dự án' }

    // Determine output dir path (on Windows side)
    const outputDir = path.join(state.workerManager.projectPath, '_codebase')
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
    if (!state.workerManager) return { error: 'Chưa load dự án' }

    const settingsPath = path.join(state.workerManager.projectPath, '_codebase', 'settings.json')
    try {
      await fs.access(settingsPath)
      shell.openPath(settingsPath)
      return { status: 'success' }
    } catch {
      return { error: 'File cấu hình chưa tồn tại' }
    }
  })

  ipcMain.handle('file:openInstructionsFile', async (event) => {
    const state = getWindowState(event)
    if (!state.workerManager) return { error: 'Chưa load dự án' }

    const instructionsPath = path.join(state.workerManager.projectPath, '_codebase', 'instructions.md')
    try {
      await fs.access(instructionsPath)
      shell.openPath(instructionsPath)
      return { status: 'success' }
    } catch {
      return { error: 'File instructions.md chưa tồn tại' }
    }
  })

  ipcMain.handle('file:autoCopy', async (event, fileNames: string[]) => {
    const state = getWindowState(event)
    if (!state.workerManager) return { error: 'Chưa load dự án' }

    const outputDir = path.join(state.workerManager.projectPath, '_codebase')
    const absPaths = fileNames.map(f => path.resolve(outputDir, f))
    const result = await copyFilesToClipboard(absPaths)
    if (result.success) {
      return { status: 'success', message: result.message }
    }
    return { error: result.message }
  })

  ipcMain.handle('file:clearOutput', async (event) => {
    const state = getWindowState(event)
    try {
      await workerSend(state, 'CLEAR_OUTPUT')
      return { status: 'success', message: 'Đã dọn dẹp thư mục output.' }
    } catch {
      return { status: 'success' }
    }
  })

  ipcMain.handle('util:testConnection', async (_event, message: string) => {
    console.log(`Renderer -> Main: ${message}`)
    return 'Kết nối thành công từ Electron (Main Process)!'
  })

  // ---- Copy combined file contents to clipboard ----
  ipcMain.handle(
    'clipboard:copyCombinedFiles',
    async (_event, files: { absPath: string; relPath: string }[]) => {
      if (!files || files.length === 0) {
        return { error: 'Không có file nào để copy.' }
      }
      try {
        let combinedContent = ''
        for (const file of files) {
          const text = await readTextFile(file.absPath)
          combinedContent += `// ${file.relPath}\n${text}\n\n`
        }
        clipboard.writeText(combinedContent.trimEnd())
        return { status: 'success', message: `Đã copy nội dung ${files.length} file.` }
      } catch (err: unknown) {
        return { error: getErrorMessage(err) }
      }
    }
  )
}
