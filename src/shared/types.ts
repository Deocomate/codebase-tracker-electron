export type WorkerAction =
  | 'INIT'
  | 'BUILD_TREE'
  | 'TOGGLE_NODE'
  | 'UPDATE_SELECTION'
  | 'UPDATE_PRIORITY'
  | 'ATTENTION_PREVIEW'
  | 'READ_PROMPT_FILE'
  | 'RESET_PROMPT_FILE'
  | 'SAVE_ATTENTION_PATTERNS'
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS'
  | 'GET_IGNORE_PATTERNS'
  | 'ADD_IGNORE_PATTERN'
  | 'REMOVE_IGNORE_PATTERN'
  | 'PREVIEW_IGNORE_PATTERN'
  | 'GENERATE'
  | 'CANCEL_GENERATE'
  | 'CLEAR_OUTPUT'
  | 'SHUTDOWN'

export interface WorkerRequest {
  id: string
  action: WorkerAction
  payload?: Record<string, unknown>
}

export interface WorkerResponse {
  id: string
  status: 'success' | 'error' | 'progress'
  data?: unknown
  error?: string
  progress?: number
  message?: string
}

export interface TreeNode {
  id: string
  name: string
  is_dir: boolean
  is_ignored: boolean
  selectable: boolean
  checked: 'checked' | 'unchecked' | 'partial'
  tokens: number
  children: TreeNode[]
}

export interface AttentionFileEntry {
  absPath: string
  relPath: string
  tokens?: number
  isRelated?: boolean
  importedBy?: string
}

export interface SimpleResponse {
  status?: string
  error?: string
  message?: string
}

export interface LoadProjectResponse {
  status?: string
  error?: string
  project_path?: string
  tree?: TreeNode
  attention_patterns?: string[]
}

export interface TreeMutationResponse {
  status?: string
  error?: string
  tree?: TreeNode
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
  tree?: TreeNode
  error?: string
}

export interface IgnorePreviewResponse {
  files: AttentionFileEntry[]
  error?: string
}

export interface WindowPinResponse {
  status?: string
  error?: string
  isPinned?: boolean
}
