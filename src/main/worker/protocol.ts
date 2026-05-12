/**
 * NDJSON Protocol Types for Worker ↔ Main Process communication.
 * Shared between WorkerManager (Main) and Worker Process.
 */

// ==================== Action Types ====================

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
  | 'GET_WSL_CONFIG'
  | 'SAVE_WSL_CONFIG'
  | 'GET_IGNORE_PATTERNS'
  | 'ADD_IGNORE_PATTERN'
  | 'REMOVE_IGNORE_PATTERN'
  | 'PREVIEW_IGNORE_PATTERN'
  | 'GENERATE'
  | 'CANCEL_GENERATE'
  | 'CLEAR_OUTPUT'
  | 'SHUTDOWN'

// ==================== Request/Response ====================

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

// ==================== Tree Node (shared with renderer) ====================

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
