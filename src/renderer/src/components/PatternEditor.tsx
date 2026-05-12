import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement
} from 'react'
import { Ban, FileText, Folder, Tags } from 'lucide-react'
import { getGlobSuggestions } from '../utils/globAutocomplete'

interface PatternEditorProps {
  value: string
  onChange: (value: string) => void
  availablePaths: string[]
  disabled?: boolean
  placeholder?: string
}

interface TokenInfo {
  token: string
  start: number
  end: number
}

interface PopupPosition {
  left: number
  top: number
}

const MAX_SUGGESTIONS = 10
const POPUP_WIDTH = 360
const POPUP_CONTROL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'])

function getTokenAtCaret(value: string, caret: number): TokenInfo | null {
  const lineStart = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1
  let start = caret

  while (start > lineStart && !/\s/.test(value[start - 1])) {
    start -= 1
  }

  const token = value.slice(start, caret)
  if (!token) return null

  return { token, start, end: caret }
}

function getSuggestionKind(suggestion: string): 'negation' | 'extension' | 'folder' | 'file' {
  const withoutNegation = suggestion.startsWith('!') ? suggestion.slice(1) : suggestion
  const lastSegment = withoutNegation.split('/').pop() ?? withoutNegation
  if (suggestion.startsWith('!')) return 'negation'
  if (lastSegment.startsWith('*.')) return 'extension'
  if (withoutNegation.endsWith('/')) return 'folder'
  return 'file'
}

function shouldAppendNewline(suggestion: string): boolean {
  const withoutNegation = suggestion.startsWith('!') ? suggestion.slice(1) : suggestion
  return !withoutNegation.endsWith('/')
}

function getLiteralQuery(query: string): string {
  const withoutNegation = query.startsWith('!') ? query.slice(1) : query
  const lastGlobIndex = Math.max(
    withoutNegation.lastIndexOf('*'),
    withoutNegation.lastIndexOf('?')
  )
  const literal = lastGlobIndex === -1
    ? withoutNegation
    : withoutNegation.slice(lastGlobIndex + 1)
  return literal.replace(/^\/+/, '').toLowerCase()
}

function HighlightedText({ text, query }: { text: string; query: string }): ReactElement {
  const literalQuery = getLiteralQuery(query)
  if (!literalQuery) return <>{text}</>

  const lowerText = text.toLowerCase()
  const matchIndex = lowerText.indexOf(literalQuery)
  if (matchIndex === -1) return <>{text}</>

  const before = text.slice(0, matchIndex)
  const match = text.slice(matchIndex, matchIndex + literalQuery.length)
  const after = text.slice(matchIndex + literalQuery.length)

  return (
    <>
      {before}
      <span className="font-semibold underline decoration-current/40 underline-offset-2">
        {match}
      </span>
      {after}
    </>
  )
}

function SuggestionIcon({ suggestion }: { suggestion: string }): ReactElement {
  const kind = getSuggestionKind(suggestion)
  const className = 'h-3.5 w-3.5 shrink-0'

  if (kind === 'negation') return <Ban className={`${className} text-danger`} />
  if (kind === 'extension') return <Tags className={`${className} text-amber-600`} />
  if (kind === 'folder') return <Folder className={`${className} text-blue-500`} />
  return <FileText className={`${className} text-slate-500`} />
}

