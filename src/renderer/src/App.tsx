import { useCallback, useRef, useState, type DragEvent, type ReactElement } from 'react'
import Split from 'react-split'
import { CheckCircle, Pin } from 'lucide-react'
import AttentionSidebar from './AttentionSidebar'
import ConsoleLog from './features/generator/ConsoleLog'
import ExecutionPanel from './features/generator/ExecutionPanel'
import ProjectControl from './features/project/ProjectControl'
import ResultSummary from './features/project/ResultSummary'
import ExplorerSidebar from './features/sidebar/ExplorerSidebar'
import WorkspaceSettings from './features/settings/WorkspaceSettings'
import MiniWidget from './features/window/MiniWidget'
import { useGenerator } from './hooks/useGenerator'
import { useProject } from './hooks/useProject'
import { useSettings } from './hooks/useSettings'

function App(): ReactElement {
  const project = useProject()
  const settings = useSettings(project.projectPath)
  const generator = useGenerator(project.projectPath, settings, project.attentionPatterns)
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
          <div className="absolute top-4 right-4 z-40">
            <button
              onClick={() => handleTogglePin(true)}
              disabled={isPinning}
              className="flex items-center gap-1.5 bg-white border border-borderDark shadow-sm hover:bg-gray-50 text-textMain text-[11px] font-semibold py-1.5 px-3 rounded-sm transition disabled:opacity-50"
            >
              <Pin size={12} fill="currentColor" /> Mini Mode
            </button>
          </div>

          <Split
            sizes={[20, 40, 40]}
            minSize={[250, 400, 350]}
            gutterSize={2}
            className="split w-full h-full"
          >
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

                <WorkspaceSettings
                  projectPath={project.projectPath}
                  formats={settings.formats}
                  splitEnabled={settings.splitEnabled}
                  splitCount={settings.splitCount}
                  instructionsEnabled={settings.instructionsEnabled}
                  onUpdateSettings={settings.updateSettings}
                  onEditInstructions={generator.openInstructionsFile}
                />

                <ExecutionPanel
                  projectPath={project.projectPath}
                  isGenerating={generator.isGenerating}
                  progress={generator.progress}
                  onStart={generator.startGeneration}
                  onCancel={generator.cancelGeneration}
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

            <AttentionSidebar
              projectPath={project.projectPath}
              attentionPatterns={project.attentionPatterns}
              ignorePatterns={project.ignorePatterns}
              availablePaths={project.availablePaths}
              onPatternsChange={handleAttentionPatternsChange}
              onAddIgnorePattern={handleAddIgnorePattern}
              onRemoveIgnorePattern={handleRemoveIgnorePattern}
              disabled={
                generator.isGenerating || !project.projectPath || project.treeLoadState !== 'ready'
              }
            />
          </Split>
        </>
      )}
    </div>
  )
}

export default App
