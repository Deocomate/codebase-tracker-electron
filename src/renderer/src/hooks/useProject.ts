import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { LoadProjectResponse, TreeData } from '../types'
import {
  collectTreeIds,
  filterTreeByTab,
  getFlatPathsFromTree,
  mergeTreeOrder,
  type SidebarTab
} from '../utils/treeUtils'

type TreeLoadState = 'idle' | 'loading' | 'ready' | 'error'

interface LoadProjectOptions {
  preserveTab?: boolean
}

export interface UseProjectReturn {
  projectPath: string
  projectPathInput: string
  setProjectPathInput: Dispatch<SetStateAction<string>>
  treeData: TreeData | null
  filteredTreeData: TreeData | null
  activeTab: SidebarTab
  setActiveTab: Dispatch<SetStateAction<SidebarTab>>
  treeLoadState: TreeLoadState
  treeLoadError: string | null
  treeEmptyMessage: string
  isReloading: boolean
  attentionPatterns: string[]
  ignorePatterns: string[]
  trackPatterns: string[]
  availablePaths: string[]
  loadProjectFromPath: (rawPath: string, options?: LoadProjectOptions) => Promise<LoadProjectResponse>
  reloadProject: () => Promise<LoadProjectResponse | null>
  toggleNode: (path: string, isChecked: boolean) => Promise<void>
  updateAttentionPatterns: (patterns: string[]) => Promise<void>
  addIgnorePattern: (pattern: string) => Promise<string | null>
  removeIgnorePattern: (pattern: string) => Promise<string | null>
  addTrackPattern: (pattern: string) => Promise<string | null>
  removeTrackPattern: (pattern: string) => Promise<string | null>
  reorderTree: (newTreeData: TreeData) => Promise<void>
}

