import type { ReactElement } from 'react'
import { Expand, Play, XCircle, FileCode2, CheckCircle2 } from 'lucide-react'
import type { Stats } from '../../types'

interface MiniWidgetProps {
  projectPath: string
  isGenerating: boolean
  progress: number
  stats: Stats | null
  onScan: () => void | Promise<void>
  onCancel: () => void | Promise<void>
  onUnpin: () => void | Promise<void>
}

export default function MiniWidget({
  projectPath,
  isGenerating,
  progress,
  stats,
  onScan,
  onCancel,
  onUnpin
}: MiniWidgetProps): ReactElement {
  const projectName = projectPath ? projectPath.split(/[/\\]/).pop() : 'No Project'

  return (
    <div className="h-screen w-full bg-[#f8f9fa] flex flex-col relative select-none overflow-hidden border border-borderDark/20">

      {/* Header - Vùng để nắm kéo thả (Drag Region) */}
      <div
        className="flex justify-between items-center px-3 py-2 bg-white border-b border-borderDark/10 shadow-sm shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 size={14} className="text-accent shrink-0" />
          <h2 className="text-[12px] font-bold text-textMain truncate leading-none mt-0.5">
            {projectName}
          </h2>
        </div>

        {/* Nút Unpin - (No-drag để có thể click) */}
        <button
          onClick={onUnpin}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="w-6 h-6 shrink-0 flex items-center justify-center text-textMuted hover:text-textMain hover:bg-gray-100 transition rounded-md"
          title="Mở rộng (Unpin)"
        >
          <Expand size={13} />
        </button>
      </div>

      {/* Body - Trạng thái */}
      <div className="flex-1 flex flex-col justify-center px-3 py-2 min-h-0">
        {isGenerating ? (
          <div className="w-full bg-white p-3 rounded-md border border-borderDark/10 shadow-sm">
            <div className="flex justify-between text-[11px] font-semibold text-textMain mb-2">
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 border-[1.5px] border-accent/30 border-t-accent rounded-full animate-spin" />
                Processing...
              </span>
              <span className="text-accent">{progress}%</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : stats ? (
          <div className="w-full bg-green-50/80 p-2.5 rounded-md border border-green-200/60 flex flex-col gap-1 shadow-sm">
            <div className="flex items-center gap-1.5 text-green-700 text-[12px] font-bold">
              <CheckCircle2 size={14} /> Hoàn tất!
            </div>
            <div className="text-[11px] text-green-700/80 truncate font-medium">
              Files: {stats.total_files_included} &bull; Chars: {stats.total_chars.toLocaleString()}
            </div>
          </div>
        ) : (
          <div className="w-full text-[11px] font-medium text-textMuted p-3 text-center bg-white rounded-md border border-dashed border-borderDark/40 flex items-center justify-center shadow-sm">
            {projectPath ? 'Sẵn sàng quét và gộp mã nguồn.' : 'Vui lòng mở dự án để bắt đầu.'}
          </div>
        )}
      </div>

      {/* Footer - Buttons (No-drag) */}
      <div
        className="flex gap-2 px-3 pb-3 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={onScan}
          disabled={!projectPath || isGenerating}
          className="flex-1 h-8 flex items-center justify-center gap-1.5 bg-accent hover:bg-accentHover text-white rounded-md text-[12px] font-bold transition-all disabled:opacity-50 shadow-sm shadow-accent/20"
        >
          {isGenerating ? null : <Play size={13} fill="currentColor" />}
          {isGenerating ? 'Đang chạy...' : 'Scan & Copy'}
        </button>

        <button
          onClick={onCancel}
          disabled={!isGenerating}
          className="w-9 h-8 shrink-0 flex items-center justify-center bg-white border border-borderDark/20 text-textMain hover:bg-gray-50 rounded-md transition-all disabled:opacity-50 shadow-sm"
          title="Hủy"
        >
          <XCircle size={15} className="text-danger" />
        </button>
      </div>

    </div>
  )
}
