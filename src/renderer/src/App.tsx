import { useCallback, useRef, useState, type DragEvent, type ReactElement } from 'react'
import Split from 'react-split'
import { CheckCircle, Play, XCircle } from 'lucide-react'
import AttentionSidebar from './AttentionSidebar'
import ActivityBar, { type ActivityView } from './components/layout/ActivityBar'
import ContextTreemap from './components/ui/ContextTreemap'
import ConsoleLog from './features/generator/ConsoleLog'
import GlobalIgnorePanel from './features/ignore/GlobalIgnorePanel'

import PlanReviewPanel from './features/plan/PlanReviewPanel'
import ProjectControl from './features/project/ProjectControl'
import ResultSummary from './features/project/ResultSummary'
import ExplorerSidebar from './features/sidebar/ExplorerSidebar'
import WorkspaceSettings from './features/settings/WorkspaceSettings'
import GlobalTrackPanel from './features/track/GlobalTrackPanel'
import MiniWidget from './features/window/MiniWidget'
import { useGenerator } from './hooks/useGenerator'
import { usePlanReview } from './hooks/usePlanReview'
import { useProject } from './hooks/useProject'
import { useSettings } from './hooks/useSettings'

// Stable references — defined outside component to prevent react-split reset on re-render
const SPLIT_SIZES = [25, 50, 25]
const SPLIT_MIN_SIZES = [260, 420, 260]
const SPLIT_MAX_SIZES = [450, Infinity, 450]

