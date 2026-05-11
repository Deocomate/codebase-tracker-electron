---
title: "Attention Context Refactor"
description: "Replace keyword text search with glob-pattern Attention matching using the ignore package. Attention files pushed to bottom of output for LLM recency bias. Adds prompt file management for AI instruction copy."
status: completed
priority: P1
branch: "main"
tags: ["refactor", "attention", "context", "LLM optimization", "glob-patterns"]
blockedBy: []
blocks: []
created: "2026-05-10T17:26:29.661Z"
createdBy: "ck:plan"
source: skill
supersedes: "260507-2333-search-driven-context-refactor"
---

# Attention Context Refactor

## Overview

Pivot from keyword-based text search to **glob-pattern Attention matching** using the existing `ignore` package. Users paste glob patterns (e.g. `src/auth/**`, `*.controller.ts`) from AI tools into a textarea. Files matching patterns are split into **Attention files** and pushed to the **bottom** of output (recency bias). A `prompt_get_list_files_and_folders_related.md` file is auto-generated in `_codebase/` for users to copy as AI instruction.

## Architecture

```
UI (React)                           Worker Process
┌──────────────────┐                 ┌──────────────────────┐
│  TreeView        │──IPC──────────►│  FileScanner          │
│  (Global Ctx)    │                 │  .scan() → globalFiles│
├──────────────────┤                 ├──────────────────────┤
│  AttentionSidebar│                 │  IgnoreRules          │
│  - textarea      │──IPC──────────►│  .attentionPatterns   │
│  - Copy Instr.   │                 │  .promptFile          │
│  - Reset btn     │                 ├──────────────────────┤
│  - Preview list  │                 │  Combiner             │
└──────────────────┘                 │  → secondaryFiles     │
                                     │  → attentionFiles ↓   │
                                     └──────────────────────┘
```

## Phases

| Phase | Name | Status | Priority |
|-------|------|--------|----------|
| 1 | [Data Schema and Prompt Manager](./phase-01-data-schema-and-prompt-manager.md) | Completed | P1 |
| 2 | [Worker Protocol and IPC Handlers](./phase-02-worker-protocol-and-ipc-handlers.md) | Completed | P1 |
| 3 | [Combiner and Formatter Upgrades](./phase-03-combiner-and-formatter-upgrades.md) | Completed | P1 |
| 4 | [AttentionSidebar UI](./phase-04-attentionsidebar-ui.md) | Completed | P1 |

## Dependencies

- Phase 2 depends on Phase 1 (needs new IgnoreRules methods + removed search actions)
- Phase 3 depends on Phase 2 (needs attention patterns passed through IPC)
- Phase 4 depends on Phase 2 (needs IPC API for UI to call)
- Phase 1 + 2 can be done together (same file changes)
- Phase 3 + 4 can partially overlap (formatters don't need UI)

## Preserved Components (No Changes)

- FileSplitter, FileUtils, Clipboard, path-resolver
- TreeBuilder
- BaseFormatter `_readFileContent` / `_getLanguageFromExtension` methods
- WSL path resolution logic

## Key Design Decisions

- **`ignore` package for pattern matching** — reuse existing dependency, no new packages
- **`isAttention: boolean` on FileEntry** — signals to Combiner and Formatters where to split
- **Textarea input** with multiline patterns — split by `\n`, empty lines skipped
- **Prompt file in `_codebase/`** — auto-created, user-editable, Reset restores default
- **Attention patterns persisted** in `settings.json` under `attention_patterns: string[]`
