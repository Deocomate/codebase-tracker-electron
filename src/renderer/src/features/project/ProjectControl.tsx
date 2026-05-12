import type { ReactElement } from 'react'
import Card from '../../components/ui/Card'

interface ProjectControlProps {
  projectPathInput: string
  isGenerating: boolean
  onProjectPathInputChange: (value: string) => void
  onLoadProject: (path: string) => void | Promise<void>
  onBrowse: () => void | Promise<void>
}

export default function ProjectControl({
  projectPathInput,
  isGenerating,
  onProjectPathInputChange,
  onLoadProject,
  onBrowse
}: ProjectControlProps): ReactElement {
  return (
    <Card title="Project Path">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={projectPathInput}
            onChange={(event) => onProjectPathInputChange(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && onLoadProject(projectPathInput)}
            placeholder="Dán đường dẫn thư mục vào đây (rồi nhấn Enter) hoặc bấm Browse..."
            className="flex-1 bg-white border border-borderDark rounded-sm px-3 py-1.5 text-[13px] focus:outline-none focus:border-accent transition"
          />
          <button
            onClick={onBrowse}
            disabled={isGenerating}
            className="bg-[#e4e6e8] hover:bg-[#d4d6d8] text-textMain px-4 py-1.5 rounded-sm text-[13px] transition disabled:opacity-50"
          >
            Browse...
          </button>
        </div>
      </div>
    </Card>
  )
}