function App(): ReactElement {
  const project = useProject()
  const settings = useSettings(project.projectPath)
  const planReviewDisabled = !project.projectPath || project.treeLoadState !== 'ready'
  const planReview = usePlanReview(project.projectPath, planReviewDisabled)
  const generator = useGenerator(
    project.projectPath,
    settings,
    project.attentionPatterns,
    planReview.planText
  )
  const [activeView, setActiveView] = useState<ActivityView>('attention')
  const [isPinned, setIsPinned] = useState(false)
  const [isPinning, setIsPinning] = useState(false)
  const isPinningRef = useRef(false)

  const handleTogglePin = useCallback(
    async (nextState: boolean): Promise<void> => {
      if (isPinningRef.current) return

      isPinningRef.current = true
      setIsPinning(true)
      try {
        const res = await window.api.toggle_pin(nextState)
        if (res.status === 'success' && typeof res.isPinned === 'boolean') {
          setIsPinned(res.isPinned)
        } else {
          generator.appendLog(
            `[Lỗi] Không thể chuyển chế độ Pin: ${res.error || 'Không rõ nguyên nhân'}`
          )
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        generator.appendLog(`[Lỗi] Không thể chuyển chế độ Pin: ${message}`)
      } finally {
        isPinningRef.current = false
        setIsPinning(false)
      }
    },
    [generator]
  )

  const loadProjectAndSettings = useCallback(
    async (path: string, options?: { preserveTab?: boolean }): Promise<void> => {
      const normalized = path.replace(/\\_codebase$/, '').replace(/\/_codebase$/, '')
      generator.appendLog(`Đang load dự án: ${normalized}...`)

      const res = await project.loadProjectFromPath(path, options)
      if (res.status === 'success' && res.tree) {
        await settings.fetchSettings()
        generator.appendLog(`Load thành công dự án: ${res.tree.name}`)
      } else {
        generator.appendLog(`Lỗi: ${res.error || 'Không thể load project'}`)
      }
    },
    [generator, project, settings]
  )

  const handleBrowse = useCallback(async (): Promise<void> => {
    const path = await window.api.open_directory_dialog()
    if (path) {
      await loadProjectAndSettings(path)
    }
  }, [loadProjectAndSettings])

  const handleReload = useCallback(async (): Promise<void> => {
    if (!project.projectPath || generator.isGenerating) return
    const res = await project.reloadProject()
    if (res?.status === 'success' && res.tree) {
      await settings.fetchSettings()
      generator.appendLog(`Load thành công dự án: ${res.tree.name}`)
    } else if (res?.error) {
      generator.appendLog(`Lỗi: ${res.error}`)
    }
  }, [generator, project, settings])

  const handleAddIgnorePattern = useCallback(
    async (pattern: string): Promise<void> => {
      if (generator.isGenerating) return
      const error = await project.addIgnorePattern(pattern)
      if (error) generator.appendLog(`Lỗi: ${error}`)
    },
    [generator, project]
  )

  const handleRemoveIgnorePattern = useCallback(
    async (pattern: string): Promise<void> => {
      if (generator.isGenerating) return
      const error = await project.removeIgnorePattern(pattern)
      if (error) generator.appendLog(`Lỗi: ${error}`)
    },
    [generator, project]
  )

  const handleAddTrackPattern = useCallback(
    async (pattern: string): Promise<void> => {
      if (generator.isGenerating) return
      const error = await project.addTrackPattern(pattern)
      if (error) generator.appendLog(`Lá»—i: ${error}`)
    },
    [generator, project]
  )

  const handleRemoveTrackPattern = useCallback(
    async (pattern: string): Promise<void> => {
      if (generator.isGenerating) return
      const error = await project.removeTrackPattern(pattern)
      if (error) generator.appendLog(`Lá»—i: ${error}`)
    },
    [generator, project]
  )

  const handleAttentionPatternsChange = useCallback(
    async (patterns: string[]): Promise<void> => {
      if (generator.isGenerating) return
      await project.updateAttentionPatterns(patterns)
    },
    [generator.isGenerating, project]
  )

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>): Promise<void> => {
      event.preventDefault()
      event.stopPropagation()

      const files = event.dataTransfer.files
      let droppedPath = ''

      if (files && files.length > 0) {
        droppedPath = (files[0] as File & { path: string }).path
      } else {
        droppedPath = event.dataTransfer.getData('text/plain').trim()
      }

      if (droppedPath) {
        const cleanPath = droppedPath.replace(/^file:\/\//, '')
        await loadProjectAndSettings(cleanPath)
      }
    },
    [loadProjectAndSettings]
  )

  const preventDragDefault = useCallback((event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return (
    <div
      className="h-screen w-full relative"
      onDragOver={preventDragDefault}
      onDragEnter={preventDragDefault}
      onDragLeave={preventDragDefault}
      onDrop={handleDrop}
    >
      {generator.toast && (
        <div className="absolute bottom-5 right-5 z-50 flex max-w-[360px] items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-emerald-800 shadow-lg shadow-slate-900/10">
          <CheckCircle size={16} />
          <span className="text-[13px] font-medium leading-snug">{generator.toast}</span>
        </div>
      )}

      {isPinned ? (
        <MiniWidget
          projectPath={project.projectPath}
          isGenerating={generator.isGenerating}
          progress={generator.progress}
          stats={generator.stats}
          onScan={generator.startGeneration}
          onCancel={generator.cancelGeneration}
          onUnpin={() => handleTogglePin(false)}
        />
      ) : (
        <>
          <div className="flex h-full w-full">
            <ActivityBar
              activeView={activeView}
              onChangeView={setActiveView}
              onTogglePin={() => handleTogglePin(true)}
              isPinning={isPinning}
            />

            <Split
              sizes={SPLIT_SIZES}
              minSize={SPLIT_MIN_SIZES}
              maxSize={SPLIT_MAX_SIZES}
              gutterSize={1}
              className="split min-w-0 flex-1"
            >
              {/* Left pane: both panels always mounted, toggled via CSS */}
              <div className="h-full w-full relative">
                <div
                  className={`absolute inset-0 ${activeView === 'attention' ? 'block' : 'hidden'}`}
                >
                  <AttentionSidebar
                    projectPath={project.projectPath}
                    attentionPatterns={project.attentionPatterns}
                    availablePaths={project.availablePaths}
                    onPatternsChange={handleAttentionPatternsChange}
                    disabled={
                      generator.isGenerating ||
                      !project.projectPath ||
                      project.treeLoadState !== 'ready'
                    }
                  />
                </div>
                <div className={`absolute inset-0 ${activeView === 'plan' ? 'block' : 'hidden'}`}>
                  <PlanReviewPanel
                    planText={planReview.planText}
                    planPatterns={planReview.planPatterns}
                    previewFiles={planReview.previewFiles}
                    isLoadingPreview={planReview.isLoadingPreview}
                    previewError={planReview.previewError}
                    onPlanTextChange={planReview.setPlanText}
                    disabled={
                      generator.isGenerating ||
                      !project.projectPath ||
                      project.treeLoadState !== 'ready'
                    }
                  />
                </div>
                <div className={`absolute inset-0 ${activeView === 'ignore' ? 'block' : 'hidden'}`}>
                  <GlobalIgnorePanel
                    ignorePatterns={project.ignorePatterns}
                    availablePaths={project.availablePaths}
                    onAddIgnorePattern={handleAddIgnorePattern}
                    onRemoveIgnorePattern={handleRemoveIgnorePattern}
                    disabled={
                      generator.isGenerating ||
                      !project.projectPath ||
                      project.treeLoadState !== 'ready'
                    }
                  />
                </div>
                <div className={`absolute inset-0 ${activeView === 'track' ? 'block' : 'hidden'}`}>
                  <GlobalTrackPanel
                    trackPatterns={project.trackPatterns}
                    availablePaths={project.availablePaths}
                    onAddTrackPattern={handleAddTrackPattern}
                    onRemoveTrackPattern={handleRemoveTrackPattern}
                    disabled={
                      generator.isGenerating ||
                      !project.projectPath ||
                      project.treeLoadState !== 'ready'
                    }
                  />
                </div>
              </div>

              {/* Center pane */}
              <main className="flex h-full min-w-0 flex-col bg-bgPanel">
                <header className="z-10 flex shrink-0 items-center justify-between gap-4 border-b border-borderDark/20 bg-white px-6 py-4 shadow-sm">
                  <div className="min-w-0">
                    <h1 className="text-lg font-semibold leading-none text-textMain">Workspace</h1>
                    <p className="mt-1 truncate text-[12px] text-textMuted">
                      {project.projectPath || 'No project opened'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    {generator.isGenerating && (
                      <div className="flex w-40 items-center gap-3">
                        <span className="w-8 text-xs font-mono text-accent">
                          {generator.progress}%
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full bg-accent transition-all duration-300"
                            style={{ width: `${generator.progress}%` }}
                          />
                        </div>
                        <button
                          onClick={() => void generator.cancelGeneration()}
                          className="p-1 text-danger transition hover:text-red-700"
                          title="Cancel generation"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => void generator.startGeneration()}
                      disabled={!project.projectPath || generator.isGenerating}
                      className="flex items-center gap-2 whitespace-nowrap rounded-md bg-accent px-5 py-2 text-[13px] font-semibold text-white shadow-md shadow-accent/20 transition hover:bg-accentHover disabled:opacity-50"
                    >
                      {generator.isGenerating ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <Play size={14} fill="currentColor" />
                      )}
                      {generator.isGenerating ? 'PROCESSING...' : 'SCAN & GENERATE'}
                    </button>
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth">
                  <div className="mx-auto max-w-5xl space-y-6">
                    <ProjectControl
                      projectPathInput={project.projectPathInput}
                      isGenerating={generator.isGenerating}
                      onProjectPathInputChange={project.setProjectPathInput}
                      onLoadProject={loadProjectAndSettings}
                      onBrowse={handleBrowse}
                    />

                    <ContextTreemap
                      treeData={project.filteredTreeData}
                      projectPath={project.projectPath}
                      onToggleNode={project.toggleNode}
                    />

                    <WorkspaceSettings
                      projectPath={project.projectPath}
                      formats={settings.formats}
                      splitEnabled={settings.splitEnabled}
                      splitCount={settings.splitCount}
                      instructionsEnabled={settings.instructionsEnabled}
                      onUpdateSettings={settings.updateSettings}
                      onEditInstructions={generator.openInstructionsFile}
                    />

                    {generator.stats && (
                      <ResultSummary
                        stats={generator.stats}
                        onOpenFolder={generator.openOutputFolder}
                        onAutoCopy={generator.autoCopy}
                        onOpenSettings={generator.openSettingsFile}
                        onClearOutput={generator.clearOutput}
                      />
                    )}

                    <ConsoleLog logs={generator.logs} />
                  </div>
                </div>
              </main>

              {/* Right pane */}
              <div className="h-full w-full min-w-0">
                <ExplorerSidebar
                  activeTab={project.activeTab}
                  projectPath={project.projectPath}
                  isGenerating={generator.isGenerating}
                  isReloading={project.isReloading}
                  treeData={project.filteredTreeData}
                  emptyMessage={project.treeEmptyMessage}
                  onActiveTabChange={project.setActiveTab}
                  onReload={handleReload}
                  onToggleNode={project.toggleNode}
                  onReorderTree={project.reorderTree}
                  onAddIgnorePattern={handleAddIgnorePattern}
                />
              </div>
            </Split>
          </div>
        </>
      )}
    </div>
  )
}

export default App
