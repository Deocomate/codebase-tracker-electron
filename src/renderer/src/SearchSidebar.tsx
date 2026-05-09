import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement
} from 'react'
import { EyeOff, FileText, Folder, Loader2, Search, Tags, X } from 'lucide-react'
import { formatTokenCount } from './TreeView'

const PREVIEW_LIMIT = 50

type ActivePanel = 'ignore' | 'search' | 'none'

interface PreviewFile {
  absPath: string
  relPath: string
  isDir?: boolean
  source?: 'global' | 'search' | 'ignore'
  tokens?: number
}

interface SearchSidebarProps {
  keywords: string[]
  keywordStats: Record<string, number>
  ignorePatterns: string[]
  onAddKeyword: (keyword: string) => void | Promise<void>
  onRemoveKeyword: (keyword: string) => void | Promise<void>
  onAddIgnorePattern: (pattern: string) => void | Promise<void>
  onRemoveIgnorePattern: (pattern: string) => void | Promise<void>
  disabled?: boolean
}

function splitRelPath(relPath: string): { fileName: string; dirPath: string } {
  const normalized = relPath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  const fileName = parts.pop() || normalized
  const dirPath = parts.length > 0 ? parts.join('/') : '.'
  return { fileName, dirPath }
}

function sectionBlurHandler(
  event: FocusEvent<HTMLElement>,
  setActivePanel: (panel: ActivePanel) => void
): void {
  const nextTarget = event.relatedTarget
  if (nextTarget && event.currentTarget.contains(nextTarget)) return
  setActivePanel('none')
}

