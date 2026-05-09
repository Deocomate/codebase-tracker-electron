import { ipcMain, dialog, shell, Menu, BrowserWindow } from 'electron'
import fs from 'fs/promises'
import { copyFilesToClipboard } from './clipboard'
import { resolveWorkspacePath } from './core/path-resolver'
import { WorkerManager } from './WorkerManager'
import path from 'path'

// ---- QUẢN LÝ STATE THEO TỪNG WINDOW ----
interface WindowState {
  workerManager: WorkerManager | null
}

const windowStates = new Map<number, WindowState>()

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
  return state.workerManager.send(action as any, payload, progressCallback)
}

// ------------------------------------------

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('project:load', async (event, folderPath: string, frontendWslConfig?: { enabled: boolean; basePath: string }) => {
    if (!folderPath) return { error: 'Invalid path' }
    const state = getWindowState(event)

    try {
      // 1. Kill previous worker if any
      if (state.workerManager) {
        await state.workerManager.kill().catch(() => {})
        state.workerManager = null
      }

      // 2. Resolve the actual FS path for validation
      let actualFsPath = folderPath.trim()
      if (frontendWslConfig && frontendWslConfig.enabled) {
        actualFsPath = resolveWorkspacePath(folderPath, frontendWslConfig)
      }

      // 3. Create and start WorkerManager
      const manager = new WorkerManager({
        projectPath: actualFsPath,
        wslConfig: frontendWslConfig
      })

      // 4. Validate WSL environment if needed
      if (manager.isWsl) {
        const validation = await manager.validateEnvironment()
        if (!validation.ok) {
          return { error: validation.error }
        }
      }

      await manager.start()
      state.workerManager = manager

      // 5. Set up crash handler
      manager.on('crash', (err: Error) => {
        safeSend(event.sender, 'generate:finished', false, `Worker crashed: ${err.message}`, null)
      })

      // 6. Send INIT to Worker
      // For WSL projects, send the Linux native path to the Worker
      const workerPath = manager.isWsl && manager.linuxProjectPath
        ? manager.linuxProjectPath
        : actualFsPath

      const result = await manager.send('INIT', {
        path: workerPath,
        wslConfig: frontendWslConfig
      }) as Record<string, unknown>

      if (result && (result as any).error) {
        // INIT failed — kill zombie worker to prevent issues
        await manager.kill().catch(() => {})
        state.workerManager = null
        return { error: (result as any).error }
      }

      // 7. Mark as initialized — enables auto-restart on crash
      manager.markInitialized()

      return {
        status: 'success',
        project_path: actualFsPath,
        tree: (result as any)?.tree,
        cached_search_stats: (result as any)?.cached_search_stats || {}
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
          error: 'Không thể truy cập thư mục. Nếu bạn dùng định dạng /home/..., hãy đảm bảo đã bật WSL Mode và nhập đúng Base Path.'
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

  ipcMain.handle('settings:save', async (event, args: { selectedFormats: string[]; splitEnabled: boolean; splitCount: number }) => {
    const state = getWindowState(event)
    try {
      await workerSend(state, 'SAVE_SETTINGS', {
        selectedFormats: args.selectedFormats,
        splitEnabled: args.splitEnabled,
        splitCount: args.splitCount
      })
      return { status: 'success' }
    } catch (err: unknown) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('wsl:getConfig', async (event) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'GET_WSL_CONFIG') as Record<string, unknown>
      return { status: 'success', ...result }
    } catch (err: unknown) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('wsl:saveConfig', async (event, args: { enabled: boolean; basePath: string }) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'SAVE_WSL_CONFIG', {
        enabled: args.enabled,
        basePath: args.basePath
      })
      if (result && (result as any).error) {
        return { error: (result as any).error }
      }
      return { status: 'success' }
    } catch (err: unknown) {
      return { error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('search:addKeyword', async (event, keyword: string) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'SEARCH_ADD_KEYWORD', { keyword }) as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { keywords: [], error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('search:removeKeyword', async (event, keyword: string) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'SEARCH_REMOVE_KEYWORD', { keyword }) as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { keywords: [], error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('search:getMatchCount', async (event, keywords: string[]) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'SEARCH_GET_MATCH_COUNT', { keywords }) as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { count: 0, error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('search:preview', async (event, args: { keyword: string; maxResults?: number }) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'SEARCH_PREVIEW', {
        keyword: args.keyword,
        maxResults: args.maxResults
      }) as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { files: [], error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('search:cancelPreview', async (event) => {
    const state = getWindowState(event)
    try {
      await workerSend(state, 'CANCEL_SEARCH_PREVIEW')
      return { status: 'cancelled' }
    } catch {
      return { status: 'cancelled' }
    }
  })

  ipcMain.handle('search:getStats', async (event, args: string[] | { keywords: string[]; quickOnly?: boolean }) => {
    const state = getWindowState(event)
    try {
      const keywords = Array.isArray(args) ? args : args?.keywords
      const quickOnly = !Array.isArray(args) && Boolean(args?.quickOnly)
      const result = await workerSend(state, 'SEARCH_STATS', {
        keywords,
        quickOnly
      }) as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { stats: {}, error: getErrorMessage(err) }
    }
  })

  ipcMain.handle('search:getKeywords', async (event) => {
    const state = getWindowState(event)
    try {
      const result = await workerSend(state, 'SEARCH_GET_KEYWORDS') as Record<string, unknown>
      return result
    } catch (err: unknown) {
      return { keywords: [], error: getErrorMessage(err) }
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

  ipcMain.handle('generate:start', async (event, args: { selectedFormats: string[]; splitEnabled: boolean; splitCount: number; searchKeywords?: string[] }) => {
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
          searchKeywords: args.searchKeywords
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
}
