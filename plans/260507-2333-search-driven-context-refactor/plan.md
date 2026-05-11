---
title: "Search-driven Context Refactor"
description: "SUPERSEDED by 260511-0023-attention-context-refactor — keyword search replaced with glob pattern attention matching"
status: cancelled
priority: P1
branch: "main"
tags: ["refactor", "search", "context", "LLM optimization", "superseded"]
blockedBy: []
blocks: []
created: "2026-05-07T16:39:18.557Z"
createdBy: "ck:plan"
source: skill
supersededBy: "260511-0023-attention-context-refactor"
---

# Search-driven Context Refactor

## Overview

Chuyển từ mô hình "chọn thủ công bằng tay" sang **Global Context (TreeView) + Search-driven Context**.
Search Context files tự động được đưa xuống cuối output để tận dụng recency bias của LLM, đồng thời tránh trùng lặp với Global Context.

## Architecture

```
UI (React)                        Main Process
┌──────────────┐                 ┌────────────────────┐
│  TreeView    │──IPC──────────►│  FileScanner       │
│  (Global Ctx)│                 │  .scan()           │
│              │                 │  → globalFiles     │
├──────────────┤                 ├────────────────────┤
│  SearchPanel │──IPC──────────►│  SearchEngine      │
│  (Search Ctx)│                 │  .search()         │
│  - keywords  │                 │  → searchFiles     │
│  - tags      │                 ├────────────────────┤
│  - count     │                 │  Dedup + Order     │
└──────────────┘                 │  → FileCombiner    │
                                 └────────────────────┘
```

## Phases

| Phase | Name | Status | Priority |
|-------|------|--------|----------|
| 1 | [Build Search Engine](./phase-01-build-search-engine.md) | Pending | P1 |
| 2 | [Upgrade Combiner and Scanner](./phase-02-upgrade-combiner-and-scanner.md) | Pending | P1 |
| 3 | [Build IPC Bridge](./phase-03-build-ipc-bridge.md) | Pending | P2 |
| 4 | [Redesign UI](./phase-04-redesign-ui.md) | Pending | P2 |

## Dependencies

- Phase 2 depends on Phase 1 (needs SearchEngine class)
- Phase 3 depends on Phase 1 (needs search functions to expose via IPC)
- Phase 4 depends on Phase 3 (UI needs IPC API)
- Phases 3 and 4 can partially overlap (preload API can be defined before UI is ready)

## Preserved Components (No Changes)
- All formatters (txt, json, md, xml)
- FileSplitter, FileUtils, Clipboard
- TreeBuilder
- IgnoreRules path matching logic (only Settings interface extended)

## Key Design Decisions
- **FileEntry extended with `source: 'global' | 'search'`** — avoids breaking formatter signatures while enabling tagging
- **Search runs synchronously during `generate:start`** — single IPC call, no incremental streaming needed
- **Keywords persisted in `settings.json`** under `search_keywords: string[]` — survives app restart
