---
phase: 2
title: "Worker Protocol and IPC Handlers"
status: completed
priority: P1
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Worker Protocol and IPC Handlers

## Overview

Replace search-related actions in protocol, worker, IPC handlers, and preload with Attention actions. Wire up the full IPC pipeline: Renderer → Preload → Main → Worker → Core.

## Requirements

- Functional:
  - Worker protocol: remove `SEARCH_*` actions, add `ATTENTION_PREVIEW`, `READ_PROMPT_FILE`, `RESET_PROMPT_FILE`, `SAVE_ATTENTION_PATTERNS`
  - Worker handlers: implement new attention handlers, remove search handlers
  - IPC handlers: replace `search:*` channels with `attention:*` channels
  - Preload API: replace search methods with attention methods
  - `generate:start` now accepts `attentionPatterns` instead of `searchKeywords`
- Non-functional:
  - All handlers handle "no project loaded" gracefully
  - Preload API follows existing snake_case convention

## Architecture

```
Renderer                   Preload                       Main                        Worker
  │                         │                             │                           │
  ├─ previewAttention() ───►│── 'attention:preview' ────►│── ATTENTION_PREVIEW ─────►│
  │                         │                             │                           ├─ ignore().add(patterns)
  │◄─── { files } ─────────│◄───────────────────────────│◄──────────────────────────│   .ignores(relPath) check
  │                         │                             │                           │
  ├─ getPromptInstruction()►│── 'prompt:getInstruction'─►│── READ_PROMPT_FILE ──────►│
  │◄─── { content } ───────│◄───────────────────────────│◄──────────────────────────│
  │                         │                             │                           │
  ├─ resetPromptInstruction►│── 'prompt:resetInstruction'►│── RESET_PROMPT_FILE ────►│
  │◄─── { content } ───────│◄───────────────────────────│◄──────────────────────────│
  │                         │                             │                           │
  ├─ saveAttentionPatterns─►│── 'attention:savePatterns'─►│── SAVE_ATTENTION_PATTERNS►│
  │◄─── { } ───────────────│◄───────────────────────────│◄──────────────────────────│
```

## Related Code Files

- **Modify:** `src/main/worker/protocol.ts`
- **Modify:** `src/main/worker/index.ts`
- **Modify:** `src/main/ipcHandlers.ts`
- **Modify:** `src/preload/index.ts`

## Implementation Steps

### 2.1 Update worker protocol (protocol.ts)

**Remove** these from `WorkerAction` type:
```
| 'SEARCH_PREVIEW'
| 'CANCEL_SEARCH_PREVIEW'
| 'SEARCH_STATS'
| 'SEARCH_ADD_KEYWORD'
| 'SEARCH_REMOVE_KEYWORD'
| 'SEARCH_GET_KEYWORDS'
| 'SEARCH_GET_MATCH_COUNT'
```

**Add** these:
```typescript
| 'ATTENTION_PREVIEW'
| 'READ_PROMPT_FILE'
| 'RESET_PROMPT_FILE'
| 'SAVE_ATTENTION_PATTERNS'
```

### 2.2 Update worker/index.ts

**Remove all search-related state and handlers:**
- Remove `searchEngine` variable
- Remove `searchPreviewRequestId`, `searchStatsRequestId`
- Remove `resetSearchEngine()`, `getSearchEngine()` functions
- Remove imports of `SearchEngine`
- Remove handlers: `handleSearchPreview`, `handleCancelSearchPreview`, `handleSearchStats`, `handleSearchAddKeyword`, `handleSearchRemoveKeyword`, `handleSearchGetKeywords`, `handleSearchGetMatchCount`
- Remove switch cases for all `SEARCH_*` actions

**Add new handlers:**

```typescript
async function handleAttentionPreview(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules || !projectPath) return sendSuccess(id, { files: [] })

  const patterns = Array.isArray(payload.patterns)
    ? (payload.patterns as string[]).filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : []

  if (patterns.length === 0) return sendSuccess(id, { files: [] })

  const attnIg = (await import('ignore')).default().add(patterns)
  const results: Array<{ absPath: string; relPath: string; tokens?: number }> = []

  const walk = async (relDir: string): Promise<void> => {
    const absDir = relDir ? path.join(projectPath!, relDir) : projectPath!
    let entries
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === '_codebase') continue
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
      if (rules!.isGloballyIgnoredByRelPath(relPath, entry.isDirectory())) continue
      if (entry.isDirectory()) {
        await walk(relPath)
        continue
      }
      const checkPath = relPath.replace(/\\/g, '/')
      if (attnIg.ignores(checkPath)) {
        try {
          const stat = await fs.stat(path.join(projectPath!, relPath))
          results.push({ absPath: path.join(projectPath!, relPath), relPath, tokens: Math.ceil(stat.size / 4) })
        } catch {
          results.push({ absPath: path.join(projectPath!, relPath), relPath })
        }
      }
    }
  }

  await walk('')
  sendSuccess(id, { files: results })
}

async function handleReadPromptFile(id: string): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  const content = await rules.readPromptFile()
  sendSuccess(id, { content })
}

async function handleResetPromptFile(id: string): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  await rules.resetPromptFile()
  const content = await rules.readPromptFile()
  sendSuccess(id, { content })
}

async function handleSaveAttentionPatterns(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  const patterns = Array.isArray(payload.patterns)
    ? (payload.patterns as string[]).filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : []
  await rules.updateAttentionPatterns(patterns, true)
  sendSuccess(id, { patterns: rules.getAttentionPatterns() })
}
```

