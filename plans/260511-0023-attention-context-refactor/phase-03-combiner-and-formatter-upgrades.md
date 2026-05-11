---
phase: 3
title: "Combiner and Formatter Upgrades"
status: completed
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Combiner and Formatter Upgrades

## Overview

Upgrade `processor.ts` to split scanned files into secondary and attention groups using glob patterns. Update `combiner.ts` and all formatters to order secondary files first, attention files last, with a clear marker between them. Remove all search-related logic from the pipeline.

## Requirements

- Functional:
  - Processor accepts `attentionPatterns: string[]` instead of `searchKeywords`
  - When patterns provided: split `categorizedFiles.codebase` into `secondaryFiles` + `attentionFiles` using `ignore` package
  - Order: `[...secondaryFiles, ...attentionFiles]` — attention files always at bottom
  - Combiner passes `isAttention` flag to formatters
  - Formatters insert marker between secondary and attention sections
  - When no patterns: all files treated as secondary, no marker inserted
- Non-functional:
  - No breaking changes to formatter abstract interface (add optional `isAttention` to file object)
  - Reuses `ignore` package — zero new dependencies

## Architecture

```
Processor.run(attentionPatterns?)
  │
  ├── 1. FileScanner.scan() → categorizedFiles (as before)
  │
  ├── 2. IF attentionPatterns present:
  │      attnIg = ignore().add(attentionPatterns)
  │      secondaryFiles = files where !attnIg.ignores(relPath)
  │      attentionFiles = files where attnIg.ignores(relPath)
  │      Mark attentionFiles with isAttention: true
  │      Final: [...secondaryFiles, ...attentionFiles]
  │
  └── 3. FileCombiner.combine(finalFiles, ...)
         └── Formatters detect isAttention transitions
             → Insert marker between sections
```

## Related Code Files

- **Modify:** `src/main/core/processor.ts`
- **Modify:** `src/main/core/combiner.ts`
- **Modify:** `src/main/core/scanner.ts` (FileEntry interface)
- **Modify:** `src/main/core/formatters/txtFormatter.ts`
- **Modify:** `src/main/core/formatters/jsonFormatter.ts`
- **Modify:** `src/main/core/formatters/markdownFormatter.ts`
- **Modify:** `src/main/core/formatters/xmlFormatter.ts`

## Implementation Steps

### 3.1 Update FileEntry interfaces for consistency

In `scanner.ts`, `combiner.ts`, and `processor.ts`, ensure `FileEntry` has `isAttention`:

```typescript
interface FileEntry {
  absPath: string
  relPath: string
  source?: 'global' | 'search'  // keep for backward compat, will remove later
  isAttention?: boolean          // NEW
}
```

Remove the `source` field entirely if no legacy code depends on it (it was only used in txtFormatter for `[SEARCH MATCH]` tag).

**Decision:** Remove `source` entirely since search is being eliminated. Replace with `isAttention`.

### 3.2 Update processor.ts

**Replace `SearchEngine` import** with `ignore`:

```typescript
import ignore from 'ignore'
```

**Update `run()` signature** — replace `searchKeywords` with `attentionPatterns`:

```typescript
async run(
  scanCallback: ProgressCallback,
  combineCallback: ProgressCallback,
  cancelRef: { cancelled: boolean },
  exportFormats?: string[],
  splitCount?: number | null,
  attentionPatterns?: string[]
): Promise<ProcessorResult>
```

**Replace search logic** with attention split logic:

```typescript
const effectivePatterns = (attentionPatterns ?? [])
  .filter((p): p is string => typeof p === 'string')
  .map((p) => p.trim())
  .filter(Boolean)

if (effectivePatterns.length > 0) {
  scanCallback('Applying attention patterns...', -1)

  const attnIg = ignore().add(effectivePatterns)
  const secondaryFiles: FileEntry[] = []
  const attentionFiles: FileEntry[] = []

  for (const file of categorizedFiles.codebase) {
    const normPath = file.relPath.replace(/\\/g, '/')
    if (attnIg.ignores(normPath)) {
      attentionFiles.push({ ...file, isAttention: true })
    } else {
      secondaryFiles.push(file)
    }
  }

  categorizedFiles.codebase = [...secondaryFiles, ...attentionFiles]
  scanCallback(
    `Attention split: ${secondaryFiles.length} secondary + ${attentionFiles.length} attention files.`,
    0.45
  )
}
```

