---
phase: 3
title: "Upgrade Combiner and Formatters"
status: completed
priority: P1
effort: "2h"
dependencies: ["1", "2"]
---

# Phase 3: Combiner and Formatter Upgrades

## Overview

Read `instructions.md` content in `FileCombiner.combine()` and pass it to all formatters. Each formatter injects the instructions at the top of the output in format-appropriate syntax.

## Requirements

- Functional: Instructions appear at the top of every exported file when enabled
- Non-functional: Single FS read per generation (not per format), graceful degradation when file missing

## Architecture

```
Combiner.combine()
  ├── Read instructions.md (once)
  ├── For each format:
  │     ├── TXT:  "# PROJECT" → "=== SYSTEM INSTRUCTIONS ===" → file content
  │     ├── MD:   "# PROJECT" → "## System Instructions" → file content
  │     ├── JSON: { "metadata": { "system_instructions": "..." } }
  │     └── XML:  <codebase> → <system_instructions> → files
```

## Related Code Files

- **Modify:** `src/main/core/combiner.ts`
- **Modify:** `src/main/core/formatters/baseFormatter.ts`
- **Modify:** `src/main/core/formatters/txtFormatter.ts`
- **Modify:** `src/main/core/formatters/markdownFormatter.ts`
- **Modify:** `src/main/core/formatters/jsonFormatter.ts`
- **Modify:** `src/main/core/formatters/xmlFormatter.ts`

## Implementation Steps

### 1. Combiner: Read instructions, pass to formatters

In `combine()`, after the `const splitCount = ...` line, add:

```typescript
let instructionContent: string | null = null
if (ignoreRules.settings.instructions?.enabled) {
  instructionContent = await ignoreRules.readInstructionsFile()
}
```

Then update the formatter call inside the format loop (around line 129):

```typescript
chars = await formatter.writeOutput(writeStream, configName, timestamp, textFiles, instructionContent)
```

### 2. BaseFormatter: Update signatures for both methods

In `baseFormatter.ts`, update both `formatOutput` and `writeOutput` signatures to accept `instructionContent`:

```typescript
abstract formatOutput(
  configName: string,
  timestamp: string,
  files: { absPath: string; relPath: string; isAttention?: boolean }[],
  instructionContent?: string | null     // NEW
): Promise<string>

async writeOutput(
  fileHandle: { write: (s: string) => boolean },
  configName: string,
  timestamp: string,
  files: { absPath: string; relPath: string; isAttention?: boolean }[],
  instructionContent?: string | null     // NEW
): Promise<number> {
  const content = await this.formatOutput(configName, timestamp, files, instructionContent)
  fileHandle.write(content)
  return content.length
}
```

### 3. TXT Formatter: Update signatures and inject instructions

In `txtFormatter.ts`, update BOTH `formatOutput` and `writeOutput` signatures. Then in `writeOutput`, inject the instructions:

```typescript
async formatOutput(
  configName: string,
  timestamp: string,
  files: { absPath: string; relPath: string; isAttention?: boolean }[],
  instructionContent?: string | null
): Promise<string> {
  // Update signature to match BaseFormatter, even if not directly used
  // ...
}

async writeOutput(
  fileHandle: { write: (s: string) => boolean },
  configName: string,
  timestamp: string,
  files: { absPath: string; relPath: string; isAttention?: boolean }[],
  instructionContent?: string | null
): Promise<number> {
  let chars = 0
  const header = `# ${configName} | ${files.length} files | ${timestamp}\n\n`
  fileHandle.write(header)
  chars += header.length

  if (instructionContent) {
    const instructions = `\n${'='.repeat(64)}\nSYSTEM INSTRUCTIONS\n${'='.repeat(64)}\n\n${instructionContent}\n\n${'='.repeat(64)}\n\n`
    fileHandle.write(instructions)
    chars += instructions.length
  }

  // ... rest unchanged (attention marker + file loop)
