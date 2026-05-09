import { useState, useEffect, useRef, useCallback, useMemo, type ReactElement, type ReactNode } from 'react'
import Split from 'react-split'
import {
  FolderSearch,
  Play,
  XCircle,
  CheckCircle,
  Copy,
  Folder,
  Settings,
  Trash2,
  RefreshCw
} from 'lucide-react'
import TreeView from './TreeView'
import SearchSidebar from './SearchSidebar'
import type { TreeData, Stats, OutputFormats, LoadProjectResponse } from './types'

// Lấy WSL config mặc định từ localStorage để giữ cấu hình trên toàn App
const defaultWsl = JSON.parse(localStorage.getItem('globalWslConfig') || '{"enabled":false,"basePath":"\\\\\\\\wsl.localhost\\\\Ubuntu-24.04"}');

type SidebarTab = 'selected' | 'ignored'

function filterTreeByTab(node: TreeData | null, tab: SidebarTab): TreeData | null {
  if (!node) return null

  if (tab === 'selected' && node.is_ignored) {
    return null
  }

  const filteredChildren = node.children
    .map((child) => filterTreeByTab(child, tab))
    .filter((child): child is TreeData => child !== null)

  if (tab === 'ignored' && node.is_ignored) {
    return {
      ...node,
      children: filteredChildren
    }
  }

  const matchesTab = tab === 'selected'
    ? node.checked !== 'unchecked'
    : node.checked !== 'checked'

  if (!matchesTab && filteredChildren.length === 0) return null

  return {
    ...node,
    tokens: node.is_dir
      ? filteredChildren.reduce((sum, child) => sum + child.tokens, 0)
      : node.tokens,
    children: filteredChildren
  }
}

function mergeTreeOrder(fullNode: TreeData, reorderedNode: TreeData): TreeData {
  if (!fullNode.children.length) return { ...fullNode, children: [] }

  const fullChildMap = new Map(fullNode.children.map((child) => [child.id, child]))
  const visibleChildIds = new Set(reorderedNode.children.map((child) => child.id))
  const reorderedVisibleChildren = reorderedNode.children.map((child) => {
    const fullChild = fullChildMap.get(child.id)
    return fullChild ? mergeTreeOrder(fullChild, child) : child
  })

  let visibleIndex = 0
  const mergedChildren = fullNode.children.map((child) => {
    if (!visibleChildIds.has(child.id)) return child
    const nextVisibleChild = reorderedVisibleChildren[visibleIndex]
    visibleIndex += 1
    return nextVisibleChild ?? child
  })

  return {
    ...fullNode,
    children: mergedChildren
  }
}

function collectTreeIds(node: TreeData): string[] {
  const ids = [node.id]
  for (const child of node.children) {
    ids.push(...collectTreeIds(child))
  }
  return ids
}

interface CardProps {
  title: string
  children: ReactNode
  className?: string
}

function Card({ title, children, className = '' }: CardProps): ReactElement {
  return (
    <div className={`mb-8 ${className}`}>
      <h3 className="text-sm font-semibold text-textMain mb-3 pb-1 border-b border-borderDark">
        {title}
      </h3>
      <div className="px-1">{children}</div>
    </div>
  )
}

