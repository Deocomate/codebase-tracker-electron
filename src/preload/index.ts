import { contextBridge, ipcRenderer } from 'electron'
import type {
  AttentionPreviewResponse,
  GenerationStartResponse,
  GenerationStats,
  IgnorePatternMutationResponse,
  IgnorePatternsResponse,
  IgnorePreviewResponse,
  LoadProjectResponse,
  PlanPreviewResponse,
  PlanTextResponse,
  PromptInstructionResponse,
  SaveAttentionPatternsResponse,
  SettingsResponse,
  SimpleResponse,
  SuggestionPathsResponse,
  TrackPatternMutationResponse,
  TrackPatternsResponse,
  TrackPreviewResponse,
  TreeMutationResponse,
  WindowPinResponse
} from '../shared/types'

export interface IpcApi {
  // Dialogs
  open_directory_dialog: () => Promise<string | null>

  // Project
  load_project: (folderPath: string) => Promise<LoadProjectResponse>
  toggle_tree_node: (path: string, isChecked: boolean) => Promise<TreeMutationResponse>
  update_tree_selection: (
    includedPaths: string[],
    excludedPaths: string[]
  ) => Promise<SimpleResponse>
  update_priority: (listRoots: string[]) => Promise<SimpleResponse>
  show_tree_context_menu: (path: string, isDir: boolean) => Promise<string | null>

  // Settings
  get_settings: () => Promise<SettingsResponse>
  save_settings: (
    selectedFormats: string[],
    splitEnabled: boolean,
    splitCount: number,
    instructionsEnabled?: boolean
  ) => Promise<SimpleResponse>

  // Attention Context
  preview_attention: (patterns: string[]) => Promise<AttentionPreviewResponse>
  preview_plan: (text: string) => Promise<PlanPreviewResponse>
  get_plan_text: () => Promise<PlanTextResponse>
  save_plan_text: (text: string) => Promise<PlanTextResponse>
  get_prompt_instruction: () => Promise<PromptInstructionResponse>
  reset_prompt_instruction: () => Promise<PromptInstructionResponse>
  save_attention_patterns: (patterns: string[]) => Promise<SaveAttentionPatternsResponse>

  // Dynamic Global Ignore
  add_ignore_pattern: (pattern: string) => Promise<IgnorePatternMutationResponse>
  remove_ignore_pattern: (pattern: string) => Promise<IgnorePatternMutationResponse>
  get_ignore_patterns: () => Promise<IgnorePatternsResponse>
  preview_ignore_pattern: (pattern: string, maxResults?: number) => Promise<IgnorePreviewResponse>
  add_track_pattern: (pattern: string) => Promise<TrackPatternMutationResponse>
  remove_track_pattern: (pattern: string) => Promise<TrackPatternMutationResponse>
  get_track_patterns: () => Promise<TrackPatternsResponse>
  preview_track_pattern: (pattern: string, maxResults?: number) => Promise<TrackPreviewResponse>
  get_suggestion_paths: () => Promise<SuggestionPathsResponse>

  // Generation
  start_generation: (
    selectedFormats: string[],
    splitEnabled: boolean,
    splitCount: number,
    attentionPatterns?: string[],
    planText?: string
  ) => Promise<GenerationStartResponse>
  cancel_generation: () => Promise<SimpleResponse>

  // File operations
  open_file: (path: string) => Promise<SimpleResponse>
  open_file_explorer: (path: string) => Promise<SimpleResponse>
  open_output_folder: () => Promise<SimpleResponse>
  open_settings_file: () => Promise<SimpleResponse>
  open_instructions_file: () => Promise<SimpleResponse>
  auto_copy_files: (fileNames: string[]) => Promise<SimpleResponse>
  copy_combined_files: (files: { absPath: string; relPath: string }[]) => Promise<SimpleResponse>
  clear_output: () => Promise<SimpleResponse>

  // Utility
  test_connection: (message: string) => Promise<string>

  // Window
  toggle_pin: (isPinned: boolean) => Promise<WindowPinResponse>

