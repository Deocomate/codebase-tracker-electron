# System Architecture — Codebase Tracker

## High-Level Architecture

Codebase Tracker follows the standard Electron multi-process model:

```
+-------------------+        IPC (contextBridge)        +-------------------+
|   Main Process    |  <------------------------------>  |  Renderer Process |
|  (Node.js + FS)   |     typed window.api (IpcApi)     |  (React + DOM)    |
+-------------------+                                   +-------------------+
         |                                                       |
         v                                                       v
   +------------+                                         +--------------+
   | Core Logic |                                         |   UI Layer   |
   |  (scan,    |                                         | (Tree, Split,|
   | combine,   |                                         |  Settings)   |
   | format)    |                                         +--------------+
   +------------+
         |
   +------------+
   |   Output   |
   |  (_codebase)|
   +------------+
```

## Main Process Modules

```
main/
  index.ts          Window creation, lifecycle, Wayland/GPU switches
  ipcHandlers.ts    All IPC handle registrations + per-window Map state + safeSend
  core/
    scanner.ts      Recursive walk + filtering + priority sort
    treeBuilder.ts  ASCII tree generation with truncation
    ignoreRules.ts  .gitignore + built-in rules + selection specificity + attention patterns + prompt file mgmt + instructions file mgmt
    processor.ts    High-level scan -> combine coordinator with attention file splitting
    combiner.ts     Formatter dispatch, streaming writes, split trigger, attention flag passthrough
    fileSplitter.ts Header-preserving file chunking
    fileUtils.ts    isTextFile, readTextFile, path normalization
    clipboard.ts    Cross-platform file clipboard copy
    formatters/
  worker/
    index.ts        Worker process: project scanning and generation over NDJSON
    protocol.ts     Shared types: WorkerAction, WorkerRequest, WorkerResponse, TreeNode
      baseFormatter.ts    Abstract formatter + comment stripping
      txtFormatter.ts     Plain text streaming
      jsonFormatter.ts    Streaming JSON output (writeOutput override)
      markdownFormatter.ts Markdown streaming
      xmlFormatter.ts     XML streaming with CDATA
```

## Renderer Process Modules

```
renderer/
  index.html        CSP-hardened entry HTML
  src/
    main.tsx             React 19 root mount
    App.tsx              Root layout: split pane, hook composition, drag/drop
    hooks/               Project, settings, and generator state hooks
    features/            Sidebar, project, settings, and generator panels
    AttentionSidebar.tsx  Glob pattern input, live preview, AI instruction copy, ignore mgmt
    TreeView.tsx         Recursive @dnd-kit sortable tree
    types/index.ts       Shared TypeScript interfaces
    index.css            Tailwind v4 custom theme + split/gutter/scrollbar styles
```

## IPC Channel Map

| Channel (invoke)           | Direction | Purpose                                      |
|----------------------------|-----------|----------------------------------------------|
| `dialog:openDirectory`       | R -> M    | Open native directory picker.                |
| `project:load`               | R -> M    | Load project, init rules, return tree.       |
| `tree:toggleNode`            | R -> M    | Toggle check state for a path.               |
| `tree:updateSelection`       | R -> M    | Batch update included/excluded paths.        |
| `tree:updatePriority`        | R -> M    | Update priority root order.                  |
| `settings:get`               | R -> M    | Retrieve UI preferences.                   |
| `settings:save`              | R -> M    | Save UI preferences.                         |
| `attention:preview`          | R -> M    | Resolve glob patterns to matched file list.  |
| `attention:savePatterns`     | R -> M    | Save attention patterns to settings.         |
| `prompt:getInstruction`      | R -> M    | Read prompt file content.                    |
| `prompt:resetInstruction`    | R -> M    | Reset prompt file to default.                |
| `generate:start`             | R -> M    | Begin async scan+combine (with attention patterns). |
| `generate:cancel`            | R -> M    | Set cancellation flag.                       |
| `file:openExplorer`          | R -> M    | Open file in native file manager.            |
| `file:openOutputFolder`    | R -> M    | Open `_codebase` folder.                     |
| `file:openSettingsFile`      | R -> M    | Open `settings.json` in default editor.     |
| `file:openInstructionsFile`  | R -> M    | Open `instructions.md` in default editor.    |
| `file:autoCopy`              | R -> M    | Copy generated files to clipboard.         |
| `file:clearOutput`           | R -> M    | Delete `_codebase` directory.                |
| `util:testConnection`        | R -> M    | Health-check ping.                           |

| Channel (one-way)            | Direction | Purpose                                    |
|------------------------------|-----------|--------------------------------------------|
| `generate:progress`          | M -> R    | Progress message + float (0..1).           |
| `generate:finished`          | M -> R    | Success flag, message, stats object.       |

## Data Flow

### 1. Project Load