**Add switch cases in dispatch():**
```typescript
case 'ATTENTION_PREVIEW':
  return handleAttentionPreview(id, p)
case 'READ_PROMPT_FILE':
  return handleReadPromptFile(id)
case 'RESET_PROMPT_FILE':
  return handleResetPromptFile(id)
case 'SAVE_ATTENTION_PATTERNS':
  return handleSaveAttentionPatterns(id, p)
```

**Update handleGenerate** to use `attentionPatterns`:
```typescript
// Change parameter name from searchKeywords to attentionPatterns
const attentionPatterns = payload.attentionPatterns as string[] | undefined

const { success, message, stats } = await processor.run(
  sendProgressCb,
  sendProgressCb,
  cancelRef,
  selectedFormats,
  actualSplitCount,
  attentionPatterns  // was: searchKeywords
)
```

**Update INIT handler** to return attention patterns instead of cached_search_stats:
```typescript
// In handleInit, replace:
// cached_search_stats → attention_patterns
sendSuccess(id, {
  tree: rootNode,
  attention_patterns: rules.getAttentionPatterns(),
  project_path: fsPath
})
```

### 2.3 Update ipcHandlers.ts

**Remove all search handlers:**
- `search:addKeyword`
- `search:removeKeyword`
- `search:getMatchCount`
- `search:preview`
- `search:cancelPreview`
- `search:getStats`
- `search:getKeywords`

**Add new handlers:**

```typescript
// ---- Attention Context ----

ipcMain.handle('attention:preview', async (event, patterns: string[]) => {
  const state = getWindowState(event)
  try {
    const result = await workerSend(state, 'ATTENTION_PREVIEW', { patterns }) as Record<string, unknown>
    return result
  } catch (err: unknown) {
    return { files: [], error: getErrorMessage(err) }
  }
})

ipcMain.handle('prompt:getInstruction', async (event) => {
  const state = getWindowState(event)
  try {
    const result = await workerSend(state, 'READ_PROMPT_FILE') as Record<string, unknown>
    return result
  } catch (err: unknown) {
    return { content: '', error: getErrorMessage(err) }
  }
})

ipcMain.handle('prompt:resetInstruction', async (event) => {
  const state = getWindowState(event)
  try {
    const result = await workerSend(state, 'RESET_PROMPT_FILE') as Record<string, unknown>
    return result
  } catch (err: unknown) {
    return { content: '', error: getErrorMessage(err) }
  }
})

ipcMain.handle('attention:savePatterns', async (event, patterns: string[]) => {
  const state = getWindowState(event)
  try {
    const result = await workerSend(state, 'SAVE_ATTENTION_PATTERNS', { patterns }) as Record<string, unknown>
    return result
  } catch (err: unknown) {
    return { patterns: [], error: getErrorMessage(err) }
  }
})
```

**Update `project:load` handler** to use `attention_patterns` instead of `cached_search_stats`:
```typescript
return {
  status: 'success',
  project_path: actualFsPath,
  tree: (result as any)?.tree,
  attention_patterns: (result as any)?.attention_patterns || []
}
```

**Update `generate:start` handler** to use `attentionPatterns`:
```typescript
// Change parameter name
ipcMain.handle('generate:start', async (event, args: {
  selectedFormats: string[]
  splitEnabled: boolean
  splitCount: number
  attentionPatterns?: string[]
}) => {
  // ... in runGeneration():
  attentionPatterns: args.attentionPatterns
})
```

### 2.4 Update preload/index.ts

**Remove from `IpcApi` interface:**
- `add_search_keyword` through `get_search_keywords` (all search methods)
- `SearchKeywordsResponse`, `SearchMatchCountResponse`, `SearchStatsResponse`, `SearchStatsOptions` types

**Add to `IpcApi` interface:**

```typescript
// Attention Context
preview_attention: (patterns: string[]) => Promise<AttentionPreviewResponse>
get_prompt_instruction: () => Promise<PromptInstructionResponse>
reset_prompt_instruction: () => Promise<PromptInstructionResponse>
save_attention_patterns: (patterns: string[]) => Promise<SaveAttentionPatternsResponse>
```

**Add response types:**

```typescript
export interface AttentionFileEntry {
  absPath: string
  relPath: string
  tokens?: number
}

export interface AttentionPreviewResponse {
  files: AttentionFileEntry[]
  error?: string
}

export interface PromptInstructionResponse {
  content: string
  error?: string
}

export interface SaveAttentionPatternsResponse {
  patterns: string[]
  error?: string
}
```

**Update `SearchFileEntry`** — keep it for ignore preview (backward compat), or rename to `PreviewFileEntry`.

**Add API implementations:**

```typescript
// ---- Attention Context ----
preview_attention: (patterns) => ipcRenderer.invoke('attention:preview', patterns),
get_prompt_instruction: () => ipcRenderer.invoke('prompt:getInstruction'),
reset_prompt_instruction: () => ipcRenderer.invoke('prompt:resetInstruction'),
save_attention_patterns: (patterns) => ipcRenderer.invoke('attention:savePatterns', patterns),
```

**Update `start_generation`:**
```typescript
start_generation: (selectedFormats, splitEnabled, splitCount, attentionPatterns?) =>
  ipcRenderer.invoke('generate:start', { selectedFormats, splitEnabled, splitCount, attentionPatterns }),
```

## Success Criteria

- [ ] `preview_attention(['src/**'])` returns files under `src/` directory
- [ ] `preview_attention([])` returns `{ files: [] }`
- [ ] `get_prompt_instruction()` returns default prompt content
- [ ] `reset_prompt_instruction()` restores default content
- [ ] `save_attention_patterns(['*.ts', 'src/'])` persists and returns patterns
- [ ] `generate:start` with `attentionPatterns` passes through to worker
- [ ] All old search IPC channels removed (no `search:*` handlers left)
- [ ] No remaining imports of `SearchEngine` in worker
- [ ] No TypeScript compile errors
