---
phase: 2
title: "Upgrade Combiner and Scanner"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Upgrade Combiner and Scanner

## Overview

Integrate SearchEngine into the generation pipeline. Modify `ProjectProcessor.run()` to accept search keywords, run search, deduplicate, and reorder files so search matches appear at the bottom of the output.

## Requirements

- Functional:
  - Processor accepts optional `searchKeywords: string[]`
  - Search files deduplicated from global files: `final = (globalFiles - searchFiles) + searchFiles`
  - File order preserved (global-first, search-last)
- Non-functional:
  - Maintain backward compatibility — `searchKeywords` param is optional
  - Existing scan logic unchanged

## Architecture

```
Processor.run(searchKeywords?)
  │
  ├── 1. FileScanner.scan() → globalFiles (as before)
  │
  ├── 2. IF searchKeywords present:
  │      SearchEngine.search(searchKeywords) → searchFiles
  │      Dedup: globalOnly = globalFiles \ searchFiles
  │      Final: [...globalOnly, ...searchFiles]
  │
  └── 3. FileCombiner.combine(finalFiles, ...)
```

## Related Code Files

- **Modify:** `src/main/core/processor.ts`
- **Modify:** `src/main/core/scanner.ts` — add `source` field support
- **No changes:** `combiner.ts`, all formatters, fileSplitter

## Implementation Steps

### 2.1 Update FileEntry interfaces for consistency

Scanner and Combiner both define local `FileEntry` interfaces. Add optional `source` field to both:

```typescript
// In scanner.ts and combiner.ts:
interface FileEntry {
  absPath: string
  relPath: string
  source?: 'global' | 'search'
}
```

### 2.2 Modify ProjectProcessor.run()

Add `searchKeywords?: string[]` parameter. After scan, if searchKeywords provided:

```typescript
// In processor.ts, after line 33 (scanner.scan()):

let finalFiles = categorizedFiles.codebase

if (searchKeywords && searchKeywords.length > 0) {
  scanCallback('Searching for keyword matches...', -1)

  const searchEngine = new SearchEngine(this.projectPath, this.ignoreRules)
  const searchFiles = await searchEngine.search(searchKeywords)

  // Dedup
  const searchAbsPaths = new Set(searchFiles.map(f => f.absPath))
  const globalOnly = finalFiles.filter(f => !searchAbsPaths.has(f.absPath))

  // Order: global (deduped) first, search matches last
  finalFiles = [...globalOnly, ...searchFiles]

  scanCallback(
    `Search complete! ${searchFiles.length} keyword matches found.`,
    0.45
  )
}

categorizedFiles.codebase = finalFiles
```

**Full updated processor.ts `run()` signature:**

```typescript
async run(
  scanCallback: ProgressCallback,
  combineCallback: ProgressCallback,
  cancelRef: { cancelled: boolean },
  exportFormats?: string[],
  splitCount?: number | null,
  searchKeywords?: string[]
): Promise<ProcessorResult>
```

### 2.3 Update TxtFormatter to tag search files (low priority, nice-to-have)

In `txtFormatter.ts`, check `source` field:

```typescript
// Line 35, instead of:
const chunk = `// ${relPath}\n${content}\n\n`

// Use:
const prefix = source === 'search' ? '// [SEARCH MATCH] ' : '// '
const chunk = `${prefix}${relPath}\n${content}\n\n`
```

This helps LLMs identify which files are search-focused. Skip if it complicates the interface too much.

### 2.4 Update ipcHandlers to pass keywords

In `ipcHandlers.ts` `generate:start` handler, accept `searchKeywords`:

```typescript
ipcMain.handle('generate:start', async (event, args: {
  selectedFormats: string[]
  splitEnabled: boolean
  splitCount: number
  searchKeywords?: string[]
}) => {
  // ... existing setup ...

  const { success, message, stats } = await processor.run(
    sendProgress,
    sendProgress,
    cancelRef,
    args.selectedFormats,
    actualSplitCount,
    args.searchKeywords  // NEW
  )
  // ...
})
```

## Success Criteria

- [ ] Search keywords = `[]` → behavior identical to current (no search files)
- [ ] Search keyword matches a file also in TreeView → file appears only once (in search section at bottom)
- [ ] Search matches unique files → appear only in search section at bottom
- [ ] Generated `.txt` output: global files first, search files last
- [ ] No regression: existing workflow works without search keywords
- [ ] No TypeScript compile errors