```
User (Browse / Drag-drop)
    |
    v
App.tsx -> window.api.load_project(path)
    |
    v
ipcHandlers.ts: project:load
    |
    +-> create WorkerManager(path)
    +-> spawn worker via local Electron Node mode
    +-> send INIT { path }
    |
    +-> worker initializes IgnoreRules
    |       +-> load .gitignore
    |       +-> load _codebase/settings.json (or create defaults)
    |       +-> compile rules
    |
    +-> worker builds tree recursively
    |       +-> sort children by priority > checked-state > dir > alpha
    |
    +-> return { status, project_path, tree }
    |
    v
App.tsx -> setTreeData(tree)
```

### 2. Generation

```
User clicks "Scan & Generate"
    |
    v
App.tsx -> window.api.start_generation(selectedFormats, splitEnabled, splitCount, attentionPatterns)
    |
    v
ipcHandlers.ts: generate:start
    |
    +-> getWindowState(event) -> per-window rules + cancelRef
    +-> cancelRef = { cancelled: false }
    +-> try { new ProjectProcessor(...) } catch { return error to renderer }
    +-> runGeneration() (async background worker)
    |       |
    |       +-> FileScanner.scan(callback, cancelRef)
    |       |       +-> recursive _walkDir
    |       |       +-> filter by ignore + selection + isTextFile
    |       |       +-> sort by priority roots
    |       |
    |       +-> processor splits scanned files by attention glob matching
    |       |       +-> attentionFiles: matched -> isAttention=true
    |       |       +-> codebaseFiles: unmatched -> isAttention=false
    |       |
    |       +-> FileCombiner.combine(...)
    |               +-> read instructionContent from ignoreRules (if instructions enabled)
    |               +-> build ASCII tree -> codebase_structure.txt
    |               +-> for each format:
    |                       +-> new FormatterClass()
    |                       +-> writeOutput with instructionContent + isAttention flag per file
    |                       +-> formatters inject instructions before file content, attention markers before attention files
    |                       +-> if txt + splitEnabled -> splitOutputFile
    |               +-> return stats
    |       |
    |       +-> safeSend generate:progress (during run)
    |       +-> safeSend generate:finished (on complete)
    |       +-> try/catch top-level: safeSend fatal-error message if crash
    |
    +-> return { status: 'started' } immediately to renderer
    v
App.tsx -> setStats(stats) -> auto_copy_files -> toast
```

### 3. Tree Reorder

```
User drags node in TreeView.tsx
    |
    v
@dnd-kit -> handleDragEnd -> arrayMove siblings
    |
    v
onReorder(newTreeData) -> extractPriorityList recursively
    |
    v
window.api.update_priority(list)
    |
    v
ipcHandlers.ts: tree:updatePriority -> ignoreRules.updatePriorityRoots
    +-> save settings.json
```

## State Model

### Main Process (Per-Window Map State)

```ts
interface WindowState {
  workerManager: WorkerManager | null
}

const windowStates = new Map<number, WindowState>()
```

- `windowStates` maps `webContents.id` to a dedicated `WindowState`.
- Each window gets its own `WorkerManager`, preventing cross-window worker leaks and enabling multi-window support.
- `cleanupWindowState(webContentsId)` is called on `window.closed` to release memory.
- `safeSend(sender, channel, ...args)` skips sending if the window has already been destroyed.

### Renderer Process (React Hooks)

```ts
const [projectPath, setProjectPath] = useState('')
const [treeData, setTreeData] = useState<TreeData | null>(null)
const [isGenerating, setIsGenerating] = useState(false)
const [progress, setProgress] = useState(0)
const [logs, setLogs] = useState<string[]>([])
const [stats, setStats] = useState<Stats | null>(null)
const [formats, setFormats] = useState<OutputFormats>({ txt: true, json: false, md: false, xml: false })
const [splitEnabled, setSplitEnabled] = useState(true)
const [splitCount, setSplitCount] = useState(5)
const [attentionPatterns, setAttentionPatterns] = useState<string[]>([])
```

## Build Pipeline

```
Source (TS/TSX/CSS/HTML)
    |
    v
electron-vite (3 pipelines)
    |
    +-> main      (Node/Electron target, external deps)
    +-> preload   (isolated context bridge bundle)
    +-> renderer  (React + Tailwind, alias @ -> src/renderer/src)
    |
    v
Out: out/main, out/preload, out/renderer
    |
    v
electron-builder
    |
    +-> Windows: NSIS installer (.exe)
    +-> macOS:   DMG (.dmg)
    +-> Linux:   AppImage, Snap, DEB (.AppImage, .snap, .deb)
```

## Security Boundaries

1. **Context Isolation**: Preload runs in isolated context; renderer cannot access Node APIs directly.
2. **Typed API**: `IpcApi` interface ensures renderer only calls exposed channels.
3. **CSP**: Restricts remote content, inline styles allowed (`'unsafe-inline'`), scripts restricted to `'self'`.
4. **Sandbox**: Disabled (`sandbox: false`) because preload requires Node integration for `fs` and `path`; security relies on context isolation + typed API instead.
