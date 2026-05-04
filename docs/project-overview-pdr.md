# Project Overview & PDR — Codebase Tracker

## Product Information

| Field       | Value                                           |
|-------------|-------------------------------------------------|
| Name        | Codebase Tracker                                |
| Version     | 1.0.0                                           |
| Author      | Minh Long                                       |
| Description | Desktop app that scans project directories, lets users select/filter files via an interactive tree, and exports combined source code into TXT, JSON, Markdown, or XML for AI context feeding. Supports chunk splitting and auto clipboard copy. |
| Platforms   | Windows, macOS, Linux                           |
| App ID      | `com.codebasetracker`                           |

## Tech Stack

| Layer       | Technology                                      |
|-------------|-------------------------------------------------|
| Framework   | Electron 39                                     |
| UI          | React 19, Tailwind CSS v4                       |
| Language    | TypeScript 5.9                                  |
| Build Tool  | Vite 7 (via `electron-vite`)                    |
| Packaging   | `electron-builder`                              |
| DnD         | `@dnd-kit/core`, `@dnd-kit/sortable`            |
| Icons       | `lucide-react`                                  |
| Split Pane  | `react-split`                                   |
| Encoding    | `chardet`                                       |
| Ignore      | `ignore`                                        |
| Updates     | `electron-updater`                              |

## Functional Requirements

1. **Project Scanning**
   - Recursively scan a user-selected directory.
   - Skip binary files and globally ignored patterns (built-in + `.gitignore`).
   - Skip the `_codebase` output directory.
   - Sort directories first, then alphabetically.

2. **Interactive Tree**
   - Display recursive tree with file/folder icons.
   - Tri-state checkboxes (`checked` | `unchecked` | `partial`).
   - Drag-and-drop sibling reordering (constrained to 8px distance).
   - Visual distinction for ignored items (opacity + grayscale).
   - Auto-expand folders on click.

3. **Selection & Filtering**
   - Explicit include/exclude paths persisted per project.
   - Specificity-based selection (longest matching path wins).
   - Priority roots affect tree sort order and file scan order.

4. **Export Generation**
   - Formats: `txt`, `json`, `md`, `xml`.
   - Optional comment stripping (per language markers).
   - Auto-splitting for `txt` output into N parts with preserved header.
   - Streaming output for all formats including JSON (via `writeOutput` override).
   - Cross-platform clipboard copy of generated files.

5. **Settings Persistence**
   - Per-project `settings.json` stored in `_codebase/`.
   - Schema version 4 with automatic migration.
   - UI preferences (formats, split enabled, split count).

## Non-Functional Requirements

| Category    | Requirement                                      |
|-------------|--------------------------------------------------|
| Performance | Streaming writes for large outputs; cooperative cancellation for long scans. |
| Security    | Context isolation enabled; CSP on renderer; preload exposes only typed API. |
| Portability | Single codebase builds for Windows (NSIS), macOS (DMG), Linux (AppImage/Snap/DEB). |
| UX          | Vietnamese UI labels; drag-and-drop folder loading; progress bar + console log. |
| Size        | Individual source files under 200 lines where practical. |

## Acceptance Criteria

- [ ] User can browse or drag a folder to load the project tree.
- [ ] Tree reflects `.gitignore` and built-in ignore rules accurately.
- [ ] Checking/unchecking nodes updates selection state with partial indeterminates.
- [ ] Reordering nodes updates priority roots and persists.
- [ ] Generation produces correct files for all selected formats.
- [ ] TXT auto-splitting produces N parts and removes the original.
- [ ] Auto-copy places generated files on the system clipboard.
- [ ] Build succeeds on Windows (`npm run build:win`), macOS (`build:mac`), and Linux (`build:linux`).

## Constraints & Dependencies

- `_codebase` folder name is currently hard-coded as the output directory.
- JSON formatter streams via `writeOutput` to keep memory usage flat.
- Auto-splitting is only supported for `txt` format.
- Multi-window state is managed via `Map<webContentsId, WindowState>`; multiple simultaneous windows are not yet exposed in UI.
- Linux clipboard file copy requires `wl-clipboard` or `xclip`; falls back to plain text paths.

## Version History

| Version | Date       | Notes                          |
|---------|------------|--------------------------------|
| 1.0.0   | 2026-04-30 | Initial release.               |