### 3.3 Update combiner.ts

**Remove search-related imports/comments** — no functional changes needed in `combine()` itself since the ordering is now handled by `processor.ts`. The combiner just processes files in the order they arrive.

**Remove the local `FileEntry` interface's `source` field**, add `isAttention`:

```typescript
interface FileEntry {
  absPath: string
  relPath: string
  isAttention?: boolean
}
```

### 3.4 Update all formatters

The handling of attention files depends on the format:
- **txtFormatter & markdownFormatter:** Insert a text marker between secondary and attention sections.
- **jsonFormatter:** Do NOT insert a marker. Map `isAttention` flag directly to the output JSON object (`is_attention: true`).
- **xmlFormatter:** Do NOT insert a marker. Add an attribute to the XML tag (`is_attention="true"`).

**Pattern for text-based formatters (txt, markdown):**

```typescript
let lastWasAttention = false
for (const file of files) {
  if (file.isAttention && !lastWasAttention) {
    // Insert attention marker
    fileHandle.write(ATTENTION_MARKER)
    lastWasAttention = true
  }
  // Write file content as usual
}
```

**Marker constant (shared for text/md):**

```typescript
// Add to a shared location or define in each formatter
const ATTENTION_MARKER = `\n${'='.repeat(64)}\nCRITICAL ATTENTION CONTEXT (BELOW)\n${'='.repeat(64)}\n\n`
```

#### 3.4.1 txtFormatter.ts

Current code tags files with `source === 'search'` for `[SEARCH MATCH]`. Replace with attention marker approach:

```typescript
async writeOutput(
  fileHandle: { write: (s: string) => boolean },
  configName: string,
  timestamp: string,
  files: { absPath: string; relPath: string; isAttention?: boolean }[]
): Promise<number> {
  let chars = 0
  const header = `# ${configName} | ${files.length} files | ${timestamp}\n\n`
  fileHandle.write(header)
  chars += header.length

  let attentionMarkerInserted = false

  for (const { absPath, relPath, isAttention } of files) {
    if (isAttention && !attentionMarkerInserted) {
      fileHandle.write(ATTENTION_MARKER)
      chars += ATTENTION_MARKER.length
      attentionMarkerInserted = true
    }

    const content = await this._readFileContent(absPath, relPath)
    const prefix = isAttention ? '// [ATTENTION] ' : '// '
    const chunk = `${prefix}${relPath}\n${content}\n\n`
    fileHandle.write(chunk)
    chars += chunk.length
  }
  return chars
}
```

#### 3.4.2 jsonFormatter.ts

Do NOT insert any marker object. Map the `isAttention` flag to the output JSON object:

```json
{
  "path": "src/auth/login.ts",
  "language": "typescript",
  "is_attention": true,
  "content": "..."
}
```

#### 3.4.3 markdownFormatter.ts

Insert markdown heading between sections using the text pattern above:
```markdown
---
## CRITICAL ATTENTION CONTEXT
---
```

#### 3.4.4 xmlFormatter.ts

Do NOT insert any comment marker. Add the `is_attention` attribute to the `<file>` element:

```xml
<file path="src/auth/login.ts" language="typescript" is_attention="true"><![CDATA[...]]></file>
```

### 3.5 Update scanner.ts

Remove `source: 'global'` tag from pushed files:

```typescript
// Before:
categorizedFiles.codebase.push({ absPath, relPath, source: 'global' })

// After:
categorizedFiles.codebase.push({ absPath, relPath })
```

### 3.6 Remove SearchEngine import from processor.ts

Delete the existing import and all search-related logic (lines ~48-61 in current processor.ts).

## Success Criteria

- [ ] `attentionPatterns = []` → all files as secondary, behavior identical to current
- [ ] `attentionPatterns = ['src/auth/**']` → auth files go to bottom with `isAttention: true`
- [ ] Attention files never duplicate (each file appears exactly once)
- [ ] TXT output: secondary files first, then marker, then attention files with `[ATTENTION]` prefix
- [ ] MD output: marker inserted at transition point
- [ ] JSON output: files have `is_attention: true` flag, no marker string
- [ ] XML output: tags have `is_attention="true"` attribute, no marker comment
- [ ] No `source` field usage remains in scanner, combiner, or formatters
- [ ] No imports of `SearchEngine` remain
- [ ] No TypeScript compile errors
