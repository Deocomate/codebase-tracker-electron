---
phase: 3
title: "Build IPC Bridge"
status: pending
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 3: Build IPC Bridge

## Overview

Expose search keyword management and search status to the renderer via IPC handlers and preload API. The renderer needs: add/remove keywords, get match count, and keyword persistence via settings.

## Requirements

- Functional:
  - Add keyword → persist to settings, return updated keyword list
  - Remove keyword → persist, return updated list
  - Get match count → return `{ count: number }`
  - Get current keywords → return `string[]`
- Non-functional:
  - All handlers must handle "no project loaded" gracefully (return error)
  - Preload API follows existing pattern (snake_case, `ipcRenderer.invoke`)

## Architecture

```
Renderer                    Preload (contextBridge)       Main (ipcMain.handle)
  │                              │                              │
  ├─ addSearchKeyword(kw) ──────►│── 'search:addKeyword' ──────►│
  │                              │                              ├─ IgnoreRules.updateSearchKeywords()
  │◄───── { keywords } ─────────│◄─────────────────────────────│
  │                              │                              │
  ├─ removeSearchKeyword(kw) ───►│── 'search:removeKeyword' ───►│
  │                              │                              ├─ IgnoreRules.updateSearchKeywords()
  │◄───── { keywords } ─────────│◄─────────────────────────────│
  │                              │                              │
  ├─ getSearchMatchCount() ─────►│── 'search:getMatchCount' ───►│
  │                              │                              ├─ SearchEngine.search() → count
  │◄───── { count } ────────────│◄─────────────────────────────│
```

## Related Code Files

- **Modify:** `src/main/ipcHandlers.ts`
- **Modify:** `src/preload/index.ts`
- **Modify:** `src/preload/index.d.ts`

## Implementation Steps

### 3.1 Add IPC handlers in ipcHandlers.ts

Add after existing settings handlers (around line 183):

```typescript
// ---- Search Context Management ----

ipcMain.handle('search:addKeyword', async (event, keyword: string) => {
  const state = getWindowState(event)
  if (!state.rules) return { error: 'Project chưa được load' }

  const current = state.rules.getSearchKeywords()
  const trimmed = keyword.trim()
  if (!trimmed) return { keywords: current }

  const updated = [...current, trimmed]
  await state.rules.updateSearchKeywords(updated, true)
  return { keywords: state.rules.getSearchKeywords() }
})

ipcMain.handle('search:removeKeyword', async (event, keyword: string) => {
  const state = getWindowState(event)
  if (!state.rules) return { error: 'Project chưa được load' }

  const current = state.rules.getSearchKeywords()
  const updated = current.filter(k => k !== keyword)
  await state.rules.updateSearchKeywords(updated, true)
  return { keywords: state.rules.getSearchKeywords() }
})

ipcMain.handle('search:getMatchCount', async (event, keywords: string[]) => {
  const state = getWindowState(event)
  if (!state.rules) return { count: 0 }

  if (!keywords.length) return { count: 0 }

  const { SearchEngine } = await import('./core/searchEngine')
  const engine = new SearchEngine(state.rules.projectPath, state.rules)
  const results = await engine.search(keywords, { quickOnly: true })
  return { count: results.length }
})

ipcMain.handle('search:getKeywords', async (event) => {
  const state = getWindowState(event)
  if (!state.rules) return { keywords: [] }
  return { keywords: state.rules.getSearchKeywords() }
})
```

### 3.2 Extend generate:start to accept searchKeywords

Update existing handler signature:

```typescript
ipcMain.handle('generate:start', async (event, args: {
  selectedFormats: string[]
  splitEnabled: boolean
  splitCount: number
  searchKeywords?: string[]
}) => {
  // ... pass args.searchKeywords to processor.run()
})
```

### 3.3 Add preload API methods

In `src/preload/index.ts`, add to `IpcApi` interface:

```typescript
// Search Context
add_search_keyword: (keyword: string) => Promise<any>
remove_search_keyword: (keyword: string) => Promise<any>
get_search_match_count: (keywords: string[]) => Promise<any>
get_search_keywords: () => Promise<any>
```

Add implementations:

```typescript
// ---- Search Context ----
add_search_keyword: (keyword) => ipcRenderer.invoke('search:addKeyword', keyword),
remove_search_keyword: (keyword) => ipcRenderer.invoke('search:removeKeyword', keyword),
get_search_match_count: (keywords) => ipcRenderer.invoke('search:getMatchCount', keywords),
get_search_keywords: () => ipcRenderer.invoke('search:getKeywords'),
```

Update `start_generation` to accept optional 4th param:

```typescript
start_generation: (selectedFormats, splitEnabled, splitCount, searchKeywords?) =>
  ipcRenderer.invoke('generate:start', { selectedFormats, splitEnabled, splitCount, searchKeywords }),
```

### 3.4 Update type declaration

`src/preload/index.d.ts` auto-picks up from `IpcApi` — no separate changes needed since `Window.api` is typed from `IpcApi`.

## Success Criteria

- [ ] `add_search_keyword('auth')` → returns `{ keywords: ['auth'] }`
- [ ] `add_search_keyword('auth')` again → deduplicated (no duplicate)
- [ ] `remove_search_keyword('auth')` → returns `{ keywords: [] }`
- [ ] `get_search_match_count(['package.json'])` → returns `{ count: 1 }` (assuming project has package.json)
- [ ] `get_search_match_count([])` → returns `{ count: 0 }`
- [ ] Calling handlers without loaded project → graceful error (no crash)
- [ ] No TypeScript compile errors
