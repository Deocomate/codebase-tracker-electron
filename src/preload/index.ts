import { contextBridge, ipcRenderer } from 'electron'

export interface IpcApi {
  // Dialogs
  open_directory_dialog: () => Promise<string | null>

  // Project
  load_project: (folderPath: string, wslConfig?: { enabled: boolean; basePath: string }) => Promise<LoadProjectResponse>
  toggle_tree_node: (path: string, isChecked: boolean) => Promise<TreeMutationResponse>
  update_tree_selection: (includedPaths: string[], excludedPaths: string[]) => Promise<SimpleResponse>
  update_priority: (listRoots: string[]) => Promise<SimpleResponse>
  show_tree_context_menu: (path: string, isDir: boolean) => Promise<string | null>

  // Settings
  get_settings: () => Promise<SettingsResponse>
  save_settings: (selectedFormats: string[], splitEnabled: boolean, splitCount: number, instructionsEnabled?: boolean) => Promise<SimpleResponse>

  // WSL Configuration
  get_wsl_config: () => Promise<WslConfigResponse>
  save_wsl_config: (enabled: boolean, basePath: string) => Promise<SimpleResponse>

  // Attention Context
  preview_attention: (patterns: string[]) => Promise<AttentionPreviewResponse>
  get_prompt_instruction: () => Promise<PromptInstructionResponse>
  reset_prompt_instruction: () => Promise<PromptInstructionResponse>
  save_attention_patterns: (patterns: string[]) => Promise<SaveAttentionPatternsResponse>

  // Dynamic Global Ignore
  add_ignore_pattern: (pattern: string) => Promise<IgnorePatternMutationResponse>
  remove_ignore_pattern: (pattern: string) => Promise<IgnorePatternMutationResponse>
  get_ignore_patterns: () => Promise<IgnorePatternsResponse>
  preview_ignore_pattern: (pattern: string, maxResults?: number) => Promise<IgnorePreviewResponse>

  // Generation
  start_generation: (
    selectedFormats: string[],
    splitEnabled: boolean,
    splitCount: number,
    attentionPatterns?: string[]
  ) => Promise<GenerationStartResponse>
  cancel_generation: () => Promise<SimpleResponse>

  // File operations
  open_file: (path: string) => Promise<SimpleResponse>
  open_file_explorer: (path: string) => Promise<SimpleResponse>
  open_output_folder: () => Promise<SimpleResponse>
  open_settings_file: () => Promise<SimpleResponse>
  open_instructions_file: () => Promise<SimpleResponse>
  auto_copy_files: (fileNames: string[]) => Promise<SimpleResponse>
  clear_output: () => Promise<SimpleResponse>

  // Utility
  test_connection: (message: string) => Promise<string>

  // Event listeners (Main -> Renderer)
  onProgressUpdate: (callback: (progress: number, message: string) => void) => () => void
  onGenerationFinished: (
    callback: (success: boolean, message: string, stats: GenerationStats | null) => void
  ) => () => void
}

export interface SimpleResponse {
  status?: string
  error?: string
  message?: string
}

export interface AttentionFileEntry {
  absPath: string
  relPath: string
  tokens?: number
  isRelated?: boolean
  importedBy?: string
}

export interface AttentionPreviewResponse {
  files: AttentionFileEntry[]
  error?: string
}

export interface PromptInstructionResponse {
  content: string
  error?: string
}

export interface SaveAttentionPatternsResponse {
  patterns: string[]
  error?: string
}

export interface IpcTreeNode {
  id: string
  name: string
  is_dir: boolean
  is_ignored: boolean
  selectable: boolean
  checked: 'checked' | 'unchecked' | 'partial'
  tokens: number
  children: IpcTreeNode[]
}

export interface LoadProjectResponse {
  status?: string
  error?: string
  project_path?: string
  tree?: IpcTreeNode
  attention_patterns?: string[]
}

export interface TreeMutationResponse {
  status?: string
  error?: string
  tree?: IpcTreeNode
}

export interface SettingsResponse {
  status?: string
  error?: string
  ui_preferences?: {
    selected_formats: string[]
    split_enabled: boolean
    split_count: number
  }
  priority_roots?: string[]
  instructions_config?: {
    enabled: boolean
  }
}

export interface WslConfigResponse {
  status?: string
  error?: string
  config?: {
    enabled: boolean
    basePath: string
  }
}

export interface GenerationStartResponse {
  status?: string
  error?: string
}

export interface GenerationStats {
  total_files_included: number
  total_chars: number
  generated_files: string[]
  output_dir?: string
  structure_file?: string
  ignored_items?: number
  summary?: string
}

