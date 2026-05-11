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
      path-resolver.ts
      processor.ts
      scanner.ts
      treeBuilder.ts
      formatters/
    worker/
      index.ts
      protocol.ts
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
      AttentionSidebar.tsx
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
  - `file:*` — open explorer, open output/settings/instructions file, auto-copy, clear output.

## Core Logic (`src/main/core/`)

### `scanner.ts` — `FileScanner`
- Recursive directory walk using `fs.readdir` with `withFileTypes`.
- Skips `_codebase` output dir.
- Applies global ignore rules, explicit selection, and binary filtering via `isTextFile`.
- Sorts results by priority roots, then alphabetical.
- Returns `FileEntry` objects with optional `isAttention` flag.
- Supports cooperative cancellation via `cancelRef`.

### `treeBuilder.ts` — `TreeBuilder`
- Builds ASCII tree string for structure file.
- Sorts dirs-first alphabetically.
- Skips hidden directories (names starting with `.`).
- Truncates display at 10 children per depth level.

### `ignoreRules.ts` — `IgnoreRules`
- Loads `.gitignore` via `ignore` library.
- Merges with built-in `DEFAULT_SETTINGS` (schema version 10).
- Selection logic uses specificity (longest matching path wins).
- Tri-state (`checked` | `unchecked` | `partial`) computed from included/excluded paths.
- Persists to `_codebase/settings.json`.
- Path normalization: backslashes to forward slashes, trim leading `./` and trailing `/`.
- `attention_patterns` field for glob-based context file selection.
- `instructions` field (`{ enabled: boolean }`) controlling LLM instructions injection.
- Prompt file manager: creates and manages `_codebase/prompt_get_list_files_and_folders_related.md`.
- Instructions file manager: creates and manages `_codebase/instructions.md` (template with project context, conventions, and AI rules).
- Methods: `getAttentionPatterns()`, `updateAttentionPatterns()`, `readPromptFile()`, `resetPromptFile()`, `getInstructionsConfig()`, `updateInstructionsConfig()`, `readInstructionsFile()`, `ensureInstructionsFileExists()`.

### `processor.ts` — `ProjectProcessor`
- High-level coordinator: scan -> combine.
- Accepts `cancelRef`, progress callbacks, and optional `attentionPatterns`.
- Splits scanned files into attention (glob-matched) and codebase categories.
- Attention files are injected with `isAttention: true` to enable visual markers in formatters.
- Returns `ProcessorResult` with success flag, message, and stats.

### `combiner.ts` — `FileCombiner`
- Orchestrates scan results into formatted output files.
- Output directory: `_codebase/` inside project root.
- Generates `codebase_structure.txt` with ASCII tree.
- Reads instruction content from `IgnoreRules.readInstructionsFile()` when instructions are enabled.
- Passes `isAttention` flag and optional `instructionContent` per-file to formatters.
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

### `path-resolver.ts` — WSL Path Mapping
- Converts Linux/WSL paths to Windows UNC paths for seamless cross-platform support.
- `resolveWorkspacePath(inputPath, wslConfig)`: Main resolver function.
  - If WSL disabled OR path is Windows format (e.g., `C:\...`), returns path unchanged.
  - If path starts with `/` (Linux format), converts to Windows UNC: `/home/user/project` → `\\wsl.localhost\Ubuntu-24.04\home\user\project`.
- `isValidWslBasePath(basePath)`: Validates format starts with `\\wsl.localhost\` or `\\wsl$\`.
- `formatWslBasePath(basePath)`: Trims and removes trailing backslash for consistent handling.
- Integrated into `ipcHandlers.ts` `project:load` to resolve paths before file system access.
- Settings persisted in `settings.json` with schema version 9: `wsl: { enabled: boolean; basePath: string }`.

## Worker Process (`src/main/worker/`)

### `protocol.ts` — Shared Types
- NDJSON protocol for Worker ↔ Main Process communication.
- `WorkerAction` union type: `INIT`, `BUILD_TREE`, `TOGGLE_NODE`, `UPDATE_SELECTION`, `UPDATE_PRIORITY`, `ATTENTION_PREVIEW`, `READ_PROMPT_FILE`, `RESET_PROMPT_FILE`, `SAVE_ATTENTION_PATTERNS`, `GET_SETTINGS`, `SAVE_SETTINGS`, `GET_WSL_CONFIG`, `SAVE_WSL_CONFIG`, `*_IGNORE_PATTERN`, `GENERATE`, `CANCEL_GENERATE`, `CLEAR_OUTPUT`, `SHUTDOWN`.
- `WorkerRequest`: `{ id, action, payload }` sent as NDJSON line.
- `WorkerResponse`: `{ id, status: 'success'|'error'|'progress', data?, error?, progress?, message? }`.

### `index.ts` — Worker Manager
- Spawns a child process for the worker (separate Node.js process).
- Communicates over NDJSON via stdin/stdout.
- Handles `ATTENTION_PREVIEW`: resolves glob patterns against project file tree.
- Handles `READ_PROMPT_FILE` / `RESET_PROMPT_FILE`: prompt file management.
- Handles `SAVE_ATTENTION_PATTERNS`: persist patterns to settings.
- Handles `GET_SETTINGS` / `SAVE_SETTINGS`: UI preferences + `instructions_config` toggling.

## Formatters (`src/main/core/formatters/`)

### `baseFormatter.ts` — `BaseFormatter`
- Abstract class with `getExtension()`, `formatOutput()`, and `writeOutput()`.
- `writeOutput` signature includes optional `instructionContent?: string | null` parameter for LLM instructions injection.
- `_readFileContent` supports optional blank-line and comment stripping (limited language markers).
- `_getLanguageFromExtension` maps extensions to language names.

### `txtFormatter.ts`
- Plain text header: `# configName | N files | timestamp`.
- When instructions are enabled, inserts `==== SYSTEM INSTRUCTIONS ====` block after the header.
- Separators: `// relPath` or `// [ATTENTION] relPath` for attention files.
- Inserts `CRITICAL ATTENTION CONTEXT` marker section between codebase and attention files.
- Overrides `writeOutput` to stream per-file chunks.

