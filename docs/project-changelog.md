# Project Changelog — Codebase Tracker

## 2026-05-04

- Added a right-side selection sidebar with checked and unchecked tabs.
- Added approximate token counts for every rendered file and folder row.
- Fixed parent-folder checkbox toggles so subtree selection updates now clear conflicting descendant rules.

## Notes

- Token estimates are derived from file size in the main process and aggregated upward for folders.
- The selection tree remains the source of truth; the tabs are filtered views over the returned tree snapshot.