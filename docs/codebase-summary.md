# Codebase Summary — Codebase Tracker

## Repository Layout

```
src/
  main/
    core/
      clipboard.ts
      combiner.ts
      fileSplitter.ts
      fileUtils.ts
      ignoreRules.ts
      processor.ts
      scanner.ts
      treeBuilder.ts
      formatters/
        baseFormatter.ts
        index.ts
        jsonFormatter.ts
        markdownFormatter.ts
        txtFormatter.ts
        xmlFormatter.ts
    index.ts
    ipcHandlers.ts
  preload/
    index.ts
    index.d.ts
  renderer/
    index.html
    src/
      App.tsx
      main.tsx
      TreeView.tsx
      types/index.ts
      env.d.ts
      index.css
      assets/
Root configs:
  electron-builder.yml
  electron.vite.config.ts
  tsconfig.json / tsconfig.node.json / tsconfig.web.json
  package.json
```

## Main Process (`src/main/`)

### `index.ts` — Entry Point
- Creates `BrowserWindow` (1200x750, min 900x600).
- Disables hardware acceleration.
- Sets Linux Wayland switches (`ozone-platform-hint=auto`, `WaylandWindowDecorations`).
- Sets AppUserModelId to `com.codebasetracker`.
- Loads renderer from dev URL or built `index.html`.

### `ipcHandlers.ts` — IPC Registry
- Per-window state managed via `Map<number, WindowState>` keyed by `webContents.id`.
- Each window holds its own `IgnoreRules` instance and `cancelRef` to prevent cross-window leaks.
- `safeSend` helper guards against crashes when sending IPC to a destroyed window.
- Implements all `ipcMain.handle` channels and one-way `generate:progress` / `generate:finished` events.
- Key handlers:
  - `dialog:openDirectory` — directory picker.
  - `project:load` — resolve path, init `IgnoreRules`, build tree with priority sort.
  - `tree:toggleNode`, `tree:updateSelection`, `tree:updatePriority` — mutate rules and rebuild tree.
  - `settings:get`, `settings:save` — UI preferences persistence.
  - `generate:start`, `generate:cancel` — async generation with cooperative cancellation.
  - `file:*` — open explorer, open output/settings file, auto-copy, clear output.

## Core Logic (`src/main/core/`)

### `scanner.ts` — `FileScanner`
- Recursive directory walk using `fs.readdir` with `withFileTypes`.
- Skips `_codebase` output dir.
- Applies global ignore rules, explicit selection, and binary filtering via `isTextFile`.
- Sorts results by priority roots, then alphabetical.
- Supports cooperative cancellation via `cancelRef`.

### `treeBuilder.ts` — `TreeBuilder`
- Builds ASCII tree string for structure file.
- Sorts dirs-first alphabetically.
- Skips hidden directories (names starting with `.`).
- Truncates display at 10 children per depth level.

### `ignoreRules.ts` — `IgnoreRules`
- Loads `.gitignore` via `ignore` library.
- Merges with built-in `DEFAULT_SETTINGS` (schema version 4).
- Selection logic uses specificity (longest matching path wins).
- Tri-state (`checked` | `unchecked` | `partial`) computed from included/excluded paths.
- Persists to `_codebase/settings.json`.
- Path normalization: backslashes to forward slashes, trim leading `./` and trailing `/`.

### `processor.ts` — `ProjectProcessor`
- High-level coordinator: scan -> combine.
- Accepts `cancelRef` and progress callbacks.
- Returns `ProcessorResult` with success flag, message, and stats.

### `combiner.ts` — `FileCombiner`
- Orchestrates scan results into formatted output files.
- Output directory: `_codebase/` inside project root.
- Generates `codebase_structure.txt` with ASCII tree.
- Iterates formats, instantiates formatter from `FORMATTERS` registry, writes via `createWriteStream`.
- Only `txt` format supports auto-splitting (uses `fileSplitter.ts`).

### `fileSplitter.ts` — `splitOutputFile`
- Splits a completed output file into N parts.
- Preserves header block in each part.
- Deletes original file after successful split.

### `fileUtils.ts`
- `isTextFile` — extension-based binary/text classification with forced text overrides.
- `readTextFile` — reads buffer, detects encoding via `chardet`, decodes with `TextDecoder` (fatal=false).
- `ensureDirectory`, `normalizeForStorage`, `getRelativePath`, `formatFileSize`.

