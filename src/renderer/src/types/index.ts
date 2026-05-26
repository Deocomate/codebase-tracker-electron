import type { TreeNode } from '../../../shared/types'

export type {
  AttentionFileEntry,
  AttentionPreviewResponse,
  GenerationStartResponse as GenerationResponse,
  GenerationStats as Stats,
  IgnorePatternMutationResponse,
  IgnorePatternsResponse,
  IgnorePreviewResponse,
  LoadProjectResponse,
  PlanPreviewResponse,
  PlanTextResponse,
  SettingsResponse,
  SimpleResponse,
  SuggestionPathsResponse,
  TrackPatternMutationResponse,
  TrackPatternsResponse,
  TrackPreviewResponse,
  TreeMutationResponse as ToggleNodeResponse
} from '../../../shared/types'

export type TreeData = TreeNode

export interface OutputFormats {
  txt: boolean
  json: boolean
  md: boolean
  xml: boolean
}

export interface TreeViewProps {
  data: TreeData | null
  onToggle?: (path: string, isChecked: boolean) => void
  onReorder?: (newTreeData: TreeData) => void
}