export default function SearchSidebar({
  keywords,
  keywordStats,
  ignorePatterns,
  onAddKeyword,
  onRemoveKeyword,
  onAddIgnorePattern,
  onRemoveIgnorePattern,
  disabled = false
}: SearchSidebarProps): ReactElement {
  const [activePanel, setActivePanel] = useState<ActivePanel>('none')
  const [ignoreInput, setIgnoreInput] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [ignorePreviewFiles, setIgnorePreviewFiles] = useState<PreviewFile[]>([])
  const [searchPreviewFiles, setSearchPreviewFiles] = useState<PreviewFile[]>([])
  const [isPreviewingIgnore, setIsPreviewingIgnore] = useState(false)
  const [isPreviewingSearch, setIsPreviewingSearch] = useState(false)
  const [ignorePreviewError, setIgnorePreviewError] = useState<string | null>(null)
  const [searchPreviewError, setSearchPreviewError] = useState<string | null>(null)
  const ignorePreviewRequestRef = useRef(0)
  const searchPreviewRequestRef = useRef(0)

  const trimmedIgnoreInput = ignoreInput.trim()
  const trimmedSearchInput = searchInput.trim()
  const hasIgnorePreviewQuery = trimmedIgnoreInput.length > 0
  const hasSearchPreviewQuery = trimmedSearchInput.length > 0

  useEffect(() => {
    if (activePanel !== 'ignore' || !trimmedIgnoreInput || disabled) {
      ignorePreviewRequestRef.current += 1
      return
    }

    let isCancelled = false
    const requestId = ++ignorePreviewRequestRef.current
    const timer = setTimeout(async () => {
      if (isCancelled || ignorePreviewRequestRef.current !== requestId) return

      setIsPreviewingIgnore(true)
      try {
        const response = await window.api.preview_ignore_pattern(trimmedIgnoreInput, PREVIEW_LIMIT)
        if (isCancelled || ignorePreviewRequestRef.current !== requestId) return

        if (response.error) {
          setIgnorePreviewError(response.error)
          setIgnorePreviewFiles([])
        } else {
          setIgnorePreviewFiles(Array.isArray(response.files) ? response.files : [])
        }
      } catch (error: unknown) {
        if (isCancelled || ignorePreviewRequestRef.current !== requestId) return
        setIgnorePreviewError(error instanceof Error ? error.message : String(error))
        setIgnorePreviewFiles([])
      } finally {
        if (!isCancelled && ignorePreviewRequestRef.current === requestId) setIsPreviewingIgnore(false)
      }
    }, 300)

    return () => {
      isCancelled = true
      clearTimeout(timer)
    }
  }, [activePanel, trimmedIgnoreInput, disabled])

  useEffect(() => {
    if (activePanel !== 'search' || !trimmedSearchInput || disabled) {
      searchPreviewRequestRef.current += 1
      return
    }

    let isCancelled = false
    const requestId = ++searchPreviewRequestRef.current
    const timer = setTimeout(async () => {
      if (isCancelled || searchPreviewRequestRef.current !== requestId) return

      setIsPreviewingSearch(true)
      try {
        const response = await window.api.search_preview(trimmedSearchInput, PREVIEW_LIMIT)
        if (isCancelled || searchPreviewRequestRef.current !== requestId) return

        if (response.error) {
          setSearchPreviewError(response.error)
          setSearchPreviewFiles([])
        } else {
          setSearchPreviewFiles(Array.isArray(response.files) ? response.files : [])
        }
      } catch (error: unknown) {
        if (isCancelled || searchPreviewRequestRef.current !== requestId) return
        setSearchPreviewError(error instanceof Error ? error.message : String(error))
        setSearchPreviewFiles([])
      } finally {
        if (!isCancelled && searchPreviewRequestRef.current === requestId) setIsPreviewingSearch(false)
      }
    }, 250)

    return () => {
      isCancelled = true
      clearTimeout(timer)
      void window.api.cancel_search_preview()
    }
  }, [activePanel, trimmedSearchInput, disabled])

  const ignorePreviewItems = useMemo(
    () => ignorePreviewFiles.map((file) => ({ ...file, ...splitRelPath(file.relPath) })),
    [ignorePreviewFiles]
  )

  const searchPreviewItems = useMemo(
    () => searchPreviewFiles.map((file) => ({ ...file, ...splitRelPath(file.relPath) })),
    [searchPreviewFiles]
  )

  const cancelSearchPreview = (): void => {
    searchPreviewRequestRef.current += 1
    void window.api.cancel_search_preview()
  }

  const handleSearchSectionBlur = (event: FocusEvent<HTMLElement>): void => {
    const nextTarget = event.relatedTarget
    if (nextTarget && event.currentTarget.contains(nextTarget)) return

    cancelSearchPreview()
    setIsPreviewingSearch(false)
    setActivePanel('none')
  }

  const handleIgnoreInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    ignorePreviewRequestRef.current += 1
    setIgnoreInput(event.target.value)
    setIgnorePreviewFiles([])
    setIgnorePreviewError(null)
    setIsPreviewingIgnore(false)
  }

  const handleSearchInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    cancelSearchPreview()
    setSearchInput(event.target.value)
    setSearchPreviewFiles([])
    setSearchPreviewError(null)
    setIsPreviewingSearch(false)
  }

  const handleIgnoreKeyDown = async (event: KeyboardEvent<HTMLInputElement>): Promise<void> => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    const pattern = ignoreInput.trim()
    if (!pattern || disabled) return

    await onAddIgnorePattern(pattern)
    setIgnoreInput('')
    setIgnorePreviewFiles([])
    setIgnorePreviewError(null)
    setIsPreviewingIgnore(false)
  }

  const handleSearchKeyDown = async (event: KeyboardEvent<HTMLInputElement>): Promise<void> => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    const keyword = searchInput.trim()
    if (!keyword || disabled) return

    cancelSearchPreview()
    await onAddKeyword(keyword)
    setSearchInput('')
    setSearchPreviewFiles([])
    setSearchPreviewError(null)
    setIsPreviewingSearch(false)
  }

  const previewTitle = activePanel === 'ignore'
    ? 'Will Be Ignored'
    : activePanel === 'search'
      ? 'Search Preview'
      : 'Preview'

  const renderIgnorePreview = (): ReactElement => {
    if (!hasIgnorePreviewQuery) {
      return (
        <div className="px-4 py-4 text-[12px] text-textMuted">
          Type a .gitignore pattern to preview hidden files.
        </div>
      )
    }

    if (isPreviewingIgnore) {
      return (
        <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-textMuted">
          <Loader2 size={14} className="animate-spin text-danger" />
          Loading ignore preview...
        </div>
      )
    }

    if (ignorePreviewError) {
      return <div className="px-4 py-3 text-[12px] text-danger">{ignorePreviewError}</div>
    }

    if (ignorePreviewItems.length === 0) {
      return <div className="px-4 py-3 text-[12px] text-textMuted">No visible files will be hidden.</div>
    }

    return (
      <>
        {ignorePreviewItems.map((file) => {
          const Icon = file.isDir ? Folder : FileText
          return (
            <div
              key={file.absPath}
              className="border-b border-red-100/70 px-3 py-1.5 transition-colors hover:bg-red-50/70"
              title={file.relPath}
            >
              <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-gray-800">
                <Icon size={14} className="shrink-0 text-danger" />
                <span className="truncate">{file.fileName}</span>
              </div>
              <div className="truncate pl-5 text-[11px] text-gray-500">{file.dirPath}</div>
            </div>
          )
        })}

        {ignorePreviewItems.length >= PREVIEW_LIMIT && (
          <div className="px-4 py-2 text-[11px] text-textMuted">
            Showing first {PREVIEW_LIMIT} ignored paths.
          </div>
        )}
      </>
    )
  }

  const renderSearchPreview = (): ReactElement => {
    if (!hasSearchPreviewQuery) {
      return (
        <div className="px-4 py-4 text-[12px] text-textMuted">
          Type a keyword to preview matching files.
        </div>
      )
    }

    if (isPreviewingSearch) {
      return (
        <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-textMuted">
          <Loader2 size={14} className="animate-spin text-accent" />
          Loading preview...
        </div>
      )
    }

    if (searchPreviewError) {
      return <div className="px-4 py-3 text-[12px] text-danger">{searchPreviewError}</div>
    }

    if (searchPreviewItems.length === 0) {
      return <div className="px-4 py-3 text-[12px] text-textMuted">No matches found.</div>
    }

    return (
      <>
        {searchPreviewItems.map((file) => (
          <div
            key={file.absPath}
            className="border-b border-gray-100 px-3 py-1.5 transition-colors hover:bg-gray-50"
            title={file.relPath}
          >
            <div className="flex items-center justify-between min-w-0">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-semibold text-gray-800">
                <FileText size={14} className="shrink-0 text-blue-500" />
                <span className="truncate">{file.fileName}</span>
              </div>
              <span className="ml-2 shrink-0 rounded-full bg-slate-200/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                {formatTokenCount(file.tokens || 0)}
              </span>
            </div>
            <div className="truncate pl-5 text-[11px] text-gray-500">{file.dirPath}</div>
          </div>
        ))}

        {searchPreviewItems.length >= PREVIEW_LIMIT && (
          <div className="px-4 py-2 text-[11px] text-textMuted">
            Showing first {PREVIEW_LIMIT} matches.
          </div>
        )}
      </>
    )
  }

  const renderPreviewContent = (): ReactElement => {
    if (disabled) {
      return <div className="px-4 py-4 text-[12px] text-textMuted">Open a project to enable previews.</div>
    }

    if (activePanel === 'ignore') return renderIgnorePreview()
    if (activePanel === 'search') return renderSearchPreview()

    return <div className="px-4 py-4 text-[12px] text-textMuted">Focus an input to show live preview.</div>
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-borderDark/20 bg-white">
      <section
        className="shrink-0 border-b border-borderDark/20 px-4 py-3 transition-colors"
        onBlur={(event) => sectionBlurHandler(event, setActivePanel)}
      >
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
          <EyeOff size={14} />
          Global Ignore
        </div>
        <input
          type="text"
          value={ignoreInput}
          onFocus={() => setActivePanel('ignore')}
          onChange={handleIgnoreInputChange}
          onKeyDown={handleIgnoreKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Open a project to ignore' : 'e.g. *.log, temp/, draft_*.md'}
          className="w-full rounded-sm border border-borderDark bg-white px-2 py-1.5 text-[13px] transition focus:border-danger focus:outline-none disabled:opacity-50"
        />

        <div className="mt-2">
          {ignorePatterns.length > 0 ? (
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
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
                    aria-label={`Remove ${pattern}`}
                    title="Remove ignore pattern"
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

      <section
        className="shrink-0 border-b border-borderDark/20 px-4 py-3 transition-colors"
        onBlur={handleSearchSectionBlur}
      >
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-textMuted">
          <Search size={14} />
          Search Context
        </div>
        <input
          type="text"
          value={searchInput}
          onFocus={() => setActivePanel('search')}
          onChange={handleSearchInputChange}
          onKeyDown={handleSearchKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Open a project to search' : 'Type keyword to search...'}
          className="w-full rounded-sm border border-borderDark bg-white px-2 py-1.5 text-[13px] transition focus:border-accent focus:outline-none disabled:opacity-50"
        />

        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-textMuted">
            <Tags size={13} />
            Active Keywords
          </div>
          {keywords.length > 0 ? (
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {keywords.map((keyword) => {
                const hasStat = Object.prototype.hasOwnProperty.call(keywordStats, keyword)
                const countLabel = hasStat ? keywordStats[keyword] : '...'

                return (
                  <span
                    key={keyword}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[12px] font-medium text-blue-800"
                  >
                    <span className="min-w-0 truncate">{keyword}</span>
                    <span className="shrink-0 font-semibold">({countLabel})</span>
                    <button
                      type="button"
                      onClick={() => onRemoveKeyword(keyword)}
                      disabled={disabled}
                      className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-blue-200 disabled:opacity-50"
                      aria-label={`Remove ${keyword}`}
                      title="Remove keyword"
                    >
                      <X size={10} />
                    </button>
                  </span>
                )
              })}
            </div>
          ) : (
            <div className="text-[12px] text-textMuted">No active keywords.</div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col bg-gray-50/60">
        <div className="shrink-0 border-b border-borderDark/20 bg-gray-100/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-textMuted">
          {previewTitle}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{renderPreviewContent()}</div>
      </section>
    </aside>
  )
}