```

### 4. Markdown Formatter: Update signatures and inject instructions

In `markdownFormatter.ts`, update BOTH `formatOutput` and `writeOutput` signatures:

```typescript
async formatOutput(
  configName: string,
  timestamp: string,
  files: { absPath: string; relPath: string; isAttention?: boolean }[],
  instructionContent?: string | null
): Promise<string> {
  // Update signature to match BaseFormatter
  // ...
}

async writeOutput(
  fileHandle: { write: (s: string) => boolean },
  configName: string,
  timestamp: string,
  files: { absPath: string; relPath: string; isAttention?: boolean }[],
  instructionContent?: string | null
): Promise<number> {
  let chars = 0
  const header = `# ${configName}\n\n> Generated: ${timestamp} | Files: ${files.length}\n\n---\n\n`
  fileHandle.write(header)
  chars += header.length

  if (instructionContent) {
    const instructions = `## System Instructions\n\n${instructionContent}\n\n---\n\n`
    fileHandle.write(instructions)
    chars += instructions.length
  }

  // ... rest unchanged
```

### 5. JSON Formatter: Update signatures and inject instructions

In `jsonFormatter.ts`, update BOTH `formatOutput` and `writeOutput` signatures:

```typescript
async formatOutput(
  configName: string,
  timestamp: string,
  files: { absPath: string; relPath: string; isAttention?: boolean }[],
  instructionContent?: string | null
): Promise<string> {
  // Update signature to match BaseFormatter
  // ...
}

async writeOutput(
  fileHandle: { write: (s: string) => boolean },
  configName: string,
  timestamp: string,
  files: { absPath: string; relPath: string; isAttention?: boolean }[],
  instructionContent?: string | null
): Promise<number> {
  let chars = 0

  const metadata: Record<string, unknown> = {
    config: configName,
    files_count: files.length,
    generated_at: timestamp
  }

  if (instructionContent) {
    metadata.system_instructions = instructionContent
  }

  const header = `{\n  "metadata": ${JSON.stringify(metadata, null, 2).replace(/\n/g, '\n  ')},\n  "files": [\n`
  // ... rest unchanged
```

### 6. XML Formatter: Update signatures and inject instructions

In `xmlFormatter.ts`, update BOTH `formatOutput` and `writeOutput` signatures:

```typescript
async formatOutput(
  configName: string,
  timestamp: string,
  files: { absPath: string; relPath: string; isAttention?: boolean }[],
  instructionContent?: string | null
): Promise<string> {
  // Update signature to match BaseFormatter
  // ...
}

async writeOutput(
  fileHandle: { write: (s: string) => boolean },
  configName: string,
  timestamp: string,
  files: { absPath: string; relPath: string; isAttention?: boolean }[],
  instructionContent?: string | null
): Promise<number> {
  let chars = 0
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n<codebase config="${escapeXml(configName)}" files="${files.length}" generated="${timestamp}">\n`
  fileHandle.write(header)
  chars += header.length

  if (instructionContent) {
    const safeInstructions = instructionContent.replace(/]]>/g, ']]]]><![CDATA[>')
    const line = `  <system_instructions><![CDATA[${safeInstructions}]]></system_instructions>\n`
    fileHandle.write(line)
    chars += line.length
  }

  // ... rest unchanged (file loop + footer)
```

## Success Criteria

- [ ] TXT output has `==== SYSTEM INSTRUCTIONS ====` block when enabled
- [ ] MD output has `## System Instructions` section when enabled
- [ ] JSON output has `system_instructions` in metadata when enabled
- [ ] XML output has `<system_instructions>` element when enabled
- [ ] No instructions block when disabled or file missing
- [ ] Existing behavior unchanged (attention markers, file content, streaming)
- [ ] TypeScript compilation passes

## Risk Assessment

- **Risk:** Large `instructions.md` bloats output → **Mitigation:** User controls content, typical instructions are < 2KB
- **Risk:** CDATA escaping edge cases in XML → **Mitigation:** Apply same `]]>` escaping already used for file content
- **Risk:** Instructions might affect file splitting logic → **Mitigation:** FileSplitter splits by char count regardless of content semantics, no impact
