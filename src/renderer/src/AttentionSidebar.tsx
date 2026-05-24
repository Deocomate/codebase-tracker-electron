import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement
} from 'react'
import { Copy, FileText, RefreshCw, Focus } from 'lucide-react'
import MatchedFilesPreview from './components/MatchedFilesPreview'
import PatternEditor from './components/PatternEditor'
import type { AttentionFileEntry } from './types'

const ATTENTION_DEBOUNCE_MS = 300

interface AttentionSidebarProps {
  projectPath: string | null
  attentionPatterns: string[]
  availablePaths: string[]
  onPatternsChange: (patterns: string[]) => void
  disabled?: boolean
}

export default function AttentionSidebar({
  projectPath,
  attentionPatterns,
  availablePaths,
  onPatternsChange,
  disabled = false
}: AttentionSidebarProps): ReactElement {
  const [textareaValue, setTextareaValue] = useState('')
  const [previewFiles, setPreviewFiles] = useState<AttentionFileEntry[]>([])
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [isCopying, setIsCopying] = useState(false)
  const [isCopyingFiles, setIsCopyingFiles] = useState(false)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const previewRequestRef = useRef(0)
  const lastProjectPathRef = useRef<string | null>(null)
  const hasInitializedPatternsRef = useRef(false)
  const skipNextSaveRef = useRef(false)

  useEffect(() => {
    if (lastProjectPathRef.current === projectPath) return

    lastProjectPathRef.current = projectPath
    hasInitializedPatternsRef.current = false
    skipNextSaveRef.current = false
    previewRequestRef.current += 1
    setTextareaValue('')
    setPreviewFiles([])
    setPreviewError(null)

    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
  }, [projectPath])

  useEffect(() => {
    if (!projectPath || disabled || hasInitializedPatternsRef.current) return

    skipNextSaveRef.current = true
    hasInitializedPatternsRef.current = true
    setTextareaValue(attentionPatterns.join('\n'))
  }, [attentionPatterns, disabled, projectPath])

  const patterns = useMemo(() => {
    return textareaValue
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }, [textareaValue])

  useEffect(() => {
    if (disabled || patterns.length === 0) {
      let cancelled = false
      previewRequestRef.current += 1
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
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    }
  }, [patterns, disabled])

  useEffect(() => {
    if (disabled || !projectPath || !hasInitializedPatternsRef.current) return

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }

    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      onPatternsChange(patterns)
    }, 500)
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    }
  }, [disabled, onPatternsChange, patterns, projectPath])

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

  const handleTextareaChange = (value: string): void => {
    setTextareaValue(value)
  }

  const handleCopyFiles = async (): Promise<void> => {
    if (previewFiles.length === 0) return
    setIsCopyingFiles(true)
    try {
      const payload = previewFiles.map((f) => ({ absPath: f.absPath, relPath: f.relPath }))
      await window.api.copy_combined_files(payload)
    } catch (err) {
      console.error('Copy failed', err)
    } finally {
      setTimeout(() => setIsCopyingFiles(false), 1000)
    }
  }

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
        <PatternEditor
          value={textareaValue}
          onChange={handleTextareaChange}
          availablePaths={availablePaths}
          disabled={disabled}
          placeholder={
            disabled
              ? 'Open a project to start...'
              : 'src/auth/**\n*.controller.ts\nsrc/types/user.types.ts'
          }
        />
      </section>

      {/* Section 3: Preview */}
      <MatchedFilesPreview
        files={previewFiles}
        inputCount={patterns.length}
        disabled={disabled}
        isLoading={isLoadingPreview}
        error={previewError}
        onCopyAll={handleCopyFiles}
        isCopyingAll={isCopyingFiles}
      />
    </aside>
  )
}
