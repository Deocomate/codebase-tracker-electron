---
phase: 4
title: "Redesign UI"
status: pending
priority: P2
effort: "4h"
dependencies: [3]
---

# Phase 4: Redesign UI

## Overview

Add a "Search Context" section below the existing TreeView sidebar. Users input keywords, see them as removable tags, and view live match counts. The "Scan & Generate" button includes search keywords in the IPC call.

## Requirements

- Functional:
  - Search input: type keyword + Enter → add keyword tag
  - Keyword tags: removable with X button
  - Live match count: updates when keywords change (debounced)
  - Keywords persisted: loaded from settings on project load
  - Generate passes keywords to IPC
  - Existing TreeView behavior unchanged
- Non-functional:
  - No flicker during keyword updates
  - Match count debounced at 500ms, uses `quickOnly: true` (path/name matching only) — fast IPC, no content I/O

## Architecture

```
Sidebar
├── Tab Bar: [Selected] [Ignored]        ← existing
├── Explorer header + Reload button       ← existing
├── TreeView (scrollable)                 ← existing
├── ─── Divider ───
├── Search Context Panel                  ← NEW
│   ├── Header: "Search Context" + badge (match count)
│   ├── Input: [keyword input + Enter ↵]
│   └── Tags: [auth ✕] [payment ✕] [login.ts ✕]
└── (scrollable together or fixed bottom)
```

## Related Code Files

- **Create:** `src/renderer/src/SearchContextPanel.tsx`
- **Modify:** `src/renderer/src/App.tsx`
- **Modify:** `src/renderer/src/types/index.ts` (if new types needed)

## Implementation Steps

### 4.1 Create SearchContextPanel.tsx

New component — self-contained keyword management UI:

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  keywords: string[]
  matchCount: number
  onAddKeyword: (kw: string) => void
  onRemoveKeyword: (kw: string) => void
  disabled?: boolean
}

export default function SearchContextPanel({
  keywords,
  matchCount,
  onAddKeyword,
  onRemoveKeyword,
  disabled
}: Props) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      onAddKeyword(input.trim())
      setInput('')
    }
  }

  return (
    <div className="px-4 py-3 border-t border-borderDark/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-textMuted uppercase tracking-wider">
          <Search size={14} /> Search Context
        </div>
        {keywords.length > 0 && (
          <span className="text-[11px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
            {matchCount} files
          </span>
        )}
      </div>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Type keyword + Enter ↵"
        className="w-full bg-white border border-borderDark rounded-sm px-2 py-1.5 text-[13px] 
                   focus:outline-none focus:border-accent transition disabled:opacity-50 mb-2"
      />

      {/* Keyword Tags */}
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 
                         text-blue-800 text-[12px] font-medium px-2 py-0.5 rounded-full"
            >
              {kw}
              <button
                onClick={() => onRemoveKeyword(kw)}
                disabled={disabled}
                className="hover:bg-blue-200 rounded-full p-0.5 transition-colors 
                           disabled:opacity-50"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

### 4.2 Modify App.tsx

**Add new state:**
```typescript
const [searchKeywords, setSearchKeywords] = useState<string[]>([])
const [searchMatchCount, setSearchMatchCount] = useState(0)
```

**Load keywords on project load:**
In `loadProjectFromPath()`, after successful load:
```typescript
const kwRes = await window.api.get_search_keywords()
if (kwRes.keywords) {
  setSearchKeywords(kwRes.keywords)
  updateMatchCount(kwRes.keywords)
}
```

**Debounced match count update:**
```typescript
const debounceRef = useRef<ReturnType<typeof setTimeout>>()

const updateMatchCount = useCallback(async (kws: string[]) => {
  if (debounceRef.current) clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(async () => {
    const res = await window.api.get_search_match_count(kws)
    setSearchMatchCount(res.count ?? 0)
  }, 500)
}, [])
```

**Keyword handlers:**
```typescript
const handleAddKeyword = useCallback(async (kw: string) => {
  const res = await window.api.add_search_keyword(kw)
  if (res.keywords) {
    setSearchKeywords(res.keywords)
    updateMatchCount(res.keywords)
  }
}, [updateMatchCount])

const handleRemoveKeyword = useCallback(async (kw: string) => {
  const res = await window.api.remove_search_keyword(kw)
  if (res.keywords) {
    setSearchKeywords(res.keywords)
    updateMatchCount(res.keywords)
  }
}, [updateMatchCount])
```

**Update handleStart to pass keywords:**
```typescript
const handleStart = useCallback(async (): Promise<void> => {
  // ... existing ...
  await window.api.start_generation(
    selectedFormats, splitEnabled, splitCount, searchKeywords
  )
}, [projectPath, formats, splitEnabled, splitCount, searchKeywords])
```

### 4.3 Add SearchContextPanel to sidebar layout

In the sidebar (right panel), after the closing `</div>` of the TreeView container and before the closing `</div>` of the sidebar:

```tsx
<SearchContextPanel
  keywords={searchKeywords}
  matchCount={searchMatchCount}
  onAddKeyword={handleAddKeyword}
  onRemoveKeyword={handleRemoveKeyword}
  disabled={isGenerating || !projectPath}
/>
```

### 4.4 Remove old unused code

The `useMemo` block around `filteredTreeData` can stay as-is — no changes to TreeView filtering.

## Success Criteria

- [ ] Type keyword + Enter → tag appears, input clears
- [ ] Click X on tag → tag removed
- [ ] Match count updates after 500ms debounce
- [ ] Keywords persist across project reload
- [ ] "Scan & Generate" includes search files in output
- [ ] Search files appear at the **bottom** of the generated `.txt`
- [ ] Tags disabled when no project loaded or generation in progress
- [ ] Empty keywords → no tag section, no count badge
- [ ] Sidebar scrollable with both TreeView and SearchContextPanel visible
- [ ] No TypeScript compile errors
- [ ] No React key warnings

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Sidebar height overflow (TreeView + SearchPanel don't fit) | Medium | Medium | Both sections share flex layout; SearchPanel has fixed height (~120px max). TreeView takes remaining space via `flex-1 overflow-auto` |
| Debounce timing causes stale count on rapid add/remove | Low | Low | 500ms is fine; match count is informational, not critical |
| searchEngine.ts `import()` in IPC handler fails | Low | High | Import path is static; verified in Phase 1 tests |
