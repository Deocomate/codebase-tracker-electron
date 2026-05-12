# Project Roadmap — Codebase Tracker

## Current State (v1.0.0)

- [x] Electron 39 + React 19 + Tailwind v4 scaffold.
- [x] Directory scan with `.gitignore` and built-in ignore rule support.
- [x] Interactive tree with tri-state checkboxes and drag-to-reorder.
- [x] Attention sidebar with glob pattern input, live preview, AI instruction copy, and ignore management.
- [x] LLM instructions injection (`instructions.md`) in all export formats with UI toggle and editor integration.
- [x] Export to TXT, JSON, Markdown, XML.
- [x] Auto-splitting for TXT output.
- [x] Cross-platform clipboard file copy.
- [x] Per-project settings persistence (`_codebase/settings.json`).
- [x] Native host-path worker execution; WSL-specific path mapping has been removed.
- [x] Windows (NSIS), macOS (DMG), Linux (AppImage/Snap/DEB) packaging.

## Phase 1 — Performance & Scalability

| # | Task | Status |
|---|------|--------|
| 1 | Streaming JSON formatter (`JsonFormatter` buffers via `writeOutput` override). | Done |
| 2 | Content-based text detection (add MIME/content sniffing beyond extension lists). | Planned |
| 3 | Configurable output folder (replace hard-coded `_codebase` with user setting). | Planned |
| 4 | Optimize tree rebuilds (currently rebuilds entire tree on every toggle; consider incremental updates). | Planned |

## Phase 2 — Multi-Window & Concurrency

| # | Task | Status |
|---|------|--------|
| 5 | Replace module-level `currentRules` / `cancelRef` with window-scoped state (Map<webContentsId, State>). | Done |
| 6 | Allow multiple project windows simultaneously. | Planned |
| 7 | Handle unhandled rejections from background `generate:start` promise and surface to renderer. | Done |

## Phase 3 — Native Path Support

| # | Task | Status |
|---|------|--------|
| 12 | Remove WSL path mapping and run workers only on native host OS paths. | Done |
| 13 | Remove WSL configuration UI, IPC channels, and settings persistence. | Done |
| 14 | Migrate settings schema to v11 and delete legacy WSL keys. | Done |
| 15 | Keep cross-platform file operations for Windows, macOS, and Linux native paths. | Done |

## Phase 4 — Extensibility & DX

| # | Task | Status |
|---|------|--------|
| 16 | Extensible comment stripping (allow user-defined markers or language packs). | Planned |
| 17 | Custom ignore pattern editor in UI (beyond `.gitignore`). | Planned |
| 18 | Export templates / custom formatter plugins. | Planned |
| 19 | Keyboard shortcuts (Ctrl+R reload, Ctrl+Enter generate, Esc cancel). | Planned |

## Phase 5 — Polish & Distribution

| # | Task | Status |
|---|------|--------|
| 20 | Auto-updater integration (generic provider configured; needs real endpoint). | Planned |
| 21 | Signed builds for macOS (notarize) and Windows (code signing). | Planned |
| 22 | In-app onboarding / first-run tutorial. | Planned |
| 23 | Telemetry / crash reporting (opt-in). | Planned |

## Milestones

| Milestone | Target | Definition of Done |
|-----------|--------|--------------------|
| v1.1.0 | TBD | Streaming JSON + configurable output folder + content-based text detection. |
| v1.2.0 | TBD | Multi-window support + window-scoped state. |
| v1.3.0 | TBD | Extensible comment stripping + custom ignore UI. |
| v2.0.0 | TBD | Auto-updater live + signed builds + onboarding. |

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large project JSON generation causes OOM | High | Implement streaming JSON before v1.1.0. |
| Module-level state prevents multi-window | Medium | Refactor to Map before v1.2.0. |
| Linux clipboard fallback is poor UX | Low | Document dependencies; DEB already depends on `xclip` and `wl-clipboard`. |
