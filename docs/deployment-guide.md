# Deployment Guide — Codebase Tracker

## Prerequisites

- Node.js 20+ and npm
- Windows: Python (for native module builds) and Visual Studio Build Tools (optional)
- macOS: Xcode Command Line Tools
- Linux: `build-essential`, `libnss3`, `libatk-bridge2.0-0`

## Development

Install dependencies:

```bash
npm install
```

Start the dev server (hot reload for renderer):

```bash
npm run dev
```

Type-check separately:

```bash
npm run typecheck
```

Lint:

```bash
npm run lint
```

Format:

```bash
npm run format
```

## Building

### Windows (NSIS)

```bash
npm run build:win
```

- Produces an NSIS installer `.exe` in `dist/`.
- Artifact name: `codebase-tracker-${version}-setup.exe`.
- Shortcut name: `Codebase Tracker`.
- One-click install disabled; user can choose install directory.
- Requires `resources/icon.ico`.

### macOS (DMG)

```bash
npm run build:mac
```

- Produces a DMG in `dist/`.
- Artifact name: `codebase-tracker-${version}.dmg`.
- Requires `resources/icon.icns`.
- Notarization is currently disabled (`notarize: false`).
- Sandbox entitlements inherited from `build/entitlements.mac.plist`.

### Linux (AppImage + Snap + DEB)

```bash
npm run build:linux
```

- Produces AppImage, Snap, and DEB packages in `dist/`.
- DEB package depends on:
  - `xclip`
  - `wl-clipboard`
- These are required for the auto-copy file-to-clipboard feature on Linux.
- Icon: `resources/icon.png`.

### Unpacked Build

```bash
npm run build:unpack
```

- Builds and outputs an unpackaged directory (`dist/win-unpacked` etc.) for inspection without installer creation.

## Build Scripts Reference

| Script | Command | Purpose |
|--------|---------|---------|
| `clean` | `npx rimraf dist out` | Remove build artifacts. |
| `build` | `clean + typecheck + electron-vite build + electron-builder --win` | Full Windows build. |
| `build:win` | Same as `build` | Explicit Windows target. |
| `build:mac` | `clean + electron-vite build + electron-builder --mac` | macOS target. |
| `build:linux` | `clean + electron-vite build + electron-builder --linux` | Linux target. |
| `build:unpack` | `clean + build + electron-builder --dir` | Unpacked directory. |

## Platform-Specific Notes

### Windows

- NSIS installer runs after finish (`runAfterFinish: true`).
- Creates desktop and start menu shortcuts.
- Uses `powershell.exe` for clipboard file copy.

### macOS

- Info.plist extended properties request camera, microphone, Documents, and Downloads access (may be trimmed if unnecessary).
- Uses `osascript` for clipboard file copy.

### Linux

- Wayland switches are appended at runtime (`ozone-platform-hint=auto`, `WaylandWindowDecorations`).
- Hardware acceleration is disabled globally to avoid rendering issues.
- Clipboard fallback chain:
  1. `wl-copy` (Wayland)
  2. `xclip` (X11)
  3. Plain text path list via Electron `clipboard.writeText`

## Auto-Updater

- Configured with generic provider (`https://example.com/auto-updates`).
- Replace `publish.url` in `electron-builder.yml` with your actual update server before release.
- Currently inactive until a real endpoint is provided.

## Electron Mirror

- `electron-builder.yml` uses `https://npmmirror.com/mirrors/electron/` for downloads.
- Replace or remove this if you do not need a Chinese mirror.

## Packaging Checklist

- [ ] Bump `version` in `package.json`.
- [ ] Ensure icons exist in `resources/` (`.ico`, `.icns`, `.png`).
- [ ] Verify `electron-builder.yml` appId and publish URL.
- [ ] Run `npm run typecheck` with zero errors.
- [ ] Run `npm run lint`.
- [ ] Build for target platform(s).
- [ ] Test installer / portable output on a clean VM.
- [ ] Update changelog / release notes.