### `clipboard.ts` — `copyFilesToClipboard`
- Cross-platform file copying to clipboard.
- Windows: PowerShell `Set-Clipboard -Path`.
- macOS: AppleScript `set the clipboard to { POSIX file ... }`.
- Linux: `wl-copy` (Wayland) -> `xclip` (X11) -> plain text fallback.

## Formatters (`src/main/core/formatters/`)

### `baseFormatter.ts` — `BaseFormatter`
- Abstract class with `getExtension()`, `formatOutput()`, and `writeOutput()`.
- `_readFileContent` supports optional blank-line and comment stripping (limited language markers).
- `_getLanguageFromExtension` maps extensions to language names.

### `txtFormatter.ts`
- Plain text header: `# configName | N files | timestamp`.
- Separators: `// relPath`.
- Overrides `writeOutput` to stream per-file chunks.

### `jsonFormatter.ts`
- Streaming JSON output via `writeOutput` override.
- Writes metadata header, then streams each file object as indented JSON chunks with trailing commas, and closes the array/object.
- `formatOutput` is explicitly locked to prevent accidental full-buffer usage.

### `markdownFormatter.ts`
- Markdown with `## \`path\`` headings and fenced code blocks.
- Streams via `writeOutput`.

### `xmlFormatter.ts`
- XML with CDATA sections; escapes attributes; breaks `]]>` sequences.
- Streams via `writeOutput`.

### `index.ts`
- Registry map: `txt`, `json`, `md`, `xml` -> formatter classes.

## Preload (`src/preload/`)

### `index.ts`
- Exposes typed `window.api` via `contextBridge`.
- Wraps all IPC channels into `IpcApi` interface.
- Checks `process.contextIsolated` and falls back to direct window assignment.
- Event listeners (`onProgressUpdate`, `onGenerationFinished`) return unsubscribe functions.

### `index.d.ts`
- Ambient type declaration augmenting global `Window` with `api: IpcApi`.

## Renderer (`src/renderer/src/`)

### `App.tsx`
- Root component. Split-pane UI via `react-split` (20/80).
- Manages project loading, generation state, tree interactions, drag-and-drop folder loading, auto-copy on success.
- Vietnamese UI labels.
- Handlers: browse, reload, start, cancel, toggle node, tree reorder, open folder, auto-copy, open settings, clear output.

### `TreeView.tsx`
- Recursive sortable tree using `@dnd-kit/core` and `@dnd-kit/sortable`.
- Drag constrained to 8px distance.
- Only sibling reordering within same parent.
- File icons vary by extension (`lucide-react`).

### `types/index.ts`
- Central types: `TreeData`, `Stats`, `OutputFormats`, IPC response shapes.
- `TreeData.checked` is tri-state: `'checked' | 'unchecked' | 'partial'`.

### `main.tsx`
- Standard React 19 root mount with `React.StrictMode`.

### `index.css`
- Tailwind v4 with custom theme tokens: `accent`, `accentHover`, `bgPanel`, `textMain`, `textMuted`, `borderDark`, `danger`.
- Custom scrollbar and `react-split` gutter styles.

### `index.html`
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`.

## Build & Packaging

### `electron.vite.config.ts`
- Separate pipelines for main, preload, renderer.
- Renderer alias `@` -> `src/renderer/src`.
- Plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`.

### `electron-builder.yml`
- AppID `com.codebasetracker`.
- NSIS (Windows), DMG (macOS), AppImage/Snap/DEB (Linux).
- Linux depends on `xclip` and `wl-clipboard`.
- Uses Chinese electron mirror (`npmmirror.com`).

### `tsconfig.json`
- Project references to `tsconfig.node.json` and `tsconfig.web.json`.

## Data Flow

1. User selects folder (browse or drag-drop) -> `dialog:openDirectory` or renderer drop event -> `project:load`.
2. `IgnoreRules` initializes, loads `.gitignore` and `_codebase/settings.json`.
3. IPC handler builds tree recursively with priority sort and returns to renderer.
4. User toggles checkboxes / reorders nodes -> `tree:toggleNode` / `tree:updatePriority` -> rules update -> tree rebuild -> UI refresh.
5. User clicks Scan & Generate -> `generate:start` -> `ProjectProcessor.run` -> `FileScanner.scan` -> `FileCombiner.combine` -> progress events -> `generate:finished`.
6. On success, renderer auto-calls `file:autoCopy` and shows toast.
