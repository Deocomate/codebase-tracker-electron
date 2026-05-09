import fs from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'
import { IgnoreRules } from './ignoreRules'
import { isTextFile, readTextFile } from './fileUtils'

const PREVIEW_CONTENT_MAX_BYTES = 512 * 1024
const PREVIEW_CONTENT_BUDGET_MS = 650

export interface FileEntry {
  absPath: string
  relPath: string
  source?: 'global' | 'search'
  tokens?: number
}

export interface SearchOptions {
  quickOnly?: boolean
  shouldCancel?: () => boolean
}

interface SearchKeyword {
  label: string
  query: string
}

export class SearchEngine {
  private textFiles: FileEntry[] | null = null
  private textFilesPromise: Promise<FileEntry[]> | null = null
  private searchableContentCache = new Map<string, Promise<string | null>>()
  private walkTick = 0

  constructor(
    private projectPath: string,
    private ignoreRules: IgnoreRules
  ) {}

  warmIndex(): void {
    void this.getTextFiles().catch(() => undefined)
  }

  async search(keywords: string[], options: SearchOptions = {}): Promise<FileEntry[]> {
    const lowerKeywords = this.normalizeKeywords(keywords)
    if (lowerKeywords.length === 0) return []

    const results: FileEntry[] = []
    const seen = new Set<string>()
    const files = await this.getTextFiles()
    if (options.shouldCancel?.()) return results

    for (const file of files) {
      if (options.shouldCancel?.()) return results
      if (seen.has(file.absPath)) continue

      const isMatch = await this.fileMatchesAnyKeyword(file, lowerKeywords, Boolean(options.quickOnly))
      if (isMatch) {
        seen.add(file.absPath)
        results.push(file)
      }
    }

    return results
  }

  async searchPreview(
    keyword: string,
    maxResults = 50,
    options: SearchOptions = {}
  ): Promise<FileEntry[]> {
    const lowerKeywords = this.normalizeKeywords([keyword])
    if (lowerKeywords.length === 0) return []

    const limit = Math.max(1, Math.floor(maxResults))
    const results: FileEntry[] = []
    const seen = new Set<string>()
    const files = await this.getTextFiles()
    if (options.shouldCancel?.()) return this.enrichResultsWithTokens(results)

    for (const file of files) {
      if (options.shouldCancel?.()) return this.enrichResultsWithTokens(results)
      if (seen.has(file.absPath)) continue
      if (!this.pathMatchesAnyKeyword(file, lowerKeywords)) continue

      seen.add(file.absPath)
      results.push(file)
      if (results.length >= limit) return this.enrichResultsWithTokens(results)
    }

    if (options.quickOnly) return this.enrichResultsWithTokens(results)

    const contentStartMs = Date.now()
    for (const file of files) {
      if (options.shouldCancel?.()) return this.enrichResultsWithTokens(results)
      if (Date.now() - contentStartMs > PREVIEW_CONTENT_BUDGET_MS) return this.enrichResultsWithTokens(results)
      if (seen.has(file.absPath)) continue

      const lowerContent = await this.readLowerContent(file.absPath, PREVIEW_CONTENT_MAX_BYTES)
      if (options.shouldCancel?.()) return this.enrichResultsWithTokens(results)
      if (!lowerContent || !lowerKeywords.some((keyword) => lowerContent.includes(keyword))) continue

      seen.add(file.absPath)
      results.push(file)
      if (results.length >= limit) return this.enrichResultsWithTokens(results)
    }

    return this.enrichResultsWithTokens(results)
  }

  private async enrichResultsWithTokens(results: FileEntry[]): Promise<FileEntry[]> {
    return Promise.all(results.map(async (file) => {
      try {
        const stat = await fs.stat(file.absPath)
        return { ...file, tokens: Math.ceil(stat.size / 4) }
      } catch {
        return { ...file, tokens: 0 }
      }
    }))
  }

