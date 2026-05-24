import { useState, type ReactElement } from 'react'
import { ClipboardList, FileSearch } from 'lucide-react'
import MatchedFilesPreview from '../../components/MatchedFilesPreview'
import type { AttentionFileEntry } from '../../types'

interface PlanReviewPanelProps {
  planText: string
  planPatterns: string[]
  previewFiles: AttentionFileEntry[]
  isLoadingPreview: boolean
  previewError: string | null
  disabled?: boolean
  onPlanTextChange: (text: string) => void
}

export default function PlanReviewPanel({
  planText,
  planPatterns,
  previewFiles,
  isLoadingPreview,
  previewError,
  disabled = false,
  onPlanTextChange
}: PlanReviewPanelProps): ReactElement {
  const [isCopying, setIsCopying] = useState(false)

  const handleCopyFiles = async (): Promise<void> => {
    if (previewFiles.length === 0) return
    setIsCopying(true)
    try {
      const payload = previewFiles.map((f) => ({ absPath: f.absPath, relPath: f.relPath }))
      await window.api.copy_combined_files(payload)
    } catch (err) {
      console.error('Copy failed', err)
    } finally {
      setTimeout(() => setIsCopying(false), 1000)
    }
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-borderDark/20 bg-white">
      <section className="shrink-0 border-b border-borderDark/20 px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
          <ClipboardList size={14} />
          Plan Review
        </div>
        <textarea
          value={planText}
          onChange={(event) => onPlanTextChange(event.target.value)}
          disabled={disabled}
          spellCheck={false}
          placeholder={
            disabled
              ? 'Open a project to start...'
              : 'Paste implementation plan, markdown notes, or file references...'
          }
          className="h-72 w-full resize-none rounded-sm border border-borderDark bg-white px-2 py-1.5 font-mono text-[13px] leading-relaxed text-textMain transition focus:border-accent focus:outline-none disabled:opacity-50"
        />
      </section>

      <section className="shrink-0 border-b border-borderDark/20 px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
            <FileSearch size={14} />
            Extracted Paths
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {planPatterns.length}
          </span>
        </div>
        {planPatterns.length > 0 && (
          <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {planPatterns.slice(0, 20).map((pattern) => (
              <span
                key={pattern}
                className="inline-flex max-w-full rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-medium text-blue-800"
                title={pattern}
              >
                <span className="min-w-0 truncate">{pattern}</span>
              </span>
            ))}
            {planPatterns.length > 20 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                +{planPatterns.length - 20}
              </span>
            )}
          </div>
        )}
      </section>

      <MatchedFilesPreview
        files={previewFiles}
        inputCount={planText.trim() ? Math.max(planPatterns.length, 1) : 0}
        disabled={disabled}
        isLoading={isLoadingPreview}
        error={previewError}
        emptyInputMessage="Paste a plan to extract file references."
        emptyMatchMessage="No files match the extracted paths."
        onCopyAll={handleCopyFiles}
        isCopyingAll={isCopying}
      />
    </aside>
  )
}