  // Event listeners (Main -> Renderer)
  onProgressUpdate: (callback: (progress: number, message: string) => void) => () => void
  onGenerationFinished: (
    callback: (success: boolean, message: string, stats: GenerationStats | null) => void
  ) => () => void
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
  show_tree_context_menu: (path, isDir) =>
    ipcRenderer.invoke('tree:showContextMenu', { path, isDir }),

  // ---- Settings ----
  get_settings: () => ipcRenderer.invoke('settings:get'),
  save_settings: (selectedFormats, splitEnabled, splitCount, instructionsEnabled?) =>
    ipcRenderer.invoke('settings:save', {
      selectedFormats,
      splitEnabled,
      splitCount,
      instructionsEnabled
    }),

  // ---- Attention Context ----
  preview_attention: (patterns) => ipcRenderer.invoke('attention:preview', patterns),
  preview_plan: (text) => ipcRenderer.invoke('plan:preview', text),
  get_plan_text: () => ipcRenderer.invoke('plan:getText'),
  save_plan_text: (text) => ipcRenderer.invoke('plan:saveText', text),
  get_prompt_instruction: () => ipcRenderer.invoke('prompt:getInstruction'),
  reset_prompt_instruction: () => ipcRenderer.invoke('prompt:resetInstruction'),
  save_attention_patterns: (patterns) => ipcRenderer.invoke('attention:savePatterns', patterns),

  // ---- Dynamic Global Ignore ----
  add_ignore_pattern: (pattern) => ipcRenderer.invoke('ignore:addCustomPattern', pattern),
  remove_ignore_pattern: (pattern) => ipcRenderer.invoke('ignore:removeCustomPattern', pattern),
  get_ignore_patterns: () => ipcRenderer.invoke('ignore:getCustomPatterns'),
  preview_ignore_pattern: (pattern, maxResults = 50) =>
    ipcRenderer.invoke('ignore:previewPattern', { pattern, maxResults }),
  add_track_pattern: (pattern) => ipcRenderer.invoke('track:addPattern', pattern),
  remove_track_pattern: (pattern) => ipcRenderer.invoke('track:removePattern', pattern),
  get_track_patterns: () => ipcRenderer.invoke('track:getPatterns'),
  preview_track_pattern: (pattern, maxResults = 50) =>
    ipcRenderer.invoke('track:previewPattern', { pattern, maxResults }),
  get_suggestion_paths: () => ipcRenderer.invoke('suggestions:getPaths'),

  // ---- Generation ----
  start_generation: (selectedFormats, splitEnabled, splitCount, attentionPatterns, planText) =>
    ipcRenderer.invoke('generate:start', {
      selectedFormats,
      splitEnabled,
      splitCount,
      attentionPatterns,
      planText
    }),
  cancel_generation: () => ipcRenderer.invoke('generate:cancel'),

  // ---- File operations ----
  open_file: (path) => ipcRenderer.invoke('file:openFile', path),
  open_file_explorer: (path) => ipcRenderer.invoke('file:openExplorer', path),
  open_output_folder: () => ipcRenderer.invoke('file:openOutputFolder'),
  open_settings_file: () => ipcRenderer.invoke('file:openSettingsFile'),
  open_instructions_file: () => ipcRenderer.invoke('file:openInstructionsFile'),
  auto_copy_files: (fileNames) => ipcRenderer.invoke('file:autoCopy', fileNames),
  copy_combined_files: (files) => ipcRenderer.invoke('clipboard:copyCombinedFiles', files),
  clear_output: () => ipcRenderer.invoke('file:clearOutput'),

  // ---- Utility ----
  test_connection: (message) => ipcRenderer.invoke('util:testConnection', message),

  // ---- Window ----
  toggle_pin: (isPinned) => ipcRenderer.invoke('window:togglePin', isPinned),

  // ---- Event listeners (trả về unsubscribe function) ----
  onProgressUpdate: (callback): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: number,
      message: string
    ): void => {
      callback(progress, message)
    }
    ipcRenderer.on('generate:progress', handler)
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