  async getSearchStats(
    keywords: string[],
    options: SearchOptions = {}
  ): Promise<Record<string, number>> {
    const searchKeywords = this.normalizeSearchKeywords(keywords)
    const stats: Record<string, number> = {}

    for (const keyword of searchKeywords) {
      stats[keyword.label] = 0
    }

    if (searchKeywords.length === 0) return stats

    const files = await this.getTextFiles()
    if (options.shouldCancel?.()) return stats

    for (const file of files) {
      if (options.shouldCancel?.()) return stats

      const searchablePath = this.normalizeSearchText(file.relPath)
      const contentKeywords: SearchKeyword[] = []

      for (const keyword of searchKeywords) {
        if (searchablePath.includes(keyword.query)) {
          stats[keyword.label] += 1
        } else {
          contentKeywords.push(keyword)
        }
      }

      if (!options.quickOnly && contentKeywords.length > 0) {
        const lowerContent = await this.readLowerContent(file.absPath)
        if (options.shouldCancel?.()) return stats

        if (lowerContent) {
          for (const keyword of contentKeywords) {
            if (lowerContent.includes(keyword.query)) {
              stats[keyword.label] += 1
            }
          }
        }
      }
    }

    return stats
  }

  private normalizeKeywords(keywords: string[]): string[] {
    const seen = new Set<string>()
    return keywords
      .filter((keyword): keyword is string => typeof keyword === 'string')
      .map((keyword) => this.normalizeSearchText(keyword))
      .filter((keyword) => {
        if (!keyword || seen.has(keyword)) return false
        seen.add(keyword)
        return true
      })
  }

  private normalizeSearchKeywords(keywords: string[]): SearchKeyword[] {
    const seen = new Set<string>()
    return keywords
      .filter((keyword): keyword is string => typeof keyword === 'string')
      .map((keyword) => keyword.trim())
      .filter((keyword) => {
        if (!keyword || seen.has(keyword)) return false
        seen.add(keyword)
        return true
      })
      .map((label) => ({ label, query: this.normalizeSearchText(label) }))
      .filter((keyword) => keyword.query.length > 0)
  }

  private async getTextFiles(): Promise<FileEntry[]> {
    if (this.textFiles) return this.textFiles
    if (!this.textFilesPromise) {
      this.textFilesPromise = this.collectTextFiles()
    }

    this.textFiles = await this.textFilesPromise
    return this.textFiles
  }

  private async collectTextFiles(): Promise<FileEntry[]> {
    const files: FileEntry[] = []
    await this.walkFiles('', files)
    return files
  }

  private async walkFiles(relDir: string, files: FileEntry[]): Promise<void> {
    await this.yieldOccasionally()

    const absDir = relDir ? path.join(this.projectPath, relDir) : this.projectPath
    let entries: Dirent[]

    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch {
      return
    }

    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      const name = entry.name
      if (name === '_codebase') continue

      const absPath = path.join(absDir, name)
      const relPath = relDir ? `${relDir}/${name}` : name

      if (entry.isDirectory()) {
        if (this.ignoreRules.isGloballyIgnoredByRelPath(relPath, true)) continue
        await this.walkFiles(relPath, files)
        continue
      }

      if (this.ignoreRules.isGloballyIgnoredByRelPath(relPath, false)) continue
      if (!isTextFile(relPath)) continue
      files.push({ absPath, relPath, source: 'search' })
    }
  }

  private async yieldOccasionally(): Promise<void> {
    this.walkTick += 1
    if (this.walkTick % 100 !== 0) return
    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  private async fileMatchesAnyKeyword(
    file: FileEntry,
    lowerKeywords: string[],
    quickOnly: boolean
  ): Promise<boolean> {
    if (this.pathMatchesAnyKeyword(file, lowerKeywords)) return true
    if (quickOnly) return false

    const lowerContent = await this.readLowerContent(file.absPath)
    return Boolean(lowerContent && lowerKeywords.some((keyword) => lowerContent.includes(keyword)))
  }

  private pathMatchesAnyKeyword(file: FileEntry, lowerKeywords: string[]): boolean {
    const searchablePath = this.normalizeSearchText(file.relPath)
    return lowerKeywords.some((keyword) => searchablePath.includes(keyword))
  }

  private async readLowerContent(absPath: string, maxBytes?: number): Promise<string | null> {
    try {
      if (typeof maxBytes === 'number') {
        const stat = await fs.stat(absPath)
        if (stat.size > maxBytes) return null
      }

      let cached = this.searchableContentCache.get(absPath)
      if (!cached) {
        cached = readTextFile(absPath)
          .then((content) => this.normalizeSearchText(content))
          .catch(() => null)
        this.searchableContentCache.set(absPath, cached)
      }

      return await cached
    } catch {
      return null
    }
  }

  private normalizeSearchText(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[đĐ]/g, 'd')
      .replace(/[\u0300-\u036f]/g, '')
      .normalize('NFC')
      .toLowerCase()
  }
}
