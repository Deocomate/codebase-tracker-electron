---
phase: 1
title: "Data Schema and Prompt Manager"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Data Schema and Prompt Manager

## Overview

Update `ignoreRules.ts` Settings schema: remove search fields, add `attention_patterns`. Delete `searchEngine.ts`. Create prompt file manager that auto-generates `prompt_get_list_files_and_folders_related.md` in `_codebase/`.

## Requirements

- Functional:
  - Remove `search_keywords`, `search_cache` from `Settings` interface
  - Add `attention_patterns: string[]` to Settings + DEFAULT_SETTINGS
  - Remove `getSearchKeywords()`, `updateSearchKeywords()`, `getSearchCache()`, `updateSearchCache()` methods
  - Add `getAttentionPatterns()`, `updateAttentionPatterns()` methods
  - Bump `schema_version` to 9 for migration
  - Create `PROMPT_FILENAME` constant and `ensurePromptFileExists()` + `resetPromptFile()` + `readPromptFile()` methods
  - Delete `src/main/core/searchEngine.ts`
- Non-functional:
  - Settings migration preserves all existing data, just drops old search fields
  - Prompt file uses UTF-8, is human-editable

## Architecture

```
IgnoreRules
├── Settings.schema_version → 9 (was 8)
├── Settings.search_keywords → REMOVED
├── Settings.search_cache → REMOVED
├── Settings.attention_patterns → NEW: string[]
├── getAttentionPatterns() → string[]
├── updateAttentionPatterns(patterns, persist?) → void
├── ensurePromptFileExists() → void   (called during initialize())
├── resetPromptFile() → void          (overwrites with default)
└── readPromptFile() → string         (reads current content)
```

**Prompt file location:** `{projectPath}/_codebase/prompt_get_list_files_and_folders_related.md`

## Related Code Files

- **Modify:** `src/main/core/ignoreRules.ts`
- **Delete:** `src/main/core/searchEngine.ts`

## Implementation Steps

### 1.1 Remove search fields from Settings interface

```typescript
// REMOVE these lines from Settings interface:
search_keywords: string[]
search_cache: Record<string, string[]>

// ADD this line:
attention_patterns: string[]
```

### 1.2 Update DEFAULT_SETTINGS

```typescript
const DEFAULT_SETTINGS: Settings = {
  schema_version: 9,  // bumped from 8
  // ... existing fields unchanged ...
  // REMOVE: search_keywords: [],
  // REMOVE: search_cache: {},
  attention_patterns: [],  // NEW
  // ... rest unchanged ...
}
```

### 1.3 Add schema migration (v8 → v9)

In `_ensureSchema()`, add after existing v8 migration:

```typescript
if ((this.settings.schema_version ?? 8) < 9) {
  this.settings.schema_version = 9
  // Drop old search fields
  delete mutableSettings.search_keywords
  delete mutableSettings.search_cache
  // Add new field
  this.settings.attention_patterns = []
}
```

Also update the `Array.isArray(this.settings.search_keywords)` guard — **remove it** since `search_keywords` no longer exists.

### 1.4 Remove search methods, add attention methods

**Remove:**
- `getSearchKeywords()`
- `getSearchCache()`
- `updateSearchCache()`
- `updateSearchKeywords()`

**Add:**

```typescript
getAttentionPatterns(): string[] {
  if (!Array.isArray(this.settings.attention_patterns)) return []
  return [...this.settings.attention_patterns]
}

async updateAttentionPatterns(patterns: string[], persist = true): Promise<void> {
  this.settings.attention_patterns = patterns
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter(Boolean)
  if (persist) await this._saveSettings()
}
```

### 1.5 Add prompt file manager methods

Define the default prompt content constant:

```typescript
const PROMPT_FILENAME = 'prompt_get_list_files_and_folders_related.md'

const DEFAULT_PROMPT_CONTENT = \`Dựa vào codebase và codebase structure tôi đã cung cấp ở trên cho bạn

Tôi cần bạn phân tích dự án này để giúp tôi giải quyết vấn đề sau:[ĐIỀN VẤN ĐỀ / TÍNH NĂNG BẠN MUỐN LÀM VÀO ĐÂY]

NHIỆM VỤ CỦA BẠN:
1. Phân tích cấu trúc thư mục và xác định TẤT CẢ các file/folder trọng tâm, cần thiết để bạn hiểu và code được yêu cầu trên.
2. Trả về kết quả CHỈ DƯỚI DẠNG pattern giống .gitignore (mỗi file/folder một dòng). Không giải thích, không định dạng Markdown, không nói thêm bất cứ điều gì.

Ví dụ định dạng đầu ra:
src/main/core/searchEngine.ts
src/renderer/src/SearchSidebar.tsx
src/types/**/*.ts

Không cần trả lời thêm bất cứ gì, chỉ cần liệt kê các file liên quan đến cấu trúc dự án và vấn đề tôi đang cần giải quyết.\`
```

Add methods:

```typescript
private getPromptFilePath(): string {
  return path.join(this.codebaseDir, PROMPT_FILENAME)
}

async ensurePromptFileExists(): Promise<void> {
  const filePath = this.getPromptFilePath()
  try {
    await fs.access(filePath)
  } catch {
    await fs.writeFile(filePath, DEFAULT_PROMPT_CONTENT, 'utf-8')
  }
}

async resetPromptFile(): Promise<void> {
  const filePath = this.getPromptFilePath()
  await fs.writeFile(filePath, DEFAULT_PROMPT_CONTENT, 'utf-8')
}

async readPromptFile(): Promise<string> {
  const filePath = this.getPromptFilePath()
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return DEFAULT_PROMPT_CONTENT
  }
}
```

### 1.6 Call ensurePromptFileExists() during initialize()

In `initialize()` method, after `this._compileRules()`, add:

```typescript
await this.ensurePromptFileExists()
```

### 1.7 Delete searchEngine.ts

```bash
rm src/main/core/searchEngine.ts
```

## Success Criteria

- [ ] Settings `schema_version` is 9, `attention_patterns` exists, `search_keywords` removed
- [ ] Old settings.json with `search_keywords` migrated cleanly on load (fields dropped, `attention_patterns: []` added)
- [ ] `getAttentionPatterns()` returns persisted array after save + reload
- [ ] `updateAttentionPatterns(['src/auth/', '*.ts'])` persists and deduplicates
- [ ] `ensurePromptFileExists()` creates file on first load with default content
- [ ] `resetPromptFile()` overwrites with default content
- [ ] `readPromptFile()` returns current file content
- [ ] `searchEngine.ts` file deleted
- [ ] No remaining imports of `SearchEngine` anywhere
- [ ] No TypeScript compile errors
