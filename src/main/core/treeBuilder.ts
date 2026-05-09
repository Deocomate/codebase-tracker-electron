import path from 'path'
import fs from 'fs/promises'
import { Dirent } from 'fs'
import { IgnoreRules } from './ignoreRules'

const MAX_CHILDREN_DISPLAY = 10

export class TreeBuilder {
  async buildTree(
    projectPath: string,
    ignoreRules: IgnoreRules,
    maxDepth?: number
  ): Promise<string> {
    const lines: string[] = ['.']
    await this._walkDir(projectPath, projectPath, lines, '', 0, maxDepth, ignoreRules)
    return lines.join('\n')
  }

  private async _walkDir(
    dirPath: string,
    projectRoot: string,
    lines: string[],
    prefix: string,
    depth: number,
    maxDepth: number | undefined,
    ignoreRules: IgnoreRules
  ): Promise<void> {
    if (maxDepth !== undefined && depth > maxDepth) return

    let entries: Dirent[]
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }

    // Sort: dirs first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    // Filter hidden dirs and ignored entries
    const filtered: Dirent[] = []
    for (const entry of entries) {
      if (entry.name === '_codebase') continue
      if (entry.name.startsWith('.') && entry.isDirectory()) continue

      const relPath = path.relative(projectRoot, path.join(dirPath, entry.name)).replace(/\\/g, '/')
      if (ignoreRules.isBaseIgnored(relPath, entry.isDirectory())) continue

      filtered.push(entry)
    }

    const total = filtered.length
    const truncated = depth > 0 && total > MAX_CHILDREN_DISPLAY
    const display = truncated ? filtered.slice(0, MAX_CHILDREN_DISPLAY) : filtered
    const renderCount = display.length + (truncated ? 1 : 0)

    for (let i = 0; i < display.length; i++) {
      const entry = display[i]
      const isLast = i === renderCount - 1
      const connector = isLast ? '└── ' : '├── '

      if (entry.isDirectory()) {
        lines.push(`${prefix}${connector}${entry.name}/`)
        const newPrefix = prefix + (isLast ? '    ' : '│   ')
        await this._walkDir(
          path.join(dirPath, entry.name),
          projectRoot,
          lines,
          newPrefix,
          depth + 1,
          maxDepth,
          ignoreRules
        )
      } else {
        lines.push(`${prefix}${connector}${entry.name}`)
      }
    }

    if (truncated) {
      lines.push(`${prefix}└── ... (+${total - MAX_CHILDREN_DISPLAY} more)`)
    }
  }
}
