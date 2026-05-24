import { useCallback, useRef, useState, type DragEvent, type ReactElement } from 'react'
import Split from 'react-split'
import { CheckCircle } from 'lucide-react'
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
  const generator = useGenerator(project.projectPath, settings, project.attentionPatterns, planReview.planText)
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
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-green-100 text-green-800 px-4 py-2 rounded shadow-md border border-green-200 flex items-center gap-2">
          <CheckCircle size={16} />
          <span className="text-sm font-medium">{generator.toast}</span>
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
              gutterSize={8}
              className="split min-w-0 flex-1"
            >
              {/* Left pane: both panels always mounted, toggled via CSS */}
              <div className="h-full w-full relative">
                <div className={`absolute inset-0 ${activeView === 'attention' ? 'block' : 'hidden'}`}>
                  <AttentionSidebar
                    projectPath={project.projectPath}
                    attentionPatterns={project.attentionPatterns}
                    availablePaths={project.availablePaths}
                    onPatternsChange={handleAttentionPatternsChange}
                    disabled={
                      generator.isGenerating || !project.projectPath || project.treeLoadState !== 'ready'
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
                      generator.isGenerating || !project.projectPath || project.treeLoadState !== 'ready'
                    }
                  />
                </div>
                <div className={`absolute inset-0 ${activeView === 'ignore' ? 'block' : 'hidden'}`}>
                  <GlobalIgnorePanel
                    ignorePatterns={project.ignorePatterns}
                    onAddIgnorePattern={handleAddIgnorePattern}
                    onRemoveIgnorePattern={handleRemoveIgnorePattern}
                    disabled={
                      generator.isGenerating || !project.projectPath || project.treeLoadState !== 'ready'
                    }
                  />
                </div>
              </div>

              {/* Center pane */}
              <main className="h-full bg-white overflow-y-auto px-8 py-8">
                <div className="max-w-5xl mx-auto">
                  <h1 className="text-2xl font-light text-textMain mb-8">Workspace Settings</h1>

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
                    isGenerating={generator.isGenerating}
                    progress={generator.progress}
                    onStart={generator.startGeneration}
                    onCancel={generator.cancelGeneration}
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
              </main>

              {/* Right pane */}
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
            </Split>
          </div>
        </>
      )}
    </div>
  )
}

export default App
