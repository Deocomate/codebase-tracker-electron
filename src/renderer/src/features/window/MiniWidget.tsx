import type { ReactElement } from 'react'
import { Expand, Play, XCircle } from 'lucide-react'
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
  const projectName = projectPath ? projectPath.split(/[/\\]/).pop() : 'Chưa chọn dự án'

  return (
    <div className="h-screen w-full bg-white grid grid-rows-[auto_minmax(0,1fr)_auto] gap-2 p-2.5 relative select-none overflow-hidden">
      <div className="flex justify-between items-center min-h-7 pb-1.5 border-b border-borderDark/20 min-w-0">
        <h2 className="text-[13px] leading-4 font-semibold text-textMain truncate pr-2 min-w-0">
          {projectName}
        </h2>
        <button
          onClick={onUnpin}
          className="w-7 h-7 shrink-0 flex items-center justify-center text-textMuted hover:text-accent transition rounded-sm bg-gray-50 hover:bg-blue-50"
          title="Unpin & mở rộng"
        >
          <Expand size={14} />
        </button>
      </div>

      <div className="min-h-0 flex items-center">
        {isGenerating ? (
          <div className="w-full">
            <div className="flex justify-between text-xs font-medium text-textMuted mb-1.5">
              <span>Đang xử lý...</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full bg-[#e4e6e8] rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : stats ? (
          <div className="w-full min-h-14 text-xs bg-green-50 text-green-800 px-2.5 py-2 rounded border border-green-200 flex flex-col justify-center gap-0.5">
            <span className="font-semibold">Hoàn tất!</span>
            <span className="opacity-90 truncate">
              Files: {stats.total_files_included} | Chars: {stats.total_chars.toLocaleString()}
            </span>
          </div>
        ) : (
          <div className="w-full min-h-12 text-xs text-textMuted px-2.5 py-2 text-center bg-gray-50 rounded border border-dashed border-gray-200 flex items-center justify-center">
            {projectPath ? 'Sẵn sàng tạo context.' : 'Vui lòng mở dự án.'}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onScan}
          disabled={!projectPath || isGenerating}
          className="h-8 min-w-0 flex-1 flex items-center justify-center gap-1.5 bg-accent hover:bg-accentHover text-white rounded-sm text-[13px] font-medium transition disabled:opacity-50"
        >
          {isGenerating ? (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Play size={13} fill="currentColor" />
          )}
          {isGenerating ? 'Đang quét...' : 'Scan'}
        </button>
        <button
          onClick={onCancel}
          disabled={!isGenerating}
          className="w-9 h-8 shrink-0 flex items-center justify-center bg-[#e4e6e8] text-textMain hover:bg-[#d4d6d8] rounded-sm transition disabled:opacity-50"
        >
          <XCircle size={14} />
        </button>
      </div>
    </div>
  )
}