function App(): ReactElement {
  const [projectPath, setProjectPath] = useState('')
  const [projectPathInput, setProjectPathInput] = useState('')
  const [treeData, setTreeData] = useState<TreeData | null>(null)
  const [activeTab, setActiveTab] = useState<SidebarTab>('selected')
  const [treeLoadState, setTreeLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [treeLoadError, setTreeLoadError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>(['Hệ thống sẵn sàng...'])
  const [toast, setToast] = useState<string | null>(null)
  const [formats, setFormats] = useState<OutputFormats>({
    txt: true,
    json: false,
    md: false,
    xml: false
  })
  const [splitEnabled, setSplitEnabled] = useState(true)
  const [splitCount, setSplitCount] = useState(5)
  const [searchKeywords, setSearchKeywords] = useState<string[]>([])
  const [ignorePatterns, setIgnorePatterns] = useState<string[]>([])
  const [searchKeywordStats, setSearchKeywordStats] = useState<Record<string, number>>({})
  const [stats, setStats] = useState<Stats | null>(null)
  const [wslConfig, setWslConfig] = useState(defaultWsl)
  const logEndRef = useRef<HTMLDivElement>(null)
  const searchStatsRequestRef = useRef(0)

  const updateSearchStats = useCallback(async (keywords: string[]): Promise<void> => {
    const normalizedKeywords = keywords.map((keyword) => keyword.trim()).filter(Boolean)
    if (normalizedKeywords.length === 0) {
      searchStatsRequestRef.current += 1
      setSearchKeywordStats({})
      return
    }

    const requestId = ++searchStatsRequestRef.current
    const response = await window.api.get_search_stats(normalizedKeywords)
    if (searchStatsRequestRef.current !== requestId) return

    setSearchKeywordStats(response.stats ?? {})
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])



  // Setup IPC listeners và Drag & Drop
  useEffect(() => {
    // Đăng ký IPC listeners (trả về unsubscribe functions)
    const unsubProgress = window.api.onProgressUpdate((prog, msg) => {
      if (prog >= 0) setProgress(Math.round(prog * 100))
      if (msg) setLogs((prev) => [...prev, msg])
    })

    const unsubFinished = window.api.onGenerationFinished(async (success, msg, statsData) => {
      setIsGenerating(false)
      if (success) {
        setProgress(100)
        setLogs((prev) => [...prev, `[Hoàn tất] ${msg}`])
        if (statsData) {
          setStats(statsData)
          const res = await window.api.auto_copy_files(statsData.generated_files)
          if (!('error' in res)) {
            setToast('Đã tạo thành công và Tự động Copy vào bộ nhớ tạm!')
            setTimeout(() => setToast(null), 4000)
          }
        }
      } else {
        setLogs((prev) => [...prev, `[Lỗi] ${msg}`])
      }
    })

    return () => {
      unsubProgress()
      unsubFinished()
    }
  }, [])

  async function loadProjectFromPath(rawPath: string, options?: { preserveTab?: boolean }): Promise<void> {
    // Strip trailing _codebase if accidentally dropped
    const normalized = rawPath.replace(/\\_codebase$/, '').replace(/\/_codebase$/, '')

    setProjectPath(normalized)
    setTreeData(null)
    setTreeLoadState('loading')
    setTreeLoadError(null)
    searchStatsRequestRef.current += 1
    setSearchKeywords([])
    setIgnorePatterns([])
    setSearchKeywordStats({})
    if (!options?.preserveTab) {
      setActiveTab('selected')
    }
    setStats(null)
    setLogs((prev) => [...prev, `Đang load dự án: ${normalized}...`])

    const res: LoadProjectResponse = await window.api.load_project(normalized, wslConfig)
    if (res.status === 'success' && res.tree) {
      setProjectPath(res.project_path || normalized)
      setProjectPathInput(res.project_path || normalized)
      const tree = res.tree
      setTreeData(tree)
      setTreeLoadState('ready')

      // ---> THÊM ĐOẠN NÀY ĐỂ ĐỒNG BỘ SPLITTING SETTINGS <---
      const settingsRes = await window.api.get_settings()
      if (settingsRes.status === 'success' && settingsRes.ui_preferences) {
        const { selected_formats, split_enabled, split_count } = settingsRes.ui_preferences
        const newFormats = { txt: false, json: false, md: false, xml: false }
        selected_formats.forEach(f => { if (f in newFormats) newFormats[f as keyof OutputFormats] = true })
        setFormats(newFormats)
        setSplitEnabled(split_enabled)
        setSplitCount(split_count)
      }
      // ---------------------------------------------------
      setLogs((prev) => [...prev, `Load thành công dự án: ${tree.name}`])

      const [keywordRes, ignoreRes] = await Promise.all([
        window.api.get_search_keywords(),
        window.api.get_ignore_patterns()
      ])
      const loadedKeywords = Array.isArray(keywordRes.keywords) ? keywordRes.keywords : []
      const loadedIgnorePatterns = Array.isArray(ignoreRes.patterns) ? ignoreRes.patterns : []
      setSearchKeywords(loadedKeywords)
      setIgnorePatterns(loadedIgnorePatterns)
      void updateSearchStats(loadedKeywords)
    } else {
      setTreeLoadState('error')
      setTreeLoadError(res.error || 'Không thể load project')
      setSearchKeywords([])
      setIgnorePatterns([])
      setSearchKeywordStats({})
      setLogs((prev) => [...prev, `Lỗi: ${res.error || 'Không thể load project'}`])
    }
  }

  const handleBrowse = useCallback(async (): Promise<void> => {
    const path = await window.api.open_directory_dialog()
    if (path) {
      await loadProjectFromPath(path)
    }
  }, [])

  const handleReload = useCallback(async () => {
    if (!projectPath || isGenerating) return
    setIsReloading(true)
    await loadProjectFromPath(projectPath, { preserveTab: true })
    setIsReloading(false)
  }, [projectPath, isGenerating])

  const handleStart = useCallback(async (): Promise<void> => {
    if (!projectPath) return
    setIsGenerating(true)
    setProgress(0)
    setStats(null)
    const selectedFormats = Object.keys(formats).filter((k) => formats[k as keyof OutputFormats])
    await window.api.start_generation(selectedFormats, splitEnabled, splitCount, searchKeywords)
  }, [projectPath, formats, splitEnabled, splitCount, searchKeywords])

  const handleToggleNode = useCallback(async (path: string, isChecked: boolean): Promise<void> => {
    const res = await window.api.toggle_tree_node(path, isChecked)
    if (res.status === 'success' && res.tree) {
      setTreeData(res.tree)
    }
  }, [])

  const handleAddKeyword = useCallback(async (keyword: string): Promise<void> => {
    if (!projectPath || isGenerating) return

    const res = await window.api.add_search_keyword(keyword)
    if (res.error) {
      setLogs((prev) => [...prev, `Lỗi: ${res.error}`])
      return
    }

    if (Array.isArray(res.keywords)) {
      setSearchKeywords(res.keywords)
      void updateSearchStats(res.keywords)
    }
  }, [projectPath, isGenerating, updateSearchStats])

  const handleRemoveKeyword = useCallback(async (keyword: string): Promise<void> => {
    if (!projectPath || isGenerating) return

    const res = await window.api.remove_search_keyword(keyword)
    if (res.error) {
      setLogs((prev) => [...prev, `Lỗi: ${res.error}`])
      return
    }

    if (Array.isArray(res.keywords)) {
      setSearchKeywords(res.keywords)
      void updateSearchStats(res.keywords)
    }
  }, [projectPath, isGenerating, updateSearchStats])

  const handleAddIgnorePattern = useCallback(async (pattern: string): Promise<void> => {
    if (!projectPath || isGenerating) return

    const res = await window.api.add_ignore_pattern(pattern)
    if (res.error) {
      setLogs((prev) => [...prev, `Lỗi: ${res.error}`])
      return
    }

    if (Array.isArray(res.patterns)) setIgnorePatterns(res.patterns)
    if (res.tree) setTreeData(res.tree)
  }, [projectPath, isGenerating])

  const handleRemoveIgnorePattern = useCallback(async (pattern: string): Promise<void> => {
    if (!projectPath || isGenerating) return

    const res = await window.api.remove_ignore_pattern(pattern)
    if (res.error) {
      setLogs((prev) => [...prev, `Lỗi: ${res.error}`])
      return
    }

    if (Array.isArray(res.patterns)) setIgnorePatterns(res.patterns)
    if (res.tree) setTreeData(res.tree)
  }, [projectPath, isGenerating])

  const handleOpenFolder = useCallback(async () => {
    await window.api.open_output_folder()
  }, [])

  const handleAutoCopy = useCallback(async () => {
    if (!stats?.generated_files) return
    await window.api.auto_copy_files(stats.generated_files)
  }, [stats])

  const handleOpenSettings = useCallback(async () => {
    await window.api.open_settings_file()
  }, [])

  const handleClearOutput = useCallback(async () => {
    setStats(null)
    await window.api.clear_output()
  }, [])

  const handleCancel = useCallback(async () => {
    await window.api.cancel_generation()
  }, [])

  const handleUpdateSettings = async (
    newFormats: OutputFormats,
    newSplitEnabled: boolean,
    newSplitCount: number
  ) => {
    setFormats(newFormats)
    setSplitEnabled(newSplitEnabled)
    setSplitCount(newSplitCount)
    
    if (projectPath) {
      const selectedFormats = Object.keys(newFormats).filter((k) => newFormats[k as keyof OutputFormats])
      await window.api.save_settings(selectedFormats, newSplitEnabled, newSplitCount)
    }
  }

  const handleWslConfigChange = async (enabled: boolean, basePath: string) => {
    const newConfig = { enabled, basePath }
    setWslConfig(newConfig)
    localStorage.setItem('globalWslConfig', JSON.stringify(newConfig))
    
    if (projectPath) {
       await window.api.save_wsl_config(enabled, basePath)
    }
  }

  const handleTreeReorder = useCallback(async (newTreeData: TreeData) => {
    if (!treeData) return

    const mergedTree = mergeTreeOrder(treeData, newTreeData)
    setTreeData(mergedTree)
    await window.api.update_priority(collectTreeIds(newTreeData))
  }, [treeData])

  const filteredTreeData = useMemo(
    () => filterTreeByTab(treeData, activeTab),
    [treeData, activeTab]
  )

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

  return (
    <div 
      className="h-screen w-full relative"
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDrop={async (e) => {
        e.preventDefault()
        e.stopPropagation()

        const files = e.dataTransfer.files
        let droppedPath = ''

        // Logic 1: Get path if dropped from File Explorer
        if (files && files.length > 0) {
          droppedPath = (files[0] as File & { path: string }).path
        } 
        // Logic 2: Fallback to get path as text string if dropped from other apps
        else {
          droppedPath = e.dataTransfer.getData('text/plain').trim()
        }

        if (droppedPath) {
          // Handle removing file protocol (file:///) if other apps pass as URL
          const cleanPath = droppedPath.replace(/^file:\/\//, '')
          await loadProjectFromPath(cleanPath)
        }
      }}
    >
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-green-100 text-green-800 px-4 py-2 rounded shadow-md border border-green-200 flex items-center gap-2">
          <CheckCircle size={16} />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      <Split sizes={[25, 50, 25]} minSize={[250, 400, 250]} gutterSize={2} className="split w-full h-full">
        <SearchSidebar
          keywords={searchKeywords}
          keywordStats={searchKeywordStats}
          ignorePatterns={ignorePatterns}
          onAddKeyword={handleAddKeyword}
          onRemoveKeyword={handleRemoveKeyword}
          onAddIgnorePattern={handleAddIgnorePattern}
          onRemoveIgnorePattern={handleRemoveIgnorePattern}
          disabled={isGenerating || !projectPath || treeLoadState !== 'ready'}
        />

        <main className="h-full bg-white overflow-y-auto px-8 py-8">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-light text-textMain mb-8">Workspace Settings</h1>

            <Card title="Project Path">
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={projectPathInput}
                    onChange={(e) => setProjectPathInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadProjectFromPath(projectPathInput)}
                    placeholder="Dán đường dẫn thư mục vào đây (rồi nhấn Enter) hoặc bấm Browse..."
                    className="flex-1 bg-white border border-borderDark rounded-sm px-3 py-1.5 text-[13px] focus:outline-none focus:border-accent transition"
                  />
                  <button
                    onClick={handleBrowse}
                    disabled={isGenerating}
                    className="bg-[#e4e6e8] hover:bg-[#d4d6d8] text-textMain px-4 py-1.5 rounded-sm text-[13px] transition disabled:opacity-50"
                  >
                    Browse...
                  </button>
                </div>
              </div>
            </Card>

            <Card title="WSL Configuration">
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 cursor-pointer w-max">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 border-borderDark text-accent focus:ring-accent"
                    checked={wslConfig.enabled}
                    onChange={(e) => handleWslConfigChange(e.target.checked, wslConfig.basePath)}
                  />
                  <span className="text-[13px] text-textMain font-medium">Enable WSL Path Resolver</span>
                </label>
                
                {wslConfig.enabled && (
                  <div className="flex items-center gap-2 pl-5">
                    <span className="text-[13px] text-textMuted w-24">Base Path:</span>
                    <input
                      type="text"
                      value={wslConfig.basePath}
                      onChange={(e) => handleWslConfigChange(wslConfig.enabled, e.target.value)}
                      placeholder="\\\\wsl.localhost\\Ubuntu-24.04"
                      className="flex-1 bg-white border border-borderDark rounded-sm px-3 py-1 text-[13px] focus:outline-none focus:border-accent transition"
                    />
                  </div>
                )}
              </div>
            </Card>

            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-8">
              <Card title="Export Formats">
                <div className="flex flex-wrap gap-4 mt-1">
                  {['txt', 'json', 'md', 'xml'].map((fmt) => (
                    <label key={fmt} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 border-borderDark text-accent focus:ring-accent"
                        checked={formats[fmt as keyof typeof formats]}
                        onChange={(e) => handleUpdateSettings({ ...formats, [fmt]: e.target.checked }, splitEnabled, splitCount)}
                      />
                      <span className="uppercase text-[13px] text-textMain">{fmt}</span>
                    </label>
                  ))}
                </div>
              </Card>

              <Card title="Output Splitting (Token limit)">
                <div className="flex items-center gap-6 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 border-borderDark text-accent focus:ring-accent"
                      checked={splitEnabled}
                      onChange={(e) => handleUpdateSettings(formats, e.target.checked, splitCount)}
                    />
                    <span className="text-[13px] text-textMain">Enable split</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-textMuted">Parts:</span>
                    <input
                      type="number"
                      min={2}
                      max={20}
                      value={splitCount}
                      onChange={(e) => handleUpdateSettings(formats, splitEnabled, Number(e.target.value))}
                      disabled={!splitEnabled}
                      className="w-16 bg-white border border-borderDark rounded-sm px-2 py-1 text-[13px] focus:border-accent disabled:bg-gray-50 disabled:opacity-50"
                    />
                  </div>
                </div>
              </Card>
            </div>

            <Card title="Execution">
              <div className="flex gap-3 mb-4">
                <button
                  onClick={handleStart}
                  disabled={!projectPath || isGenerating}
                  className="w-48 flex items-center justify-center gap-2 bg-accent hover:bg-accentHover text-white py-2 px-4 rounded-sm text-[13px] transition disabled:opacity-50"
                >
                  {isGenerating ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Play size={14} fill="currentColor" />
                  )}
                  {isGenerating ? 'Processing...' : 'Scan & Generate'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={!isGenerating}
                  className="flex items-center justify-center gap-2 bg-[#e4e6e8] text-textMain hover:bg-[#d4d6d8] py-2 px-4 rounded-sm text-[13px] transition disabled:opacity-50"
                >
                  <XCircle size={14} /> Cancel
                </button>
              </div>

              <div className="h-1.5 w-full bg-[#e4e6e8] relative overflow-scroll">
                <div
                  className="h-full bg-accent transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </Card>

            {stats && (
              <Card title="Results Summary">
                <div className="bg-[#f8f9fa] border border-borderDark p-4">
                  <div className="flex flex-col sm:flex-row justify-between mb-4">
                    <ul className="text-[13px] text-textMain space-y-1">
                      <li>Source files: <strong>{stats.total_files_included}</strong></li>
                      <li>Total characters: <strong>{stats.total_chars?.toLocaleString()}</strong></li>
                      <li>Generated files: <strong>{stats.generated_files?.length}</strong></li>
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleOpenFolder}
                      className="flex items-center gap-1.5 bg-white border border-borderDark hover:bg-gray-50 text-textMain text-[13px] py-1.5 px-3 rounded-sm transition"
                    >
                      <Folder size={14} /> Open Folder
                    </button>
                    <button
                      onClick={handleAutoCopy}
                      className="flex items-center gap-1.5 bg-accent hover:bg-accentHover text-white text-[13px] py-1.5 px-3 rounded-sm transition"
                    >
                      <Copy size={14} /> Auto Copy
                    </button>
                    <button
                      onClick={handleOpenSettings}
                      className="flex items-center gap-1.5 bg-white border border-borderDark hover:bg-gray-50 text-textMain text-[13px] py-1.5 px-3 rounded-sm transition"
                    >
                      <Settings size={14} /> Settings JSON
                    </button>
                    <button
                      onClick={handleClearOutput}
                      className="flex items-center gap-1.5 text-danger hover:bg-red-50 text-[13px] py-1.5 px-3 rounded-sm transition ml-auto"
                    >
                      <Trash2 size={14} /> Clear Output
                    </button>
                  </div>
                </div>
              </Card>
            )}

            <Card title="Output Console">
              <div className="bg-[#1e1e1e] p-3 h-40 overflow-y-auto font-mono text-[12px] text-[#cccccc]">
                {logs.map((l, i) => (
                  <div key={i} className="mb-0.5 leading-relaxed">
                    <span className="text-[#858585] mr-2">
                      [{new Date().toLocaleTimeString()}]
                    </span>
                    <span
                      className={
                        l.includes('Lỗi')
                          ? 'text-[#f48771]'
                          : l.includes('Hoàn tất')
                            ? 'text-[#89d185]'
                            : ''
                      }
                    >
                      {l}
                    </span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </Card>
          </div>
        </main>

        <aside className="h-full bg-bgPanel flex flex-col overflow-hidden border-l border-borderDark/20">
          <div className="flex border-b border-borderDark/20 bg-white shrink-0">
            <button
              className={`flex-1 py-2.5 text-[13px] font-semibold flex justify-center items-center gap-1.5 transition-colors ${
                activeTab === 'selected'
                  ? 'border-b-2 border-accent text-accent'
                  : 'text-textMuted hover:bg-gray-50 hover:text-textMain'
              }`}
              onClick={() => setActiveTab('selected')}
            >
              <CheckCircle size={14} /> Selected
            </button>
            <button
              className={`flex-1 py-2.5 text-[13px] font-semibold flex justify-center items-center gap-1.5 transition-colors ${
                activeTab === 'ignored'
                  ? 'border-b-2 border-danger text-danger'
                  : 'text-textMuted hover:bg-gray-50 hover:text-textMain'
              }`}
              onClick={() => setActiveTab('ignored')}
            >
              <XCircle size={14} /> Ignored
            </button>
          </div>

          <div className="px-4 py-3 shrink-0 flex items-center justify-between border-b border-borderDark/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-textMuted uppercase tracking-wider">
              <FolderSearch size={14} /> Explorer
            </div>

            {projectPath && (
              <button
                onClick={handleReload}
                disabled={isGenerating || isReloading}
                className="text-textMuted hover:text-accent transition-colors disabled:opacity-50"
                title="Tải lại danh sách file (Reload)"
              >
                <RefreshCw
                  size={14}
                  className={isReloading ? 'animate-spin' : ''}
                />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            <TreeView
              data={filteredTreeData}
              onToggle={handleToggleNode}
              onReorder={handleTreeReorder}
              onAddIgnore={handleAddIgnorePattern}
              emptyMessage={treeEmptyMessage}
            />
          </div>
        </aside>
      </Split>


    </div>
  )
}

export default App
