# WSL Path Support Implementation Summary

**Date**: May 9, 2026  
**Feature**: Windows Subsystem for Linux (WSL) Path Mapping Support  
**Status**: ✅ Complete

## Overview

Implemented comprehensive WSL support allowing Codebase Tracker to seamlessly work with Linux paths on Windows. Users can now enter paths like `/home/user/project` and the application automatically converts them to Windows UNC paths for file system access.

## Implementation Details

### 1. Path Resolver Utility (`src/main/core/path-resolver.ts`)

**Purpose**: Core utility for converting Linux/WSL paths to Windows UNC paths.

**Key Functions**:
- `resolveWorkspacePath(inputPath, wslConfig)` - Main resolver
  - Detects if path is Linux format (starts with `/`)
  - Converts `/home/user/project` → `\\wsl.localhost\Ubuntu-24.04\home\user\project`
  - Handles edge cases: Windows paths, trailing backslashes, whitespace
  
- `isValidWslBasePath(basePath)` - Validates UNC format
  - Accepts `\\wsl.localhost\` or `\\wsl$\` formats
  
- `formatWslBasePath(basePath)` - Normalizes base path
  - Removes trailing backslash, trims whitespace

### 2. Settings Extension (`src/main/core/ignoreRules.ts`)

**Changes**:
- Updated `Settings` interface to include WSL config:
  ```typescript
  wsl: {
    enabled: boolean
    basePath: string
  }
  ```
- Updated schema version from 7 → 8
- Added migration logic for backward compatibility
- Added methods:
  - `getWslConfig()` - Retrieve WSL settings
  - `updateWslConfig(enabled, basePath)` - Save WSL settings

### 3. IPC Handlers (`src/main/ipcHandlers.ts`)

**New Handlers**:
- `wsl:getConfig` - Returns current WSL configuration
- `wsl:saveConfig` - Saves WSL configuration with validation
  - Validates base path format
  - Returns helpful error messages

**Modified Handlers**:
- `project:load` - Now uses path resolver
  - Resolves input path using WSL settings
  - Provides WSL-specific error messages for path failures

### 4. Preload API (`src/preload/index.ts`)

**New Types**:
- `WslConfigResponse` - Response type for WSL config operations

**New Methods**:
- `get_wsl_config()` - IPC call to get WSL config
- `save_wsl_config(enabled, basePath)` - IPC call to save WSL config

### 5. UI Components

#### WslSettingsModal (`src/renderer/src/WslSettingsModal.tsx`)

**Features**:
- Modal dialog for WSL configuration
- Enable/Disable checkbox
- WSL Base Path input field (only enabled when WSL is on)
- Input validation:
  - Checks path format starts with `\\wsl.localhost\` or `\\wsl$\`
  - Required field validation when enabled
- User-friendly error messages in UI
- Save/Cancel buttons with loading state

**Props**:
- `isOpen` - Modal visibility
- `config` - Current WSL configuration
- `onClose` - Callback when modal closes
- `onSave` - Callback when user saves config
- `isSaving` - Loading state
- `error` - Error message display

#### App.tsx Updates

**New State**:
- `wslModalOpen` - Modal visibility state
- `wslConfig` - Current WSL configuration
- `wslModalLoading` - Save operation state
- `wslModalError` - Error message state

**New Features**:
- WSL Configuration card in Workspace Settings
  - Shows current status (enabled/disabled)
  - Displays base path when enabled
  - "Configure" button to open modal
- Effect hook to load WSL config on mount
- Handler for saving WSL config with error handling
- Modal component integrated into render

**UI Flow**:
```
User clicks "Configure" button
    ↓
WslSettingsModal opens with current config
    ↓
User toggles Enable checkbox (optional)
    ↓
If enabled, user enters Base Path
    ↓
User clicks "Save"
    ↓
Validation runs
    ↓
If valid: IPC call → save to settings.json
If invalid: Show error message
    ↓