### `jsonFormatter.ts`
- Streaming JSON output via `writeOutput` override.
- Includes `is_attention: true/false` field per file.
- When instructions are enabled, adds `system_instructions` field to the `metadata` object.
- Writes metadata header, then streams each file object as indented JSON chunks with trailing commas, and closes the array/object.
- `formatOutput` is explicitly locked to prevent accidental full-buffer usage.

### `markdownFormatter.ts`
- Markdown with `## \`path\`` headings and fenced code blocks.
- When instructions are enabled, inserts `## System Instructions` section after the header.
- Inserts `## CRITICAL ATTENTION CONTEXT` heading before attention files.
- Streams via `writeOutput`.

### `xmlFormatter.ts`
- XML with CDATA sections; escapes attributes; breaks `]]>` sequences.
- When instructions are enabled, inserts `<system_instructions>` CDATA element after the opening `<codebase>` tag.
- Adds `is_attention="true"` attribute on file elements for attention files.
- Streams via `writeOutput`.

### `index.ts`
- Registry map: `txt`, `json`, `md`, `xml` -> formatter classes.

## Preload (`src/preload/`)

### `index.ts`
- Exposes typed `window.api` via `contextBridge`.
- Wraps all IPC channels into `IpcApi` interface.
- `IpcApi` includes `open_instructions_file()` for opening `instructions.md` in default OS editor.
- `save_settings` signature includes optional `instructionsEnabled` parameter.
- `SettingsResponse` includes `instructions_config?: { enabled: boolean }` field.
- Checks `process.contextIsolated` and falls back to direct window assignment.
- Event listeners (`onProgressUpdate`, `onGenerationFinished`) return unsubscribe functions.

### `index.d.ts`
- Ambient type declaration augmenting global `Window` with `api: IpcApi`.

## Renderer (`src/renderer/src/`)

### `App.tsx`
- Root component. Split-pane UI via `react-split` (25/50/25).
- Left pane: AttentionSidebar. Center: Workspace Settings. Right pane: tree explorer (Selected/Ignored tabs).
- Manages project loading, generation state, tree interactions, drag-and-drop folder loading, auto-copy on success.
- Vietnamese UI labels.
- Attention patterns state (`attentionPatterns`) synced with sidebar and passed to `generate:start`.
- Instructions state (`instructionsEnabled`) from settings, toggle persisted via `settings:save`.
- LLM Instructions card: checkbox "Include LLM Instructions (instructions.md)" + Edit button to open file in default OS editor.
- Handlers: browse, reload, start, cancel, toggle node, tree reorder, open folder, auto-copy, open settings, edit instructions, clear output.

### `AttentionSidebar.tsx`
- Right sidebar with 4 sections: AI Instruction, Attention Patterns (textarea), Matched Files (live preview), Global Ignore.
- Glob pattern input with 300ms debounced live preview showing matched files + token counts.
- Copy AI Instruction button reads `_codebase/prompt_get_list_files_and_folders_related.md` to clipboard.
- Global ignore pattern input with Enter-to-add and pill-based removal.
- Patterns auto-persist to settings.json with 500ms debounce.

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
5. User enters glob patterns in AttentionSidebar -> `attention:savePatterns` -> `ATTENTION_PREVIEW` worker action for live preview -> patterns persisted to settings.json.
6. User clicks Scan & Generate -> `generate:start` with attention patterns -> `ProjectProcessor.run` -> `FileScanner.scan` -> processor splits files by attention glob matching -> `FileCombiner.combine` with `isAttention` flags and `instructionContent` -> progress events -> `generate:finished`.
7. On success, renderer auto-calls `file:autoCopy` and shows toast.
8. Instructions toggle: user enables "Include LLM Instructions" -> `settings:save` with `instructionsEnabled` -> worker persists -> on next generate, `FileCombiner` reads `instructions.md` -> injected into all export formats.
