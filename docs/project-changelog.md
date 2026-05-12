# Project Changelog — Codebase Tracker

## 2026-05-12

- **Removed WSL Runtime Support**: Simplified project loading and worker execution to native host OS paths only.
  - Deleted WSL path mapping utilities and WSL-specific worker spawning.
  - Removed WSL IPC channels and preload APIs.
  - Removed WSL configuration UI and settings persistence; settings schema is now v11 and legacy `wsl` keys are deleted on migration.
  - Introduced `src/shared/types.ts` as a type-only shared contract for Main, Preload, Worker, and Renderer.
  - Split renderer state into `useProject`, `useSettings`, and `useGenerator`, with `App.tsx` reduced to layout composition.

## 2026-05-11

- **LLM Instructions Integration**: Added auto-generated `instructions.md` template with user-editable project context, conventions, and AI rules.
  - New `_codebase/instructions.md` file auto-created per project with `## Context`, `## Conventions`, and `## Rules for AI` sections.
  - UI checkbox "Include LLM Instructions (instructions.md)" in Workspace Settings toggles injection via `settings:save` IPC.
  - Edit button opens `instructions.md` in default OS editor via `shell.openPath` (`file:openInstructionsFile` IPC).
  - When enabled, instruction content injected at top of all export formats:
    - TXT: `==== SYSTEM INSTRUCTIONS ====` block after header.
    - MD: `## System Instructions` section after header.
    - JSON: `system_instructions` field in `metadata` object.
    - XML: `<system_instructions>` CDATA element after opening `<codebase>` tag.
  - Settings persisted in `_codebase/settings.json` under `instructions: { enabled: boolean }` (schema v9 -> v10).
  - Analogous to `llms.txt` standard: LLMs read instructions before codebase content.

## 2026-05-10

- **Attention Context Refactor**: Replaced search-driven sidebar with attention-based context selection system.
  - Replaced `search_keywords`/`search_cache` with `attention_patterns` in settings (schema v8 -> v9).
  - New `AttentionSidebar`: glob pattern textarea with live preview (debounced) showing matched files and token counts.
  - AI Instruction section: copy/reset prompt file (`_codebase/prompt_get_list_files_and_folders_related.md`) to clipboard.
  - Global ignore section: inline add/remove of custom ignore patterns.
  - New worker process (`src/main/worker/`) with NDJSON protocol for `ATTENTION_PREVIEW`, `SAVE_ATTENTION_PATTERNS`, `READ_PROMPT_FILE`, `RESET_PROMPT_FILE`.
  - Processor splits scanned files into attention (glob-matched) and codebase categories with `isAttention` flag.
  - All 4 formatters (txt, json, markdown, xml) updated with attention markers/fields.
  - New IPC channels: `attention:preview`, `attention:savePatterns`, `prompt:getInstruction`, `prompt:resetInstruction`.
  - Deleted: `src/main/core/searchEngine.ts`, `src/renderer/src/SearchSidebar.tsx`.

## 2026-05-09

- **Historical**: Added WSL path support. This feature was removed on 2026-05-12 in favor of native host OS paths only.

## 2026-05-04

- Added a right-side selection sidebar with checked and unchecked tabs.
- Added approximate token counts for every rendered file and folder row.
- Fixed parent-folder checkbox toggles so subtree selection updates now clear conflicting descendant rules.

## Notes

- Token estimates are derived from file size in the main process and aggregated upward for folders.
- The selection tree remains the source of truth; the tabs are filtered views over the returned tree snapshot.
