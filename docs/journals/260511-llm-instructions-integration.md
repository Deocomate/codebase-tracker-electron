# LLM Instructions Integration

**Date**: 2026-05-11 10:00
**Severity**: Low
**Component**: Combiner, Formatters, IgnoreRules, IPC, UI
**Status**: Resolved

## What Happened

Implemented the ability for users to define AI-specific instructions (akin to `llms.txt`) that get auto-injected into generated codebase exports. Users enable a checkbox in the UI and edit `_codebase/instructions.md` — its content appears at the top of all exported files (.txt, .md, .json, .xml).

Implementation spanned 4 phases across 10+ files, all completed cleanly with zero TypeScript errors.

## The Brutal Truth

This was refreshingly straightforward. No fires, no last-minute discoveries, no regression cascades. The existing codebase patterns (prompt file management, settings file IPC handler, nested settings config) were so well-established that each phase was essentially copy the pattern, tweak the name, wire it through. The hardest decision was whether "==== SYSTEM INSTRUCTIONS ====" or "=== SYSTEM INSTRUCTIONS ===" looked better in TXT output. That says everything about how smoothly this went.

The slightly annoying part: having to touch 4 formatter files with identical signature changes (`instructionContent?: string | null`). DRY violation baked into the formatter architecture — each formatter has its own `writeOutput` signature rather than inheriting from BaseFormatter properly. But refactoring that is a separate concern and YAGNI applies here.

## Technical Details

**Phase 1 — Data Schema (ignoreRules.ts):**
- Extended `Settings` interface with `instructions: { enabled: boolean }`
- Bumped `schema_version` from 9 to 10
- Added v9 to v10 migration in `_ensureSchema()`: auto-fills `instructions: { enabled: false }` for existing projects
- Auto-creates `_codebase/instructions.md` on `initialize()` via `ensureInstructionsFileExists()`, same pattern as `ensurePromptFileExists()`
- `DEFAULT_INSTRUCTIONS_CONTENT` is a markdown template with Context, Conventions, and Rules for AI sections
- `readInstructionsFile()` returns `null` when disabled or file missing, content string otherwise

**Phase 2 — IPC Pipeline (ipcHandlers.ts, worker/index.ts, protocol.ts, preload/index.ts):**
- `GET_SETTINGS` action now returns `instructions_config` alongside format config
- `SAVE_SETTINGS` accepts optional `instructionsEnabled` parameter
- New `file:openInstructionsFile` IPC handler using `shell.openPath()` — mirrors existing `file:openSettingsFile`
- Preload exposes `open_instructions_file()` API

**Phase 3 — Combiner + Formatters (combiner.ts + 5 formatter files):**
- Combiner reads `instructions.md` once via `ignoreRules.readInstructionsFile()`, passes `instructionContent: string | null` to all formatters
- TXT: injects `==== SYSTEM INSTRUCTIONS ====` block between header and file content
- MD: injects `## System Instructions` section before the `---` separator
- JSON: adds `system_instructions` field to metadata object
- XML: injects `<system_instructions><![CDATA[...]]></system_instructions>` element, with `]]>` escaping applied (same pattern as file content CDATA blocks)
- BaseFormatter abstract `formatOutput` and `writeOutput` signatures updated with optional `instructionContent` parameter
- Single FS read per generation, not per formatter

**Phase 4 — UI (App.tsx):**
- Added `instructionsEnabled` state, initialized from `GET_SETTINGS` response
- Added "LLM Instructions" Card in the settings grid with checkbox + Edit button
- Checkbox calls `handleUpdateSettings` which passes `instructionsEnabled` through to `SAVE_SETTINGS`
- Edit button calls `open_instructions_file()`, disabled when no project loaded (`!projectPath`)
- `handleUpdateSettings` signature extended with optional `newInstructionsEnabled` parameter

## What We Tried

No failed approaches. The implementation followed the plan exactly. Every phase was completed in order with no backtracking.

## Root Cause Analysis

No root cause to analyze — this was a successful greenfield feature. The success factors:

1. The plan was detailed and phase files contained complete code snippets, so implementation was transcription, not design
2. Existing patterns (prompt file, settings file handler, nested config) were reused verbatim
3. The feature is additive — new settings key, new file, new UI card. Nothing was removed or restructured

## Lessons Learned

- **Pattern reuse works.** The `ensurePromptFileExists()` pattern was cloned 1:1 for `ensureInstructionsFileExists()`. The `file:openSettingsFile` handler was cloned for `file:openInstructionsFile`. Zero bugs, zero surprises.
- **Plan detail matters.** The phase files had actual TypeScript code, not just descriptions. This eliminated ambiguity during implementation.
- **Formatter architecture is mildly annoying.** The `writeOutput` method is redefined in each formatter with an identical signature. Any parameter addition hits 4+ files. Consider pulling the streaming/write logic into BaseFormatter if another formatter-wide parameter gets added. But not now — YAGNI.
- **CDATA escaping for XML was already solved** by the existing file content handling. Just applied the same `]]>` → `]]]]><![CDATA[>` transform to instruction content.

## Next Steps

- None. Feature is complete, docs are synced, plan is marked completed.
- Future consideration: if `instructions.md` gets a "Reset to default" button (mirroring prompt file reset), add it to the UI card. Not needed now.
