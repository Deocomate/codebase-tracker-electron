import { useEffect, useState, type MouseEvent, type ReactElement } from 'react'
import { Copy, FileText, Folder, Link2, Loader2 } from 'lucide-react'
import type { AttentionFileEntry } from '../types'
import { formatTokenCount } from '../utils/formatTokenCount'

const PREVIEW_LIMIT = 100

function splitRelPath(relPath: string): { fileName: string; dirPath: string } {
  const normalized = relPath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  const fileName = parts.pop() || normalized
  const dirPath = parts.length > 0 ? parts.join('/') : '.'
  return { fileName, dirPath }
}

interface MatchedFilesPreviewProps {
  files: AttentionFileEntry[]
  inputCount: number
  disabled?: boolean
  isLoading?: boolean
  error?: string | null
  disabledMessage?: string
  emptyInputMessage?: string
  emptyMatchMessage?: string
  onCopyAll?: () => void
  isCopyingAll?: boolean
}

export default function MatchedFilesPreview({
  files,
  inputCount,
  disabled = false,
  isLoading = false,
  error = null,
  disabledMessage = 'Open a project to preview.',
  emptyInputMessage = 'Enter patterns to see matching files.',
  emptyMatchMessage = 'No files match these patterns.',
  onCopyAll,
  isCopyingAll = false
}: MatchedFilesPreviewProps): ReactElement {
  const [openError, setOpenError] = useState<string | null>(null)
  const [isOpenModifierDown, setIsOpenModifierDown] = useState(false)
  const totalTokens = files.reduce((sum, f) => sum + (f.tokens ?? 0), 0)
  const relatedCount = files.filter((file) => file.isRelated).length
  const matchedCount = files.length - relatedCount
  const displayError = error || openError

  useEffect(() => {
    const updateModifierState = (event: KeyboardEvent): void => {
      setIsOpenModifierDown(event.ctrlKey || event.metaKey)
    }
    const resetModifierState = (): void => setIsOpenModifierDown(false)

    window.addEventListener('keydown', updateModifierState)
    window.addEventListener('keyup', updateModifierState)
    window.addEventListener('blur', resetModifierState)
    return () => {
      window.removeEventListener('keydown', updateModifierState)
      window.removeEventListener('keyup', updateModifierState)
      window.removeEventListener('blur', resetModifierState)
    }
  }, [])

  const handlePreviewFileClick = async (
    e: MouseEvent<HTMLDivElement>,
    file: AttentionFileEntry
  ): Promise<void> => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const result = await window.api.open_file(file.absPath)
    setOpenError(result.error || null)
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-gray-50/60">
      <div className="shrink-0 border-b border-borderDark/20 bg-gray-100/60 px-4 py-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-textMuted">
          Matched Files
        </span>
        <div className="flex items-center gap-2">
          {/* Copy All button */}
          {onCopyAll && files.length > 0 && (
            <button
              onClick={onCopyAll}
              disabled={disabled || isCopyingAll}
              className="flex items-center gap-1.5 rounded-sm bg-white border border-borderDark px-2 py-0.5 text-[10px] font-semibold text-textMain hover:bg-gray-50 transition disabled:opacity-50"
            >
              <Copy size={12} className={isCopyingAll ? 'text-accent' : ''} />
              {isCopyingAll ? 'Copied!' : 'Copy All'}
            </button>
          )}

          {/* Existing badge */}
          {inputCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              Matched: {matchedCount}
              {relatedCount > 0 ? ` (+${relatedCount} Related)` : ''} | Tokens:{' '}
              {formatTokenCount(totalTokens)}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {disabled ? (
          <div className="px-4 py-4 text-[12px] text-textMuted">{disabledMessage}</div>
        ) : inputCount === 0 ? (
          <div className="px-4 py-4 text-[12px] text-textMuted">{emptyInputMessage}</div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-textMuted">
            <Loader2 size={14} className="animate-spin text-accent" />
            Loading preview...
          </div>
        ) : displayError ? (
          <div className="px-4 py-3 text-[12px] text-danger">{displayError}</div>
        ) : files.length === 0 ? (
          <div className="px-4 py-3 text-[12px] text-textMuted">{emptyMatchMessage}</div>
        ) : (
          <>
            {files.map((file) => {
              const { fileName, dirPath } = splitRelPath(file.relPath)
              const isRelated = Boolean(file.isRelated)
              const Icon = isRelated ? Link2 : file.isDir ? Folder : FileText
              return (
                <div
                  key={file.absPath}
                  onClick={(e) => handlePreviewFileClick(e, file)}
                  className={[
                    'border-b border-gray-100 py-1.5 transition-colors hover:bg-blue-50/70',
                    isRelated ? 'pl-7 pr-3' : 'px-3',
                    isOpenModifierDown ? 'cursor-pointer' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={isOpenModifierDown ? `Open ${file.relPath}` : file.relPath}
                >
                  <div className="flex items-center justify-between min-w-0">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold text-gray-800">
                      <Icon
                        size={14}
                        className={`shrink-0 ${isRelated ? 'text-slate-400' : 'text-blue-500'}`}
                      />
                      <span
                        className={`truncate ${isOpenModifierDown ? 'underline decoration-dotted underline-offset-2' : ''}`}
                      >
                        {fileName}
                      </span>
                      {isRelated && (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                          Related
                        </span>
                      )}
                    </div>
                    <span className="ml-2 shrink-0 rounded-full bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                      {formatTokenCount(file.tokens || 0)}
                    </span>
                  </div>
                  <div className="truncate pl-5 text-[11px] text-gray-500">{dirPath}</div>
                  {isRelated && file.importedBy && (
                    <div className="truncate pl-5 text-[10px] text-slate-400">
                      Imported by: {file.importedBy}
                    </div>
                  )}
                </div>
              )
            })}
            {files.length >= PREVIEW_LIMIT && (
              <div className="px-4 py-2 text-[11px] text-textMuted">
                Showing first {PREVIEW_LIMIT} matches.
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
