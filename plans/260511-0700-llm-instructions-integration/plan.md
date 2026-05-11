---
title: "LLM Instructions Integration"
description: "Auto-inject user-defined AI instructions (instructions.md) into generated codebase exports. Settings persisted in _codebase/settings.json, template auto-created on project load."
status: completed
priority: P2
branch: "main"
tags: ["feature", "llm-instructions", "context", "codebase-export", "llms.txt"]
blockedBy: []
blocks: []
created: "2026-05-11T00:04:19.106Z"
createdBy: "ck:plan"
source: skill
---

# LLM Instructions Integration

## Overview

Adds an `instructions.md` file to `_codebase/` that users can edit with AI-specific instructions (context, rules, conventions). When enabled via UI checkbox, its content is injected at the top of all generated export files (.txt, .md, .json, .xml). Analogous to `llms.txt` standard — LLMs read these instructions before the codebase content.

## Architecture

```
UI (React)                       Worker Process                Output
┌──────────────────────┐        ┌────────────────────┐       ┌──────────────┐
│  App.tsx             │        │  IgnoreRules        │       │  file.txt    │
│  - checkbox          │──IPC──►│  .settings          │       │  ========    │
│  - Edit button       │        │  .instructions      │       │  INSTRUCTIONS│
│                      │        │  .enabled: bool     │       │  (top)       │
│                      │        ├────────────────────┤       │  ────────    │
│                      │        │  Combiner           │       │  codebase    │
│                      │        │  → readInstructions │       │  content     │
│                      │        ├────────────────────┤       │  (below)     │
│                      │        │  Formatters         │       └──────────────┘
│                      │        │  .writeOutput()     │
│                      │        │  +instructionContent│
└──────────────────────┘        └────────────────────┘
```

## Phases

| Phase | Name | Status | Priority | Effort |
|-------|------|--------|----------|--------|
| 1 | [Data Schema and Instructions Template](./phase-01-update-data-schema-and-initialize-instructions-template.md) | Completed | P1 | 1h |
| 2 | [Worker Protocol and IPC Bridge](./phase-02-update-worker-protocol-and-ipc-bridge.md) | Completed | P1 | 1.5h |
| 3 | [Combiner and Formatter Upgrades](./phase-03-upgrade-combiner-and-formatters.md) | Completed | P1 | 2h |
| 4 | [UI Checkbox and Edit Button](./phase-04-update-ui-with-checkbox-and-edit-button.md) | Completed | P2 | 1h |

## Dependencies

- Phase 2 depends on Phase 1 (needs new IgnoreRules methods + schema v10)
- Phase 3 depends on Phase 1 (needs instructions content from IgnoreRules) and Phase 2 (needs IPC to pass instructions flag)
- Phase 4 depends on Phase 2 (needs IPC API for checkbox + open file)
- Phase 1 + 2 can overlap (different methods in same file, worker is separate)
- Phase 3 + 4 can overlap (formatters don't need UI, UI doesn't need formatters)

## Preserved Components (No Changes)

- FileScanner, FileSplitter, FileUtils, Clipboard, PathResolver, TreeBuilder
- Scanner ignore logic, WSL path resolution
- Prompt file management (coexists with instructions file)

## Key Design Decisions

- **instructions.md in `_codebase/`** — same directory as settings.json, prompt file; consistent
- **`instructions: { enabled: boolean }` in Settings** — follows existing nested config pattern (split_config, wsl, ui)
- **Instructions injected per-format** — TXT/MD get a header block, JSON gets `system_instructions` field, XML gets `<system_instructions>` element
- **Auto-create on init** — mirrors `ensurePromptFileExists()` pattern, no user action needed
- **Edit button opens via `shell.openPath`** — mirrors `file:openSettingsFile` handler
- **Read once per generate** — Combiner reads instructions.md, passes string to all formatters (single FS read, not per-format)
