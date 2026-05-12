import type { ReactElement } from 'react'
import { Play, XCircle } from 'lucide-react'
import Card from '../../components/ui/Card'

interface ExecutionPanelProps {
  projectPath: string
  isGenerating: boolean
  progress: number
  onStart: () => void | Promise<void>
  onCancel: () => void | Promise<void>
}

export default function ExecutionPanel({
  projectPath,
  isGenerating,
  progress,
  onStart,
  onCancel
}: ExecutionPanelProps): ReactElement {
  return (
    <Card title="Execution">
      <div className="flex gap-3 mb-4">
        <button
          onClick={onStart}
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
          onClick={onCancel}
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
  )
}
