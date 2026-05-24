import { useState, type ReactElement } from 'react'
import { EyeOff, X } from 'lucide-react'

interface GlobalIgnorePanelProps {
  ignorePatterns: string[]
  onAddIgnorePattern: (pattern: string) => void | Promise<void>
  onRemoveIgnorePattern: (pattern: string) => void | Promise<void>
  disabled?: boolean
}

export default function GlobalIgnorePanel({
  ignorePatterns,
  onAddIgnorePattern,
  onRemoveIgnorePattern,
  disabled = false
}: GlobalIgnorePanelProps): ReactElement {
  const [ignoreInput, setIgnoreInput] = useState('')

  const handleIgnoreKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>): Promise<void> => {
    if (e.key !== 'Enter') return
    const pattern = ignoreInput.trim()
    if (!pattern || disabled) return
    await onAddIgnorePattern(pattern)
    setIgnoreInput('')
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-borderDark/20 bg-white">
      <section className="shrink-0 border-b border-borderDark/20 px-4 py-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-textMuted">
          <EyeOff size={16} />
          Global Ignore Settings
        </div>
        <p className="text-[12px] text-textMuted mb-3">
          Files and folders matching these patterns will be completely ignored across the entire
          project (Scan, Context, Attention, and Plan).
        </p>
        <input
          type="text"
          value={ignoreInput}
          onChange={(e) => setIgnoreInput(e.target.value)}
          onKeyDown={handleIgnoreKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Open a project to ignore...' : 'e.g. *.log, temp/, draft_*.md'}
          className="w-full rounded-sm border border-borderDark bg-white px-3 py-2 text-[13px] transition focus:border-danger focus:outline-none disabled:opacity-50"
        />

        <div className="mt-4">
          <div className="text-[11px] font-semibold text-textMuted uppercase mb-2">
            Active Rules ({ignorePatterns.length})
          </div>
          {ignorePatterns.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 overflow-y-auto max-h-[60vh] pr-1">
              {ignorePatterns.map((pattern) => (
                <span
                  key={pattern}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-red-200 bg-red-50 px-2.5 py-1 text-[12px] font-medium text-red-800"
                >
                  <span className="min-w-0 truncate">{pattern}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveIgnorePattern(pattern)}
                    disabled={disabled}
                    className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-red-200 disabled:opacity-50"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-textMuted italic">
              No custom ignore patterns defined.
            </div>
          )}
        </div>
      </section>
    </aside>
  )
}
