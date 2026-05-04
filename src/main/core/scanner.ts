import fs from 'fs/promises'
import { Dirent } from 'fs'
import path from 'path'
import { IgnoreRules } from './ignoreRules'
import { isTextFile } from './fileUtils'

type ScanCallback = (message: string, progress: number) => void

interface FileEntry {
  absPath: string
  relPath: string
}

export class FileScanner {
  constructor(
    public projectPath: string,
    public ignoreRules: IgnoreRules
  ) {}

  private sortFilesByPriority(files: FileEntry[]): FileEntry[] {
    const roots = this.ignoreRules.getPriorityRoots()
    if (roots.length === 0) {
      return files.sort((a, b) => a.relPath.localeCompare(b.relPath))
    }

    const getPriorityIdx = (relPath: string): number => {
      let bestIdx = roots.length
      let bestLen = -1
      const p = relPath.replace(/\\/g, '/')
      for (let i = 0; i < roots.length; i++) {
        if (p === roots[i] || p.startsWith(roots[i] + '/')) {
          if (roots[i].length > bestLen) {
            bestLen = roots[i].length
            bestIdx = i
          }
        }
      }
      return bestIdx
    }

    return [...files].sort((a, b) => {
      const pa = getPriorityIdx(a.relPath)
      const pb = getPriorityIdx(b.relPath)
      if (pa !== pb) return pa - pb
      return a.relPath.localeCompare(b.relPath)
    })
  }

  async scan(
    callback?: ScanCallback,
    cancelRef?: { cancelled: boolean }
  ): Promise<{
    categorizedFiles: Record<string, FileEntry[]>
    ignoredItems: { absPath: string; relPath: string; reason: string }[]
    allFiles: string[]
  }> {
    const categorizedFiles: Record<string, FileEntry[]> = { codebase: [] }
    const ignoredItems: { absPath: string; relPath: string; reason: string }[] = []
    const allFiles: string[] = []

    callback?.('Discovering files based on your UI selection...', -1)

    await this._walkDir('', categorizedFiles, ignoredItems, allFiles, callback, cancelRef)

    if (cancelRef?.cancelled) {
      callback?.('Scan cancelled by user.', -1)
      return { categorizedFiles: {}, ignoredItems: [], allFiles: [] }
    }

    callback?.('Applying priority ordering...', -1)
    categorizedFiles.codebase = this.sortFilesByPriority(categorizedFiles.codebase)

    const total = categorizedFiles.codebase.length
    callback?.(`Scan complete! Found ${total} valid files.`, -1)

    return { categorizedFiles, ignoredItems, allFiles }
  }

  private async _walkDir(
    relDir: string,
    categorizedFiles: Record<string, FileEntry[]>,
    ignoredItems: { absPath: string; relPath: string; reason: string }[],
    allFiles: string[],
    callback?: ScanCallback,
    cancelRef?: { cancelled: boolean }
  ): Promise<void> {
    if (cancelRef?.cancelled) return

    const absDir = relDir ? path.join(this.projectPath, relDir) : this.projectPath
    let entries: Dirent[]

    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch {
      return // Permission denied etc
    }

    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      if (cancelRef?.cancelled) return

      const name = entry.name
      if (name === '_codebase') continue

      const absPath = path.join(absDir, name)
      const relPath = relDir ? `${relDir}/${name}` : name

      if (entry.isDirectory()) {
        const isIgnored = this.ignoreRules.isGloballyIgnoredByRelPath(relPath, true)

        if (isIgnored) {
          ignoredItems.push({ absPath, relPath, reason: 'global_ignore' })
          continue
        }

        const hasDescendant = this.ignoreRules.hasDescendantRule(relPath, this.ignoreRules.included_paths)
        const isSelected = this.ignoreRules.isPathSelected(relPath)
        if (!isSelected && !hasDescendant) {
          ignoredItems.push({ absPath, relPath, reason: 'explicit_exclude' })
          continue
        }

        allFiles.push(relPath)
        await this._walkDir(relPath, categorizedFiles, ignoredItems, allFiles, callback, cancelRef)
      } else {
        if (this.ignoreRules.isGloballyIgnoredByRelPath(relPath, false)) {
          ignoredItems.push({ absPath, relPath, reason: 'global_ignore' })
          continue
        }

        allFiles.push(relPath)

        if (!this.ignoreRules.isPathSelected(relPath)) {
          ignoredItems.push({ absPath, relPath, reason: 'explicit_exclude' })
          continue
        }

        if (isTextFile(relPath)) {
          categorizedFiles.codebase.push({ absPath, relPath })
        } else {
          ignoredItems.push({ absPath, relPath, reason: 'binary' })
        }
      }
    }
  }
}