On success: Update app state, show toast, close modal
```

## File Changes Summary

### New Files
- `src/main/core/path-resolver.ts` (127 lines)
- `src/renderer/src/WslSettingsModal.tsx` (116 lines)

### Modified Files
- `src/main/core/ignoreRules.ts` - Added WSL config to Settings interface and schema v8 migration
- `src/main/ipcHandlers.ts` - Added WSL handlers, path resolver integration
- `src/preload/index.ts` - Added WSL IPC methods and types
- `src/renderer/src/App.tsx` - Added WSL UI, state, and handlers

### Documentation Updates
- `docs/system-architecture.md` - Added WSL path resolver to module list and IPC table
- `docs/codebase-summary.md` - Documented path-resolver module
- `docs/project-changelog.md` - Added v2026-05-09 entry with WSL feature details
- `docs/project-roadmap.md` - Added Phase 3 for WSL support (marked complete)

## Error Handling

### Validation Points

1. **WSL Base Path Format**
   - Must start with `\\wsl.localhost\` or `\\wsl$\`
   - Rejected formats show specific error message

2. **Path Resolution Failures**
   - If resolved path doesn't exist:
     - Generic error: "Không thể truy cập thư mục..."
     - Helpful message: Check WSL Base Path or ensure WSL is running
   - Non-existence detection via `fs.stat()`

3. **WSL Config Save**
   - Path format validation before save
   - IPC error propagation to UI

### User-Friendly Messages

- Vietnamese UI with clear instructions
- Helpful error messages guide users to fix issues
- Placeholder examples in input fields
- Info box explaining WSL feature

## Testing Scenarios

### Case 1: WSL Disabled (Default)
- Input Windows path: `C:\Users\Desktop` → Works normally
- Input Linux path: `/home/user/project` → Shows error (path not found)
- ✅ Expected: Distinguishes between Windows and Linux paths

### Case 2: WSL Enabled (Valid Config)
- Base Path: `\\wsl.localhost\Ubuntu-24.04`
- Input Linux path: `/home/minhlong/Desktop` → Resolves to `\\wsl.localhost\Ubuntu-24.04\home\minhlong\Desktop`
- Tree loads successfully
- ✅ Expected: Seamless WSL path handling

### Case 3: WSL Enabled (Invalid Base Path)
- Base Path: `C:\wsl` (wrong format) → Validation error during save
- ✅ Expected: User sees clear error message

### Case 4: WSL Enabled (WSL Offline)
- Base Path: Valid format, but WSL not running
- Input Linux path: Shows error "Không thể truy cập thư mục..."
- ✅ Expected: User guided to start WSL

### Case 5: WSL Enabled (Windows Path Input)
- Base Path: `\\wsl.localhost\Ubuntu-24.04`
- Input: `C:\Users\Desktop` (Windows path)
- → Resolver detects it's already Windows path, returns unchanged
- ✅ Expected: No double-mapping, path works correctly

## Settings Persistence

**Schema v8 Structure**:
```json
{
  "schema_version": 8,
  "wsl": {
    "enabled": false,
    "basePath": "\\\\wsl.localhost\\Ubuntu-24.04"
  },
  // ... other settings ...
}
```

**Migration**: 
- Old settings (v7) automatically migrated to v8 on first load
- New projects start with v8 schema
- Default: WSL disabled, standard base path

## Architecture Integration

```
User Input: /home/user/project
    ↓
loadProjectFromPath()
    ↓
window.api.load_project(folderPath)
    ↓
ipcHandlers.ts: project:load
    ↓
resolveWorkspacePath(folderPath, wslConfig)
    ↓
Check if enabled & path is Linux format
    ↓
Convert to: \\wsl.localhost\Ubuntu-24.04\home\user\project
    ↓
fs.stat() verify path exists
    ↓
Create IgnoreRules & build tree
    ↓
Return tree to renderer
```

## Quality Assurance

✅ **TypeScript Compilation**: No errors or warnings  
✅ **Type Safety**: All IPC interfaces properly typed  
✅ **Error Handling**: Comprehensive error handling with user-friendly messages  
✅ **Backward Compatibility**: Schema migration handles old settings  
✅ **Cross-Platform**: Path handling works on Windows, Linux, macOS  
✅ **Edge Cases Handled**:
  - Trailing slashes
  - Whitespace trimming
  - Windows path detection
  - Invalid base path format
  - Non-existent paths

## Usage Instructions for Users

1. **Enable WSL Mode**:
   - Click "Configure" button in Workspace Settings
   - Check "Enable WSL Mode"

2. **Set WSL Base Path**:
   - Example for Windows 11: `\\wsl.localhost\Ubuntu-24.04`
   - Example for Windows 10 or custom name: `\\wsl$\Ubuntu-24.04`
   - Can be found by running `wsl -l -v` in PowerShell

3. **Use Linux Paths**:
   - Enter paths like `/home/user/project`
   - App automatically converts them internally
   - Tree displays with original Linux paths for readability

4. **Troubleshooting**:
   - If error: Check WSL Base Path matches your WSL distribution name
   - Ensure WSL distribution is running: `wsl -l -v`
   - Verify path exists in WSL: `wsl ls /path/to/project`

## Future Enhancements

- Auto-detect WSL installation and suggest base path
- Multiple WSL distributions support
- WSL 2 vs WSL 1 auto-detection
- Cached path resolution for performance
- Recent WSL paths history in UI
