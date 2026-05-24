import type { ReactElement } from 'react'
import { CheckCircle, FolderSearch, RefreshCw, XCircle } from 'lucide-react'
import TreeView from '../../TreeView'
import type { TreeData } from '../../types'
import type { SidebarTab } from '../../utils/treeUtils'

interface ExplorerSidebarProps {
  activeTab: SidebarTab
  projectPath: string
  isGenerating: boolean
  isReloading: boolean
  treeData: TreeData | null
  emptyMessage: string
  onActiveTabChange: (tab: SidebarTab) => void
  onReload: () => void | Promise<void>
  onToggleNode: (path: string, isChecked: boolean) => void | Promise<void>
  onReorderTree: (newTreeData: TreeData) => void | Promise<void>
  onAddIgnorePattern: (pattern: string) => void | Promise<void>
}

export default function ExplorerSidebar({
  activeTab,
  projectPath,
  isGenerating,
  isReloading,
  treeData,
  emptyMessage,
  onActiveTabChange,
  onReload,
  onToggleNode,
  onReorderTree,
  onAddIgnorePattern
}: ExplorerSidebarProps): ReactElement {
  return (
    <aside className="relative h-full w-full bg-bgPanel flex flex-col overflow-hidden border-l border-borderDark/20">
      <div className="flex border-b border-borderDark/20 bg-white shrink-0">
        <button
          className={`flex-1 py-2.5 text-[13px] font-semibold flex justify-center items-center gap-1.5 transition-colors ${
            activeTab === 'selected'
              ? 'border-b-2 border-accent text-accent'
              : 'text-textMuted hover:bg-gray-50 hover:text-textMain'
          }`}
          onClick={() => onActiveTabChange('selected')}
        >
          <CheckCircle size={14} /> Selected
        </button>
        <button
          className={`flex-1 py-2.5 text-[13px] font-semibold flex justify-center items-center gap-1.5 transition-colors ${
            activeTab === 'ignored'
              ? 'border-b-2 border-danger text-danger'
              : 'text-textMuted hover:bg-gray-50 hover:text-textMain'
          }`}
          onClick={() => onActiveTabChange('ignored')}
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
            onClick={onReload}
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
          data={treeData}
          onToggle={onToggleNode}
          onReorder={onReorderTree}
          onAddIgnore={onAddIgnorePattern}
          emptyMessage={emptyMessage}
        />
      </div>
    </aside>
  )
}
