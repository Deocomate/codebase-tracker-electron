import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Plus, Target, X } from 'lucide-react'
import MatchedFilesPreview from '../../components/MatchedFilesPreview'
import PatternEditor from '../../components/PatternEditor'
import type { AttentionFileEntry } from '../../types'

const PREVIEW_DEBOUNCE_MS = 300
const PREVIEW_LIMIT = 50

interface GlobalTrackPanelProps {
  trackPatterns: string[]
  availablePaths: string[]
  onAddTrackPattern: (pattern: string) => void | Promise<void>
  onRemoveTrackPattern: (pattern: string) => void | Promise<void>
  disabled?: boolean
}

function parsePatterns(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export default function GlobalTrackPanel({
  trackPatterns,
  availablePaths,
  onAddTrackPattern,
  onRemoveTrackPattern,
  disabled = false
}: GlobalTrackPanelProps): ReactElement {
  const [trackInput, setTrackInput] = useState('')
  const [previewFiles, setPreviewFiles] = useState<AttentionFileEntry[]>([])
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const previewRequestRef = useRef(0)

  const inputPatterns = useMemo(() => parsePatterns(trackInput), [trackInput])

  useEffect(() => {
    if (disabled || inputPatterns.length === 0) {
      let cancelled = false
      previewRequestRef.current += 1
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
      queueMicrotask(() => {
        if (cancelled) return
        setIsLoadingPreview(false)
        setPreviewFiles([])
        setPreviewError(null)
      })
      return () => {
        cancelled = true
      }
    }

    let cancelled = false
    const requestId = ++previewRequestRef.current
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)

    previewDebounceRef.current = setTimeout(async () => {
      if (cancelled || previewRequestRef.current !== requestId) return

      setIsLoadingPreview(true)
      try {
        const merged = new Map<string, AttentionFileEntry>()
        let firstError: string | null = null

        for (const pattern of inputPatterns) {
          if (merged.size >= PREVIEW_LIMIT) break
          const { files, error } = await window.api.preview_track_pattern(
            pattern,
            PREVIEW_LIMIT - merged.size
          )
          if (cancelled || previewRequestRef.current !== requestId) return
          if (error && !firstError) firstError = error
          for (const file of files ?? []) {
            merged.set(file.absPath, file)
            if (merged.size >= PREVIEW_LIMIT) break
          }
        }

        setPreviewFiles(Array.from(merged.values()))
        setPreviewError(firstError)
      } catch (error: unknown) {
        if (!cancelled && previewRequestRef.current === requestId) {
          setPreviewError(error instanceof Error ? error.message : String(error))
          setPreviewFiles([])
        }
      } finally {
        if (!cancelled && previewRequestRef.current === requestId) {
          setIsLoadingPreview(false)
        }
      }
    }, PREVIEW_DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    }
  }, [disabled, inputPatterns])

  const handleAddPatterns = async (): Promise<void> => {
    if (disabled || inputPatterns.length === 0) return

    for (const pattern of inputPatterns) {
      await onAddTrackPattern(pattern)
    }
    setTrackInput('')
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-borderDark/20 bg-white">
      <section className="shrink-0 border-b border-borderDark/20 px-4 py-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-textMuted">
          <Target size={16} />
          Global Track Settings
        </div>
        <p className="text-[12px] text-textMuted mb-3">
          Files and folders matching these patterns are force-tracked even when they match
          .gitignore or Global Ignore rules.
        </p>

        <PatternEditor
          value={trackInput}
          onChange={setTrackInput}
          availablePaths={availablePaths}
          disabled={disabled}
          placeholder={disabled ? 'Open a project to track...' : 'e.g. .env\nvendor/keep.txt\ndocs/**/*.md'}
        />

        <button
          type="button"
          onClick={() => void handleAddPatterns()}
          disabled={disabled || inputPatterns.length === 0}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-sm border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
        >
          <Plus size={13} />
          Add Track Pattern{inputPatterns.length > 1 ? 's' : ''}
        </button>

        <div className="mt-4">
          <div className="text-[11px] font-semibold text-textMuted uppercase mb-2">
            Active Rules ({trackPatterns.length})
          </div>
          {trackPatterns.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 overflow-y-auto max-h-40 pr-1">
              {trackPatterns.map((pattern) => (
                <span
                  key={pattern}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-800"
                >
                  <span className="min-w-0 truncate">{pattern}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveTrackPattern(pattern)}
                    disabled={disabled}
                    className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-emerald-200 disabled:opacity-50"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-textMuted italic">
              No force-track patterns defined.
            </div>
          )}
        </div>
      </section>

      <MatchedFilesPreview
        files={previewFiles}
        inputCount={inputPatterns.length}
        disabled={disabled}
        isLoading={isLoadingPreview}
        error={previewError}
        emptyInputMessage="Enter track patterns to preview restored files."
        emptyMatchMessage="No ignored files would be restored by these patterns."
      />
    </aside>
  )
}
