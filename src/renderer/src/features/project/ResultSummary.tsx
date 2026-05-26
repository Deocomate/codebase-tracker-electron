import type { ReactElement } from 'react'
import { Copy, Folder, Settings, Trash2 } from 'lucide-react'
import Card from '../../components/ui/Card'
import type { Stats } from '../../types'

interface ResultSummaryProps {
  stats: Stats
  onOpenFolder: () => void | Promise<void>
  onAutoCopy: () => void | Promise<void>
  onOpenSettings: () => void | Promise<void>
  onClearOutput: () => void | Promise<void>
}

export default function ResultSummary({
  stats,
  onOpenFolder,
  onAutoCopy,
  onOpenSettings,
  onClearOutput
}: ResultSummaryProps): ReactElement {
  return (
    <Card title="Results Summary">
      <div>
        <div className="flex flex-col sm:flex-row justify-between mb-4">
          <ul className="text-[13px] text-textMain space-y-1">
            <li>
              Source files: <strong>{stats.total_files_included}</strong>
            </li>
            <li>
              Total characters: <strong>{stats.total_chars?.toLocaleString()}</strong>
            </li>
            <li>
              Generated files: <strong>{stats.generated_files?.length}</strong>
            </li>
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onOpenFolder}
            className="flex items-center gap-1.5 bg-white border border-borderDark hover:bg-gray-50 text-textMain text-[13px] py-1.5 px-3 rounded-sm transition"
          >
            <Folder size={14} /> Open Folder
          </button>
          <button
            onClick={onAutoCopy}
            className="flex items-center gap-1.5 bg-accent hover:bg-accentHover text-white text-[13px] py-1.5 px-3 rounded-sm transition"
          >
            <Copy size={14} /> Auto Copy
          </button>
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 bg-white border border-borderDark hover:bg-gray-50 text-textMain text-[13px] py-1.5 px-3 rounded-sm transition"
          >
            <Settings size={14} /> Settings JSON
          </button>
          <button
            onClick={onClearOutput}
            className="flex items-center gap-1.5 text-danger hover:bg-red-50 text-[13px] py-1.5 px-3 rounded-sm transition ml-auto"
          >
            <Trash2 size={14} /> Clear Output
          </button>
        </div>
      </div>
    </Card>
  )
}
