# Project Changelog — Codebase Tracker

## 2026-05-09

- **Added WSL Path Support**: Complete Windows Subsystem for Linux (WSL) integration for seamless path mapping.
  - New `path-resolver.ts` utility converts Linux paths to Windows UNC paths automatically.
  - UI: New "WSL Configuration" settings card with Enable/Disable toggle and Base Path configuration.
  - Modal dialog for WSL settings with validation and user-friendly error messages.
  - Persistent storage in `settings.json` (schema v8) with `wsl: { enabled, basePath }`.
  - IPC handlers: `wsl:getConfig`, `wsl:saveConfig` for configuration management.
  - Automatic path resolution during project load with helpful error messages for misconfigured WSL paths.
  - Supports both `\\wsl.localhost\` and `\\wsl$\` UNC path formats.
  - **Usage**: Enable WSL Mode, set Base Path (e.g., `\\wsl.localhost\Ubuntu-24.04`), then enter Linux paths normally.

## 2026-05-04

- Added a right-side selection sidebar with checked and unchecked tabs.
- Added approximate token counts for every rendered file and folder row.
- Fixed parent-folder checkbox toggles so subtree selection updates now clear conflicting descendant rules.

## Notes

- Token estimates are derived from file size in the main process and aggregated upward for folders.
- The selection tree remains the source of truth; the tabs are filtered views over the returned tree snapshot.