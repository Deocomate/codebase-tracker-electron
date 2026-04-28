import { contextBridge, ipcRenderer } from 'electron'

export interface IpcApi {
  // Dialogs
  open_directory_dialog: () => Promise<string | null>

  // Project
  load_project: (folderPath: string) => Promise<any>
  toggle_tree_node: (path: string, isChecked: boolean) => Promise<any>
  update_tree_selection: (includedPaths: string[], excludedPaths: string[]) => Promise<any>
  update_priority: (listRoots: string[]) => Promise<any>

  // Settings
  get_settings: () => Promise<any>
  save_settings: (selectedFormats: string[], splitEnabled: boolean, splitCount: number) => Promise<any>

  // Generation
  start_generation: (selectedFormats: string[], splitEnabled: boolean, splitCount: number) => Promise<any>
  cancel_generation: () => Promise<any>

  // File operations
  open_file_explorer: (path: string) => Promise<any>
  open_output_folder: () => Promise<any>
  open_settings_file: () => Promise<any>
  auto_copy_files: (fileNames: string[]) => Promise<any>
  clear_output: () => Promise<any>

  // Utility
  test_connection: (message: string) => Promise<string>

  // Event listeners (Main -> Renderer)
  onProgressUpdate: (callback: (progress: number, message: string) => void) => () => void
  onGenerationFinished: (callback: (success: boolean, message: string, stats: any) => void) => () => void
}

const api: IpcApi = {
  // ---- Dialogs ----
  open_directory_dialog: () => ipcRenderer.invoke('dialog:openDirectory'),

  // ---- Project ----
  load_project: (folderPath) => ipcRenderer.invoke('project:load', folderPath),
  toggle_tree_node: (path, isChecked) => ipcRenderer.invoke('tree:toggleNode', { path, isChecked }),
  update_tree_selection: (includedPaths, excludedPaths) =>
    ipcRenderer.invoke('tree:updateSelection', { includedPaths, excludedPaths }),
  update_priority: (listRoots) => ipcRenderer.invoke('tree:updatePriority', listRoots),

  // ---- Settings ----
  get_settings: () => ipcRenderer.invoke('settings:get'),
  save_settings: (selectedFormats, splitEnabled, splitCount) =>
    ipcRenderer.invoke('settings:save', { selectedFormats, splitEnabled, splitCount }),

  // ---- Generation ----
  start_generation: (selectedFormats, splitEnabled, splitCount) =>
    ipcRenderer.invoke('generate:start', { selectedFormats, splitEnabled, splitCount }),
  cancel_generation: () => ipcRenderer.invoke('generate:cancel'),

  // ---- File operations ----
  open_file_explorer: (path) => ipcRenderer.invoke('file:openExplorer', path),
  open_output_folder: () => ipcRenderer.invoke('file:openOutputFolder'),
  open_settings_file: () => ipcRenderer.invoke('file:openSettingsFile'),
  auto_copy_files: (fileNames) => ipcRenderer.invoke('file:autoCopy', fileNames),
  clear_output: () => ipcRenderer.invoke('file:clearOutput'),

  // ---- Utility ----
  test_connection: (message) => ipcRenderer.invoke('util:testConnection', message),

  // ---- Event listeners (trả về unsubscribe function) ----
  onProgressUpdate: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number, message: string) => {
      callback(progress, message)
    }
    ipcRenderer.on('generate:progress', handler)
    // Return unsubscribe function
    return () => ipcRenderer.removeListener('generate:progress', handler)
  },
  onGenerationFinished: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, success: boolean, message: string, stats: any) => {
      callback(success, message, stats)
    }
    ipcRenderer.on('generate:finished', handler)
    return () => ipcRenderer.removeListener('generate:finished', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // Fallback cho khi contextIsolation = false (không khuyến khích)
  ;(window as any).api = api
}