export function useProject(): UseProjectReturn {
  const [projectPath, setProjectPath] = useState('')
  const [projectPathInput, setProjectPathInput] = useState('')
  const [treeData, setTreeData] = useState<TreeData | null>(null)
  const [activeTab, setActiveTab] = useState<SidebarTab>('selected')
  const [treeLoadState, setTreeLoadState] = useState<TreeLoadState>('idle')
  const [treeLoadError, setTreeLoadError] = useState<string | null>(null)
  const [isReloading, setIsReloading] = useState(false)
  const [attentionPatterns, setAttentionPatterns] = useState<string[]>([])
  const [ignorePatterns, setIgnorePatterns] = useState<string[]>([])
  const [trackPatterns, setTrackPatterns] = useState<string[]>([])
  const [suggestionPaths, setSuggestionPaths] = useState<string[]>([])

  const loadProjectFromPath = useCallback(
    async (rawPath: string, options?: LoadProjectOptions): Promise<LoadProjectResponse> => {
      const normalized = rawPath.replace(/\\_codebase$/, '').replace(/\/_codebase$/, '')

      setProjectPath(normalized)
      setTreeData(null)
      setTreeLoadState('loading')
      setTreeLoadError(null)
      setAttentionPatterns([])
      setIgnorePatterns([])
      setTrackPatterns([])
      setSuggestionPaths([])
      if (!options?.preserveTab) {
        setActiveTab('selected')
      }

      const res = await window.api.load_project(normalized)
      if (res.status === 'success' && res.tree) {
        const loadedPath = res.project_path || normalized
        const loadedPatterns = Array.isArray(res.attention_patterns) ? res.attention_patterns : []
        const loadedTrackPatterns = Array.isArray(res.global_track_patterns)
          ? res.global_track_patterns
          : []
        const loadedSuggestionPaths = Array.isArray(res.suggestion_paths) ? res.suggestion_paths : []
        setProjectPath(loadedPath)
        setProjectPathInput(loadedPath)
        setTreeData(res.tree)
        setAttentionPatterns(loadedPatterns)
        setTrackPatterns(loadedTrackPatterns)
        setSuggestionPaths(loadedSuggestionPaths)
        setTreeLoadState('ready')

        const ignoreRes = await window.api.get_ignore_patterns()
        setIgnorePatterns(Array.isArray(ignoreRes.patterns) ? ignoreRes.patterns : [])
        const trackRes = await window.api.get_track_patterns()
        setTrackPatterns(Array.isArray(trackRes.patterns) ? trackRes.patterns : loadedTrackPatterns)
      } else {
        setTreeLoadState('error')
        setTreeLoadError(res.error || 'Không thể load project')
        setAttentionPatterns([])
        setIgnorePatterns([])
        setTrackPatterns([])
        setSuggestionPaths([])
      }

      return res
    },
    []
  )

  const reloadProject = useCallback(async (): Promise<LoadProjectResponse | null> => {
    if (!projectPath) return null
    setIsReloading(true)
    try {
      return await loadProjectFromPath(projectPath, { preserveTab: true })
    } finally {
      setIsReloading(false)
    }
  }, [loadProjectFromPath, projectPath])

  const toggleNode = useCallback(async (path: string, isChecked: boolean): Promise<void> => {
    const res = await window.api.toggle_tree_node(path, isChecked)
    if (res.status === 'success' && res.tree) {
      setTreeData(res.tree)
    }
  }, [])

  const updateAttentionPatterns = useCallback(
    async (patterns: string[]): Promise<void> => {
      if (!projectPath) return

      setAttentionPatterns(patterns)
      const res = await window.api.save_attention_patterns(patterns)
      if (res && res.patterns) {
        setAttentionPatterns(res.patterns)
      }
    },
    [projectPath]
  )

  const addIgnorePattern = useCallback(
    async (pattern: string): Promise<string | null> => {
      if (!projectPath) return null

      const res = await window.api.add_ignore_pattern(pattern)
      if (res.error) return res.error

      if (Array.isArray(res.patterns)) setIgnorePatterns(res.patterns)
      if (res.tree) setTreeData(res.tree)
      return null
    },
    [projectPath]
  )

  const removeIgnorePattern = useCallback(
    async (pattern: string): Promise<string | null> => {
      if (!projectPath) return null

      const res = await window.api.remove_ignore_pattern(pattern)
      if (res.error) return res.error

      if (Array.isArray(res.patterns)) setIgnorePatterns(res.patterns)
      if (res.tree) setTreeData(res.tree)
      return null
    },
    [projectPath]
  )

  const addTrackPattern = useCallback(
    async (pattern: string): Promise<string | null> => {
      if (!projectPath) return null

      const res = await window.api.add_track_pattern(pattern)
      if (res.error) return res.error

      if (Array.isArray(res.patterns)) setTrackPatterns(res.patterns)
      if (res.tree) setTreeData(res.tree)
      return null
    },
    [projectPath]
  )

  const removeTrackPattern = useCallback(
    async (pattern: string): Promise<string | null> => {
      if (!projectPath) return null

      const res = await window.api.remove_track_pattern(pattern)
      if (res.error) return res.error

      if (Array.isArray(res.patterns)) setTrackPatterns(res.patterns)
      if (res.tree) setTreeData(res.tree)
      return null
    },
    [projectPath]
  )

  const reorderTree = useCallback(
    async (newTreeData: TreeData): Promise<void> => {
      if (!treeData) return

      const mergedTree = mergeTreeOrder(treeData, newTreeData)
      setTreeData(mergedTree)
      await window.api.update_priority(collectTreeIds(newTreeData))
    },
    [treeData]
  )

  const filteredTreeData = useMemo(
    () => filterTreeByTab(treeData, activeTab),
    [activeTab, treeData]
  )

  const availablePaths = useMemo(() => {
    if (suggestionPaths.length > 0) return suggestionPaths
    return getFlatPathsFromTree(treeData)
  }, [suggestionPaths, treeData])

  const treeEmptyMessage = !projectPath
    ? 'No folder opened.'
    : treeLoadState === 'loading'
      ? 'Loading tree...'
      : treeLoadState === 'error'
        ? (treeLoadError ?? 'Failed to load project.')
        : !treeData
          ? 'No tree data available.'
          : activeTab === 'selected'
            ? 'No checked items in this tab.'
            : 'No unchecked items in this tab.'

  return {
    projectPath,
    projectPathInput,
    setProjectPathInput,
    treeData,
    filteredTreeData,
    activeTab,
    setActiveTab,
    treeLoadState,
    treeLoadError,
    treeEmptyMessage,
    isReloading,
    attentionPatterns,
    ignorePatterns,
    trackPatterns,
    availablePaths,
    loadProjectFromPath,
    reloadProject,
    toggleNode,
    updateAttentionPatterns,
    addIgnorePattern,
    removeIgnorePattern,
    addTrackPattern,
    removeTrackPattern,
    reorderTree
  }
}
