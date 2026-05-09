---
phase: 1
title: "Build Search Engine"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Build Search Engine

## Overview

Create `src/main/core/searchEngine.ts` — async search over all valid project files (respecting `.gitignore` and global ignore patterns). Match keywords against file name, directory name, and file content (case-insensitive substring).

## Requirements

- Functional:
  - Accept `projectPath`, `ignoreRules`, `keywords[]`, `options?: { quickOnly?: boolean }` → return `FileEntry[]`
  - Search by file path/name first (fast), then by content (slower)
  - `quickOnly: true` → only path/name matching, skip content reading. Used for live match count (Phase 4)
  - Case-insensitive substring matching
  - Empty keywords → empty result (no-op)
- Non-functional:
  - Non-blocking (async, sequential by design — per file I/O can't be parallelized meaningfully for a single search)
  - Text files only (use `isTextFile` from fileUtils)
  - Honor `.gitignore` and `global_ignore_patterns` via IgnoreRules

## Architecture

```
SearchEngine.search(projectPath, ignoreRules, keywords)
  │
  ├── 1. Walk all valid files (reuse walk logic from FileScanner)
  │      Filter: NOT globally ignored, IS text file, NOT _codebase
  │
  ├── 2. For each keyword (OR logic — match any keyword):
  │      ├── Match file path (relPath) → fast, no I/O
  │      └── If no path match → readTextFile(file) → check content
  │
  └── 3. Return deduplicated FileEntry[]
```

## Related Code Files

- **Create:** `src/main/core/searchEngine.ts`
- **Modify:** `src/main/core/ignoreRules.ts` — add `search_keywords` to Settings interface + defaults

## Implementation Steps

### 1.1 Extend Settings interface in IgnoreRules

Add `search_keywords: string[]` to `Settings` interface and `DEFAULT_SETTINGS`:

```typescript
// In Settings interface:
search_keywords: string[]

// In DEFAULT_SETTINGS:
search_keywords: []
```

Bump `schema_version` to 5 to trigger `_ensureSchema` migration for existing projects.

### 1.2 Add search keyword get/set methods to IgnoreRules

Add methods to read/write `search_keywords` without recompiling rules:

```typescript
getSearchKeywords(): string[] {
  return [...this.settings.search_keywords]
}

async updateSearchKeywords(keywords: string[], persist = true): Promise<void> {
  this.settings.search_keywords = [...new Set(keywords.map(k => k.trim()).filter(k => k.length > 0))]
  if (persist) await this._saveSettings()
}
```

### 1.3 Create searchEngine.ts

```typescript
import fs from 'fs/promises'
import path from 'path'
import { IgnoreRules } from './ignoreRules'
import { isTextFile, readTextFile } from './fileUtils'

export interface FileEntry {
  absPath: string
  relPath: string
  source?: 'global' | 'search'  // Optional marker for combiner
}

export class SearchEngine {
  constructor(
    private projectPath: string,
    private ignoreRules: IgnoreRules
  ) {}

  async search(keywords: string[], options?: { quickOnly?: boolean }): Promise<FileEntry[]> {
    if (!keywords.length) return []

    const results: FileEntry[] = []
    const seen = new Set<string>()
    const lowerKeywords = keywords.map(k => k.toLowerCase())

    await this._walkDir('', lowerKeywords, results, seen, options?.quickOnly ?? false)
    return results
  }

  private async _walkDir(
    relDir: string,
    lowerKeywords: string[],
    results: FileEntry[],
    seen: Set<string>,
    quickOnly: boolean
  ): Promise<void> {
    const absDir = relDir ? path.join(this.projectPath, relDir) : this.projectPath
    let entries

    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch {
      return // Permission denied
    }

    for (const entry of entries) {
      const name = entry.name
      if (name === '_codebase') continue

      const absPath = path.join(absDir, name)
      const relPath = relDir ? `${relDir}/${name}` : name

      if (entry.isDirectory()) {
        if (this.ignoreRules.isGloballyIgnoredByRelPath(relPath, true)) continue
        await this._walkDir(relPath, lowerKeywords, results, seen, quickOnly)
      } else {
        if (this.ignoreRules.isGloballyIgnoredByRelPath(relPath, false)) continue
        if (!isTextFile(relPath)) continue
        if (seen.has(absPath)) continue

        // Check path match first (fast)
        const lowerPath = relPath.toLowerCase()
        const pathMatch = lowerKeywords.some(kw => lowerPath.includes(kw))

        if (pathMatch) {
          seen.add(absPath)
          results.push({ absPath, relPath, source: 'search' })
          continue
        }

        // Check content match (slow — read file). Skip in quickOnly mode.
        if (!quickOnly) {
          try {
            const content = await readTextFile(absPath)
            const lowerContent = content.toLowerCase()
            if (lowerKeywords.some(kw => lowerContent.includes(kw))) {
              seen.add(absPath)
              results.push({ absPath, relPath, source: 'search' })
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }
}
```

**Key design notes:**
- Content search is inherently slow — acceptable during "Scan & Generate" (user expects a wait)
- `quickOnly: true` skips content reading → ~10-100x faster. Used for live match count badge in Phase 4
- No caching in Phase 1 (KISS) — caching can be added later if needed
- Each keyword is OR logic (match any) — simpler mental model for users

### 1.4 Ensure schema migration

In `IgnoreRules._ensureSchema()`, handle schema v4 → v5:

```typescript
if (this.settings.schema_version < 5) {
  this.settings.schema_version = 5
  this.settings.search_keywords = []
}
```

## Success Criteria

- [ ] `searchEngine.search(projectPath, ignoreRules, [])` → `[]` (empty keywords = empty result)
- [ ] `searchEngine.search(projectPath, ignoreRules, ['package.json'])` → includes `package.json` (path match)
- [ ] `searchEngine.search(projectPath, ignoreRules, ['nonexistent_xyz_123'])` → `[]`
- [ ] `searchEngine.search(projectPath, ignoreRules, ['auth'], { quickOnly: true })` → only path matches, no content I/O
- [ ] Search skips `node_modules/`, `.git/`, `_codebase/` etc.
- [ ] `IgnoreRules.getSearchKeywords()` returns persisted keywords after reload
- [ ] No TypeScript compile errors
