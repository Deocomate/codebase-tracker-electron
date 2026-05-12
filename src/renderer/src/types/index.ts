export interface TreeData {
  id: string
  name: string
  is_dir: boolean
  is_ignored: boolean
  selectable: boolean
  checked: 'checked' | 'unchecked' | 'partial'
  tokens: number
  children: TreeData[]
}

export interface Stats {
  total_files_included: number
  total_chars: number
  generated_files: string[]
  output_dir?: string
  structure_file?: string
  ignored_items?: number
  summary?: string
}

export interface OutputFormats {
  txt: boolean
  json: boolean
  md: boolean
  xml: boolean
}

export interface LoadProjectResponse {
  status?: string
  error?: string
  project_path?: string
  tree?: TreeData
  attention_patterns?: string[]
}

export interface GenerationResponse {
  status?: string
  error?: string
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

export interface SettingsResponse {
  status?: string
  error?: string
  ui_preferences?: {
    selected_formats: string[]
    split_enabled: boolean
    split_count: number
  }
  priority_roots?: string[]
}

export interface ToggleNodeResponse {
  status?: string
  error?: string
  tree?: TreeData
}

export interface TreeViewProps {
  data: TreeData | null
  onToggle?: (path: string, isChecked: boolean) => void
  onReorder?: (newTreeData: TreeData) => void
}
