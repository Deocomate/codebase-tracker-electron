---
phase: 1
title: "Update Data Schema and Initialize Instructions Template"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Data Schema and Instructions Template

## Overview

Extend the `Settings` interface in `IgnoreRules` with `instructions: { enabled: boolean }`, bump `schema_version` to 10, auto-create `_codebase/instructions.md` on project init. Follows the exact same pattern as `ensurePromptFileExists()`.

## Requirements

- Functional: Schema migration for old projects (v9 → v10), auto-create template file, default disabled
- Non-functional: Zero breaking changes, backward compatible with existing `_codebase/settings.json`

## Architecture

No new architectural patterns — extends existing `IgnoreRules` → `Settings` → file management pipeline:

```
IgnoreRules.initialize()
  → _loadSettings()        // loads settings.json, runs _ensureSchema()
  → _ensureSchema()        // migrates v9→v10, fills defaults
  → ensureInstructionsFileExists()  // NEW: creates instructions.md if missing
```

## Related Code Files

- **Modify:** `src/main/core/ignoreRules.ts`
- **Create:** (auto-created at runtime) `{project}/_codebase/instructions.md`

## Implementation Steps

### 1. Add const and default content

```typescript
const INSTRUCTIONS_FILENAME = 'instructions.md'

const DEFAULT_INSTRUCTIONS_CONTENT = `# Project Instructions for LLMs

## Context
[Describe your project briefly — what it does, tech stack, key domains]

## Conventions
- Code style: [e.g. functional components, TypeScript strict mode]
- Naming: [e.g. kebab-case files, PascalCase components]
- Architecture: [e.g. Electron main/renderer, Worker process pattern]

## Rules for AI
- When suggesting code, follow the conventions above
- Prefer existing patterns over new abstractions
- [Add your own rules here]
`
```

### 2. Update Settings interface and DEFAULT_SETTINGS

In the `Settings` interface, add before the closing `}`:

```typescript
instructions: {
  enabled: boolean
}
```

In `DEFAULT_SETTINGS`, change `schema_version: 9` to `schema_version: 10` and add:

```typescript
instructions: { enabled: false },
```

### 3. Add schema migration in `_ensureSchema()`

Add after the existing v8→v9 migration block:

```typescript
if ((this.settings.schema_version ?? 9) < 10) {
  this.settings.schema_version = 10
  this.settings.instructions = { enabled: false }
}
```

### 4. Add Instructions File Manager methods

Add after the Prompt File Manager section:

```typescript
// ==================== Instructions File Manager ====================

private getInstructionsFilePath(): string {
  return path.join(this.codebaseDir, INSTRUCTIONS_FILENAME)
}

async ensureInstructionsFileExists(): Promise<void> {
  const fp = this.getInstructionsFilePath()
  try {
    await fs.access(fp)
  } catch {
    await fs.writeFile(fp, DEFAULT_INSTRUCTIONS_CONTENT, 'utf-8')
  }
}

getInstructionsConfig(): { enabled: boolean } {
  return {
    enabled: Boolean(this.settings.instructions?.enabled ?? false)
  }
}

async updateInstructionsConfig(enabled: boolean, persist = true): Promise<void> {
  this.settings.instructions = { enabled: Boolean(enabled) }
  if (persist) await this._saveSettings()
}

async readInstructionsFile(): Promise<string | null> {
  if (!this.settings.instructions?.enabled) return null
  try {
    return await fs.readFile(this.getInstructionsFilePath(), 'utf-8')
  } catch {
    return null
  }
}
```

### 5. Call `ensureInstructionsFileExists()` in `initialize()`

Add after `await this.ensurePromptFileExists()`:

```typescript
await this.ensureInstructionsFileExists()
```

## Success Criteria

- [ ] `schema_version` 10 persisted in `settings.json` for new and migrated projects
- [ ] `instructions: { enabled: false }` present in all settings files after migration
- [ ] `_codebase/instructions.md` auto-created with default template on first `initialize()`
- [ ] `getInstructionsConfig()` returns correct enabled state
- [ ] `readInstructionsFile()` returns content when enabled, null when disabled or file missing

## Risk Assessment

- **Risk:** Old projects with custom `settings.json` might have unexpected keys → **Mitigation:** `_ensureSchema()` + spread defaults handles missing keys, existing extra keys preserved
- **Risk:** Template content might not match user's language preference → **Mitigation:** Template is in English (universal for LLMs), user edits it freely
