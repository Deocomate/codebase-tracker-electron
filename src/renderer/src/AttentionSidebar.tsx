import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement
} from 'react'
import { Copy, EyeOff, FileText, Loader2, RefreshCw, X, Focus } from 'lucide-react'
import { formatTokenCount } from './TreeView'

const PREVIEW_LIMIT = 100
const ATTENTION_DEBOUNCE_MS = 300

interface PreviewFile {
  absPath: string
  relPath: string
  tokens?: number
}

function splitRelPath(relPath: string): { fileName: string; dirPath: string } {
  const normalized = relPath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  const fileName = parts.pop() || normalized
  const dirPath = parts.length > 0 ? parts.join('/') : '.'
  return { fileName, dirPath }
}

interface AttentionSidebarProps {
  projectPath: string | null
  attentionPatterns: string[]
  ignorePatterns: string[]
  onPatternsChange: (patterns: string[]) => void
  onAddIgnorePattern: (pattern: string) => void | Promise<void>
  onRemoveIgnorePattern: (pattern: string) => void | Promise<void>
  disabled?: boolean
}

export default function AttentionSidebar({
  projectPath,
  attentionPatterns,
  ignorePatterns,
  onPatternsChange,
  onAddIgnorePattern,
  onRemoveIgnorePattern,
  disabled = false
}: AttentionSidebarProps): ReactElement {
  const [textareaValue, setTextareaValue] = useState('')
  const [previewFiles, setPreviewFiles] = useState<PreviewFile[]>([])
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [ignoreInput, setIgnoreInput] = useState('')
  const [isCopying, setIsCopying] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const previewRequestRef = useRef(0)

  useEffect(() => {
    setTextareaValue(attentionPatterns.join('\n'))
  }, [projectPath])

  const patterns = useMemo(() => {
    return textareaValue
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }, [textareaValue])

  useEffect(() => {
    if (disabled || patterns.length === 0) {
      previewRequestRef.current += 1
      setPreviewFiles([])
      setPreviewError(null)
      return
    }

    let cancelled = false
    const requestId = ++previewRequestRef.current

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (cancelled || previewRequestRef.current !== requestId) return

      setIsLoadingPreview(true)
      try {
        const { files, error } = await window.api.preview_attention(patterns)
        if (cancelled || previewRequestRef.current !== requestId) return
        if (error) {
          setPreviewError(error)
          setPreviewFiles([])
        } else {
          setPreviewFiles(files ?? [])
          setPreviewError(null)
        }
      } catch (e) {
        if (cancelled || previewRequestRef.current !== requestId) return
        setPreviewError(e instanceof Error ? e.message : String(e))
        setPreviewFiles([])
      } finally {
        if (!cancelled && previewRequestRef.current === requestId) {
          setIsLoadingPreview(false)
        }
      }
    }, ATTENTION_DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [textareaValue, disabled])

  useEffect(() => {
    if (disabled) return
    const timer = setTimeout(() => {
      onPatternsChange(patterns)
    }, 500)
    return () => clearTimeout(timer)
  }, [textareaValue])

  const handleCopyInstruction = async (): Promise<void> => {
    setIsCopying(true)
    try {
      const { content } = await window.api.get_prompt_instruction()
      await navigator.clipboard.writeText(content)
    } catch {
      // silent fallback
    } finally {
      setTimeout(() => setIsCopying(false), 1500)
    }
  }

  const handleResetInstruction = async (): Promise<void> => {
    await window.api.reset_prompt_instruction()
  }

  const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setTextareaValue(e.target.value)
  }

  const handleIgnoreKeyDown = async (e: { key: string }): Promise<void> => {
    if (e.key !== 'Enter') return
    const pattern = ignoreInput.trim()
    if (!pattern || disabled) return
    await onAddIgnorePattern(pattern)
    setIgnoreInput('')
  }

  const totalTokens = previewFiles.reduce((sum, f) => sum + (f.tokens ?? 0), 0)

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-borderDark/20 bg-white">
      {/* Section 1: AI Instruction */}
      <section className="shrink-0 border-b border-borderDark/20 px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
          <Focus size={14} />
          AI Instruction
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopyInstruction}
            disabled={disabled || isCopying}
            className="flex items-center gap-1.5 rounded-sm border border-accent bg-accent/5 px-3 py-1 text-[12px] font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
          >
            <Copy size={12} />
            {isCopying ? 'Copied!' : 'Copy AI Instruction'}
          </button>
          <button
            onClick={handleResetInstruction}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-sm border border-borderDark bg-white px-3 py-1 text-[12px] font-medium text-textMuted transition hover:bg-gray-100 disabled:opacity-50"
            title="Reset prompt file to default"
          >
            <RefreshCw size={12} />
            Reset
          </button>
        </div>
      </section>

      {/* Section 2: Pattern Input */}
      <section className="shrink-0 border-b border-borderDark/20 px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
          <FileText size={14} />
          Attention Patterns
        </div>
        <textarea
          value={textareaValue}
          onChange={handleTextareaChange}
          disabled={disabled}
          placeholder={
            disabled
              ? 'Open a project to start...'
              : 'src/auth/**\n*.controller.ts\nsrc/types/user.types.ts'
          }
          spellCheck={false}
          className="w-full resize-none rounded-sm border border-borderDark bg-white px-2 py-1.5 text-[13px] font-mono leading-relaxed transition focus:border-accent focus:outline-none disabled:opacity-50"
          style={{ height: '160px' }}
        />
      </section>

      {/* Section 3: Preview */}
      <section className="flex min-h-0 flex-1 flex-col bg-gray-50/60">
        <div className="shrink-0 border-b border-borderDark/20 bg-gray-100/60 px-4 py-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-textMuted">
            Matched Files
          </span>
          {patterns.length > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              Matched: {previewFiles.length} | Tokens: {formatTokenCount(totalTokens)}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {disabled ? (
            <div className="px-4 py-4 text-[12px] text-textMuted">Open a project to preview.</div>
          ) : patterns.length === 0 ? (
            <div className="px-4 py-4 text-[12px] text-textMuted">Enter patterns to see matching files.</div>
          ) : isLoadingPreview ? (
            <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-textMuted">
              <Loader2 size={14} className="animate-spin text-accent" />
              Loading preview...
            </div>
          ) : previewError ? (
            <div className="px-4 py-3 text-[12px] text-danger">{previewError}</div>
          ) : previewFiles.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-textMuted">No files match these patterns.</div>
          ) : (
            <>
              {previewFiles.map((file) => {
                const { fileName, dirPath } = splitRelPath(file.relPath)
                return (
                  <div
                    key={file.absPath}
                    className="border-b border-gray-100 px-3 py-1.5 transition-colors hover:bg-blue-50/70"
                    title={file.relPath}
                  >
                    <div className="flex items-center justify-between min-w-0">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold text-gray-800">
                        <FileText size={14} className="shrink-0 text-blue-500" />
                        <span className="truncate">{fileName}</span>
                      </div>
                      <span className="ml-2 shrink-0 rounded-full bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                        {formatTokenCount(file.tokens || 0)}
                      </span>
                    </div>
                    <div className="truncate pl-5 text-[11px] text-gray-500">{dirPath}</div>
                  </div>
                )
              })}
              {previewFiles.length >= PREVIEW_LIMIT && (
                <div className="px-4 py-2 text-[11px] text-textMuted">
                  Showing first {PREVIEW_LIMIT} matches.
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Section 4: Global Ignore */}
      <section className="shrink-0 border-t border-borderDark/20 px-4 py-3 bg-white">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
          <EyeOff size={14} />
          Global Ignore
        </div>
        <input
          type="text"
          value={ignoreInput}
          onChange={(e) => setIgnoreInput(e.target.value)}
          onKeyDown={(e) => handleIgnoreKeyDown(e)}
          disabled={disabled}
          placeholder={disabled ? 'Open a project to ignore' : 'e.g. *.log, temp/, draft_*.md'}
          className="w-full rounded-sm border border-borderDark bg-white px-2 py-1.5 text-[13px] transition focus:border-danger focus:outline-none disabled:opacity-50"
        />

        <div className="mt-2">
          {ignorePatterns.length > 0 ? (
            <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {ignorePatterns.map((pattern) => (
                <span
                  key={pattern}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[12px] font-medium text-red-800"
                >
                  <span className="min-w-0 truncate">{pattern}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveIgnorePattern(pattern)}
                    disabled={disabled}
                    className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-red-200 disabled:opacity-50"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-textMuted">No custom ignore patterns.</div>
          )}
        </div>
      </section>
    </aside>
  )
}