export default function PatternEditor({
  value,
  onChange,
  availablePaths,
  disabled = false,
  placeholder
}: PatternEditorProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [popupPosition, setPopupPosition] = useState<PopupPosition>({ left: 8, top: 8 })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isFocused, setIsFocused] = useState(false)
  const currentToken = tokenInfo?.token ?? ''

  const suggestions = useMemo(() => {
    if (disabled || !currentToken) return []

    return getGlobSuggestions(currentToken, availablePaths, MAX_SUGGESTIONS)
  }, [availablePaths, currentToken, disabled])

  const showSuggestions = isFocused && suggestions.length > 0
  const activeSuggestionIndex = suggestions.length > 0
    ? Math.min(selectedIndex, suggestions.length - 1)
    : 0

  const updatePopup = useCallback((nextValue: string, caret: number): void => {
    const nextToken = getTokenAtCaret(nextValue, caret)
    setTokenInfo(nextToken)
    setSelectedIndex(0)

    const textarea = textareaRef.current
    const mirror = mirrorRef.current
    const container = containerRef.current
    if (!nextToken || !textarea || !mirror || !container) return

    mirror.style.width = `${textarea.clientWidth}px`
    mirror.textContent = nextValue.slice(0, caret)
    const marker = document.createElement('span')
    marker.textContent = nextValue.slice(caret, caret + 1) || '.'
    mirror.appendChild(marker)

    const maxLeft = Math.max(8, container.clientWidth - POPUP_WIDTH - 8)
    const left = Math.min(Math.max(marker.offsetLeft - textarea.scrollLeft, 8), maxLeft)
    const top = marker.offsetTop - textarea.scrollTop + 24
    setPopupPosition({ left, top })
  }, [])

  const applySuggestion = useCallback((suggestion: string): void => {
    if (!tokenInfo) return

    const suffix = value.slice(tokenInfo.end)
    const newline = shouldAppendNewline(suggestion) && !suffix.startsWith('\n') ? '\n' : ''
    const nextValue = value.slice(0, tokenInfo.start) + suggestion + newline + suffix
    const nextCaret = tokenInfo.start + suggestion.length + newline.length
    onChange(nextValue)
    setTokenInfo(null)

    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(nextCaret, nextCaret)
      updatePopup(nextValue, nextCaret)
    })
  }, [onChange, tokenInfo, updatePopup, value])

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    const nextValue = event.target.value
    onChange(nextValue)
    updatePopup(nextValue, event.target.selectionStart)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!showSuggestions) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((index) => (index + 1) % suggestions.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((index) => (index - 1 + suggestions.length) % suggestions.length)
      return
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      applySuggestion(suggestions[activeSuggestionIndex])
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setTokenInfo(null)
    }
  }

  const handleKeyUp = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (POPUP_CONTROL_KEYS.has(event.key)) return
    updatePopup(value, event.currentTarget.selectionStart)
  }

  return (
    <div ref={containerRef} className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={(event) => updatePopup(value, event.currentTarget.selectionStart)}
        onScroll={(event) => updatePopup(value, event.currentTarget.selectionStart)}
        onFocus={(event) => {
          setIsFocused(true)
          updatePopup(value, event.currentTarget.selectionStart)
        }}
        onBlur={() => {
          setIsFocused(false)
        }}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        className="h-40 w-full resize-none rounded-sm border border-borderDark bg-white px-2 py-1.5 font-mono text-[13px] leading-relaxed text-textMain transition focus:border-accent focus:outline-none disabled:opacity-50"
      />

      <div
        ref={mirrorRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre-wrap break-words border border-transparent px-2 py-1.5 font-mono text-[13px] leading-relaxed"
      />

      {showSuggestions && (
        <div
          className="absolute z-30 max-h-52 overflow-y-auto rounded-sm border border-borderDark bg-white py-1 shadow-lg"
          style={{
            left: popupPosition.left,
            top: popupPosition.top,
            width: POPUP_WIDTH
          }}
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault()
                applySuggestion(suggestion)
              }}
              className={`flex w-full items-center gap-2 truncate px-2.5 py-1.5 text-left font-mono text-[12px] ${
                index === activeSuggestionIndex
                  ? 'bg-accent text-white'
                  : 'text-textMain hover:bg-blue-50'
              }`}
              title={suggestion}
            >
              <SuggestionIcon suggestion={suggestion} />
              <span className="min-w-0 truncate">
                <HighlightedText text={suggestion} query={currentToken} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
