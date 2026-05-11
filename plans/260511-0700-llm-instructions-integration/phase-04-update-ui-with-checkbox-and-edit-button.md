---
phase: 4
title: "Update UI with Checkbox and Edit Button"
status: completed
priority: P2
effort: "1h"
dependencies: ["2"]
---

# Phase 4: UI Checkbox and Edit Button

## Overview

Add a checkbox "Include LLM Instructions (instructions.md)" and an Edit button to the Workspace Settings area in `App.tsx`. The checkbox toggles the feature, the Edit button opens `instructions.md` in the default OS editor.

## Requirements

- Functional: Toggle instructions on/off, open instructions file for editing, state persists across app restarts
- Non-functional: Follow existing UI patterns (Card component, checkbox style, button style)

## Architecture

```
App.tsx
  ├── State: instructionsEnabled: boolean
  ├── loadProjectFromPath() → reads instructions_config from GET_SETTINGS
  ├── handleUpdateSettings() → passes instructionsEnabled to save_settings()
  └── Card "Export Formats" sibling card:
        ├── Checkbox "Include LLM Instructions (instructions.md)"
        └── Button "Edit" → calls open_instructions_file()
```

## Related Code Files

- **Modify:** `src/renderer/src/App.tsx`

## Implementation Steps

### 1. Add state variable

After other `useState` declarations:

```typescript
const [instructionsEnabled, setInstructionsEnabled] = useState(false)
```

### 2. Read instructions config on project load

In `loadProjectFromPath`, after the settings sync block (`const settingsRes = ...`):

```typescript
if (settingsRes.instructions_config) {
  setInstructionsEnabled(settingsRes.instructions_config.enabled)
}
```

### 3. Update `handleUpdateSettings` to accept and persist instructionsEnabled

```typescript
const handleUpdateSettings = async (
  newFormats: OutputFormats,
  newSplitEnabled: boolean,
  newSplitCount: number,
  newInstructionsEnabled?: boolean
) => {
  setFormats(newFormats)
  setSplitEnabled(newSplitEnabled)
  setSplitCount(newSplitCount)
  if (newInstructionsEnabled !== undefined) setInstructionsEnabled(newInstructionsEnabled)

  if (projectPath) {
    const selectedFormats = Object.keys(newFormats).filter((k) => newFormats[k as keyof OutputFormats])
    await window.api.save_settings(
      selectedFormats,
      newSplitEnabled,
      newSplitCount,
      newInstructionsEnabled
    )
  }
}
```

### 4. Add `handleEditInstructions` callback

```typescript
const handleEditInstructions = useCallback(async () => {
  await window.api.open_instructions_file()
}, [])
```

### 5. Add UI Card

Add a new `Card` next to "Export Formats" to the grid. The grid is already `grid-cols-1 2xl:grid-cols-2` with "Export Formats" and "Output Splitting" in it. Insert the instructions card between them or as a new row:

```tsx
<Card title="LLM Instructions">
  <div className="flex items-center gap-4 mt-1">
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        className="w-3.5 h-3.5 border-borderDark text-accent focus:ring-accent"
        checked={instructionsEnabled}
        onChange={(e) =>
          handleUpdateSettings(formats, splitEnabled, splitCount, e.target.checked)
        }
      />
      <span className="text-[13px] text-textMain">
        Include LLM Instructions (instructions.md)
      </span>
    </label>
    <button
      onClick={handleEditInstructions}
      disabled={!projectPath}
      className="text-[13px] text-accent hover:text-accentHover underline underline-offset-2 disabled:opacity-40 disabled:no-underline transition"
      title="Open instructions.md in default editor"
    >
      Edit
    </button>
  </div>
</Card>
```

Place this card inside the existing `<div className="grid grid-cols-1 2xl:grid-cols-2 gap-8">` alongside "Export Formats" and "Output Splitting".

## Success Criteria

- [ ] Checkbox toggles instructions inclusion in generated output
- [ ] Checkbox state loads correctly from `settings.json` on project load
- [ ] Checkbox state persists via `save_settings()` IPC
- [ ] "Edit" button opens `_codebase/instructions.md` in default OS editor
- [ ] "Edit" button disabled when no project loaded (guards against null projectPath)
- [ ] UI matches existing checkbox/button styling
- [ ] ESLint passes, no TypeScript errors

## Risk Assessment

- **Risk:** Grid layout might break with 3 cards in a 2-column grid → **Mitigation:** CSS grid auto-wraps; the 3rd card will span full width on narrower screens, which is acceptable
- **Risk:** User clicks Edit before first project load → **Mitigation:** Button is `disabled={!projectPath}`
