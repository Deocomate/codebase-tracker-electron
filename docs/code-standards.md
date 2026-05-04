# Code Standards — Codebase Tracker

## File Naming

- Use **kebab-case** for all file names.
- Names should be self-documenting and describe the file's purpose, even if long.
  - Good: `file-splitter.ts`, `base-formatter.ts`, `ignore-rules.ts`
  - Bad: `utils.ts`, `helpers.ts`, `lib.ts`

## File Size

- Keep individual code files **under 200 lines** where practical.
- Split large files into smaller, focused modules.
- Extract utility functions into dedicated modules.
- Create dedicated service classes for distinct business logic.

## Language & Localization

- **Code**: English (variables, functions, classes, comments).
- **UI strings**: Vietnamese (renderer labels, logs, toast messages).
- **Logs/Errors**: Mixed; user-facing messages in Vietnamese, internal console logs in English.

## TypeScript

- Enable strict mode via `tsconfig` project references (`tsconfig.node.json`, `tsconfig.web.json`).
- Prefer explicit return types on public methods.
- Avoid `any`; use `unknown` + type guards when types are uncertain.
- Use interfaces for data shapes (`TreeData`, `Stats`, `IpcApi`).

## Import Conventions

- Use ES module `import` / `export`.
- Group imports: built-in Node -> external packages -> internal modules.
- Prefer named exports for utilities; default exports for React components.

## Error Handling

- Use `try/catch` for async I/O and wrap errors in user-friendly messages.
- Return `{ success, message }` or `{ error }` shapes from IPC handlers rather than throwing unhandled exceptions.
- Check `event.sender.isDestroyed()` before sending IPC events to avoid crashes on closed windows.

## Path Handling

- Always **normalize paths to forward slashes** for consistent keys and storage.
  - `normalizeForStorage(p)`: replaces `\\` with `/`.
  - `getRelativePath`: wraps `path.relative` + normalization.
- Use `path.join` for file system operations; normalize only for IDs, settings keys, and relative paths.

## Streaming vs Buffering

- **Streaming preferred** for large outputs to reduce memory pressure.
  - `TxtFormatter`, `MarkdownFormatter`, `XmlFormatter` override `writeOutput` to stream per-file chunks.
- **Buffering allowed** only when the format requires a single atomic document.
  - `JsonFormatter` previously buffered; now streams via `writeOutput` override to avoid OOM on large projects.

## State Management

- Main process uses **per-window Map state** in `ipcHandlers.ts` (`windowStates: Map<number, WindowState>`).
- Each window owns its own `IgnoreRules` instance and `cancelRef`; `cleanupWindowState` is called on `window.closed`.
- `safeSend` guards IPC delivery by checking `sender.isDestroyed()` before sending.

## Cooperative Cancellation

- Pass a shared `cancelRef: { cancelled: boolean }` object through long-running operations (`scanner`, `combiner`, `processor`).
- Check `cancelRef.cancelled` at loop boundaries; do not use `AbortController` for file system walks.

## Comment Stripping

- `BaseFormatter` supports optional blank-line and comment stripping.
- Comment markers are hard-coded in `COMMENT_MARKERS` map; extend this map to add new languages.
- Current coverage: Python, Shell, Ruby, YAML, JS/TS/JSX, Java, C/C++, C#, Go, Rust, Swift, Kotlin.

## React / Renderer

- Functional components with hooks.
- Use `useCallback` for stable handler references passed to child components.
- `TreeView` uses `@dnd-kit` sensors with distance constraint (`distance: 8`).
- Icons from `lucide-react`; no custom SVG icons in source.

## Security

- Renderer runs with `contextIsolation: true` and `sandbox: false` (required for native module access via preload).
- Preload validates `process.contextIsolated` before falling back.
- CSP restricts `default-src`, `script-src`, `style-src`, and `img-src`.