export interface IgnorePatternsResponse {
  patterns: string[]
  error?: string
}

export interface IgnorePatternMutationResponse {
  status?: string
  patterns?: string[]
  tree?: IpcTreeNode
  error?: string
}

export interface IgnorePreviewResponse {
  files: AttentionFileEntry[]
  error?: string
}

const api: IpcApi = {
  // ---- Dialogs ----
  open_directory_dialog: () => ipcRenderer.invoke('dialog:openDirectory'),

  // ---- Project ----
  load_project: (folderPath, wslConfig) => ipcRenderer.invoke('project:load', folderPath, wslConfig),
  toggle_tree_node: (path, isChecked) => ipcRenderer.invoke('tree:toggleNode', { path, isChecked }),
  update_tree_selection: (includedPaths, excludedPaths) =>
    ipcRenderer.invoke('tree:updateSelection', { includedPaths, excludedPaths }),
  update_priority: (listRoots) => ipcRenderer.invoke('tree:updatePriority', listRoots),
  show_tree_context_menu: (path, isDir) => ipcRenderer.invoke('tree:showContextMenu', { path, isDir }),

  // ---- Settings ----
  get_settings: () => ipcRenderer.invoke('settings:get'),
  save_settings: (selectedFormats, splitEnabled, splitCount, instructionsEnabled?) =>
    ipcRenderer.invoke('settings:save', { selectedFormats, splitEnabled, splitCount, instructionsEnabled }),

  // ---- WSL Configuration ----
  get_wsl_config: () => ipcRenderer.invoke('wsl:getConfig'),
  save_wsl_config: (enabled, basePath) =>
    ipcRenderer.invoke('wsl:saveConfig', { enabled, basePath }),

  // ---- Attention Context ----
  preview_attention: (patterns) => ipcRenderer.invoke('attention:preview', patterns),
  get_prompt_instruction: () => ipcRenderer.invoke('prompt:getInstruction'),
  reset_prompt_instruction: () => ipcRenderer.invoke('prompt:resetInstruction'),
  save_attention_patterns: (patterns) => ipcRenderer.invoke('attention:savePatterns', patterns),

  // ---- Dynamic Global Ignore ----
  add_ignore_pattern: (pattern) => ipcRenderer.invoke('ignore:addCustomPattern', pattern),
  remove_ignore_pattern: (pattern) => ipcRenderer.invoke('ignore:removeCustomPattern', pattern),
  get_ignore_patterns: () => ipcRenderer.invoke('ignore:getCustomPatterns'),
  preview_ignore_pattern: (pattern, maxResults = 50) =>
    ipcRenderer.invoke('ignore:previewPattern', { pattern, maxResults }),

  // ---- Generation ----
  start_generation: (selectedFormats, splitEnabled, splitCount, attentionPatterns) =>
    ipcRenderer.invoke('generate:start', { selectedFormats, splitEnabled, splitCount, attentionPatterns }),
  cancel_generation: () => ipcRenderer.invoke('generate:cancel'),

  // ---- File operations ----
  open_file: (path) => ipcRenderer.invoke('file:openFile', path),
  open_file_explorer: (path) => ipcRenderer.invoke('file:openExplorer', path),
  open_output_folder: () => ipcRenderer.invoke('file:openOutputFolder'),
  open_settings_file: () => ipcRenderer.invoke('file:openSettingsFile'),
  open_instructions_file: () => ipcRenderer.invoke('file:openInstructionsFile'),
  auto_copy_files: (fileNames) => ipcRenderer.invoke('file:autoCopy', fileNames),
  clear_output: () => ipcRenderer.invoke('file:clearOutput'),

  // ---- Utility ----
  test_connection: (message) => ipcRenderer.invoke('util:testConnection', message),

  // ---- Event listeners (trả về unsubscribe function) ----
  onProgressUpdate: (callback): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number, message: string): void => {
      callback(progress, message)
    }
    ipcRenderer.on('generate:progress', handler)
    // Return unsubscribe function
    return (): void => {
      ipcRenderer.removeListener('generate:progress', handler)
    }
  },
  onGenerationFinished: (callback): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      success: boolean,
      message: string,
      stats: GenerationStats | null
    ): void => {
      callback(success, message, stats)
    }
    ipcRenderer.on('generate:finished', handler)
    return (): void => {
      ipcRenderer.removeListener('generate:finished', handler)
    }
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
  ;(window as unknown as Window & { api: IpcApi }).api = api
}
