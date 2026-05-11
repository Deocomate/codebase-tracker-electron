---
phase: 2
title: "Update Worker Protocol and IPC Bridge"
status: completed
priority: P1
effort: "1.5h"
dependencies: ["1"]
---

# Phase 2: Worker Protocol and IPC Bridge

## Overview

Wire the instructions config through the full IPC pipeline: Worker protocol actions, Worker handlers, Main process IPC handlers, Preload API, and TypeScript types. Also adds `file:openInstructionsFile` for the Edit button (Phase 4).

## Requirements

- Functional: Save/load instructions enabled state via IPC, open instructions.md in default editor
- Non-functional: Follow existing action/handler/preload patterns exactly

## Architecture

```
Renderer (App.tsx)
  → window.api.save_settings(formats, split, count, instructionsEnabled)
  → window.api.open_instructions_file()
       │
Preload (index.ts)
  → ipcRenderer.invoke('settings:save', { ..., instructionsEnabled })
  → ipcRenderer.invoke('file:openInstructionsFile')
       │
Main Process (ipcHandlers.ts)
  → workerSend(state, 'SAVE_SETTINGS', { ..., instructionsEnabled })
  → shell.openPath('_codebase/instructions.md')
       │
Worker (index.ts)
  → handleSaveSettings() → rules.updateInstructionsConfig()
  → handleGetSettings() → rules.getInstructionsConfig()
```

## Related Code Files

- **Modify:** `src/main/worker/protocol.ts`
- **Modify:** `src/main/worker/index.ts`
- **Modify:** `src/main/ipcHandlers.ts`
- **Modify:** `src/preload/index.ts`

## Implementation Steps

### 1. Worker: Update `handleGetSettings` to include instructions config

In `handleGetSettings`, add to the return data:

```typescript
sendSuccess(id, {
  ui_preferences: rules.getUiPreferences(),
  priority_roots: rules.getPriorityRoots(),
  instructions_config: rules.getInstructionsConfig()  // NEW
})
```

### 2. Worker: Update `handleSaveSettings` to accept instructionsEnabled

```typescript
async function handleSaveSettings(id: string, payload: Record<string, unknown>): Promise<void> {
  if (!rules) return sendError(id, 'Project chưa được load')
  const selectedFormats = payload.selectedFormats as string[]
  const splitEnabled = payload.splitEnabled as boolean
  const splitCount = payload.splitCount as number
  const instructionsEnabled = payload.instructionsEnabled as boolean | undefined  // NEW
  await rules.updateUiPreferences(selectedFormats, splitEnabled, splitCount, true)
  if (instructionsEnabled !== undefined) {  // NEW
    await rules.updateInstructionsConfig(instructionsEnabled, true)
  }
  sendSuccess(id, {})
}
```

### 3. IPC Main: Update `settings:save` handler

Update the args type and pass `instructionsEnabled` to worker:

```typescript
ipcMain.handle('settings:save', async (event, args: {
  selectedFormats: string[];
  splitEnabled: boolean;
  splitCount: number;
  instructionsEnabled?: boolean  // NEW
}) => {
  const state = getWindowState(event)
  try {
    await workerSend(state, 'SAVE_SETTINGS', {
      selectedFormats: args.selectedFormats,
      splitEnabled: args.splitEnabled,
      splitCount: args.splitCount,
      instructionsEnabled: args.instructionsEnabled  // NEW
    })
    return { status: 'success' }
  } catch (err: unknown) {
    return { error: getErrorMessage(err) }
  }
})
```

### 4. IPC Main: Add `file:openInstructionsFile` handler

Add after `file:openSettingsFile` handler:

```typescript
ipcMain.handle('file:openInstructionsFile', async (event) => {
  const state = getWindowState(event)
  if (!state.workerManager) return { error: 'Chưa load dự án' }

  const instructionsPath = path.join(state.workerManager.projectPath, '_codebase', 'instructions.md')
  try {
    await fs.access(instructionsPath)
    shell.openPath(instructionsPath)
    return { status: 'success' }
  } catch {
    return { error: 'File instructions.md chưa tồn tại' }
  }
})
```

### 5. Preload: Update `SettingsResponse` type

Add field:

```typescript
export interface SettingsResponse {
  // ... existing fields ...
  instructions_config?: {
    enabled: boolean
  }
}
```

### 6. Preload: Update `save_settings` signature

Add `instructionsEnabled?: boolean` parameter:

```typescript
save_settings: (selectedFormats: string[], splitEnabled: boolean, splitCount: number, instructionsEnabled?: boolean) =>
  ipcRenderer.invoke('settings:save', { selectedFormats, splitEnabled, splitCount, instructionsEnabled }),
```

### 7. Preload: Add `open_instructions_file` to API

Add to `IpcApi` interface and `api` object:

```typescript
// In IpcApi interface:
open_instructions_file: () => Promise<SimpleResponse>

// In api object:
open_instructions_file: () => ipcRenderer.invoke('file:openInstructionsFile'),
```

## Success Criteria

- [ ] `SAVE_SETTINGS` worker action persists `instructionsEnabled` to `settings.json`
- [ ] `GET_SETTINGS` returns `instructions_config: { enabled: boolean }`
- [ ] `file:openInstructionsFile` opens `_codebase/instructions.md` in default OS editor
- [ ] Preload API `save_settings()` accepts optional 4th parameter
- [ ] Preload API exposes `open_instructions_file()`
- [ ] TypeScript compilation passes with no errors

## Risk Assessment

- **Risk:** Optional `instructionsEnabled` breaking existing `save_settings` calls → **Mitigation:** Parameter is optional (`instructionsEnabled?: boolean`), existing calls without it are unaffected
- **Risk:** `shell.openPath` might fail on some Linux distros → **Mitigation:** Already used by `file:openSettingsFile`, same pattern
