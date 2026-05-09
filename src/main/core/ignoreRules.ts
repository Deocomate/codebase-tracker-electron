import fs from 'fs/promises'
import path from 'path'
import type { Dirent } from 'fs'
import ignore, { Ignore } from 'ignore'

const SETTINGS_FILENAME = 'settings.json'

interface Settings {
  schema_version: number
  included_paths: string[]
  excluded_paths: string[]
  priority_roots: string[]
  global_ignore_patterns: string[]
  custom_ignore_patterns: string[]
  search_keywords: string[]
  search_cache: Record<string, string[]>
  split_config: {
    enabled: boolean
    split_count: number
    token_threshold: number
  }
  ui: {
    selected_formats: string[]
    split_enabled: boolean
    split_count: number
  }
  wsl: {
    enabled: boolean
    basePath: string
  }
  description: string
}

const DEFAULT_SETTINGS: Settings = {
  schema_version: 8,
  included_paths: [],
  excluded_paths: [],
  priority_roots: [],
  global_ignore_patterns: [
    '.git/', 'node_modules/', 'venv/', 'env/', '.venv/',
    '__pycache__/', '.pytest_cache/', '.mypy_cache/', '.ruff_cache/',
    'dist/', 'build/', 'out/', 'target/', 'coverage/',
    '.idea/', '.vscode/', '*.log', '*.bak', '*.swp', '*.tmp', '.DS_Store'
  ],
  custom_ignore_patterns: [],
  search_keywords: [],
  search_cache: {},
  split_config: { enabled: true, split_count: 5, token_threshold: 40000 },
  ui: { selected_formats: ['txt'], split_enabled: true, split_count: 5 },
  wsl: { enabled: false, basePath: '\\\\wsl.localhost\\Ubuntu-24.04' },
  description: 'Cấu hình gom mã nguồn dự án.'
}

export interface IgnorePreviewEntry {
  absPath: string
  relPath: string
  isDir: boolean
  source: 'ignore'
}

export class IgnoreRules {
  public projectPath: string
  private codebaseDir: string
  private settingsPath: string
  private baseIg: Ignore
  private customIg: Ignore
  private gitignoreSpec: Ignore | null = null
  public included_paths: string[] = []
  public excluded_paths: string[] = []
  public priority_roots: string[] = []
  public settings: Settings

  constructor(projectPath: string) {
    this.projectPath = projectPath
    this.codebaseDir = path.join(projectPath, '_codebase')
    this.settingsPath = path.join(this.codebaseDir, SETTINGS_FILENAME)
    this.baseIg = ignore().add(DEFAULT_SETTINGS.global_ignore_patterns)
    this.customIg = ignore()
    this.settings = this._deepClone(DEFAULT_SETTINGS)
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.codebaseDir, { recursive: true })
    await this._loadGitignore()
    await this._loadSettings()
    this._compileRules()
  }

  // ==================== Private: I/O ====================

  private async _loadGitignore(): Promise<void> {
    const gitignorePath = path.join(this.projectPath, '.gitignore')
    try {
      const content = await fs.readFile(gitignorePath, 'utf-8')
      this.gitignoreSpec = ignore().add(content)
    } catch {
      this.gitignoreSpec = null
    }
  }

  private async _loadSettings(): Promise<void> {
    try {
      const exists = await fs.stat(this.settingsPath).then(() => true).catch(() => false)
      if (!exists) {
        this.settings = this._deepClone(DEFAULT_SETTINGS)
        await this._saveSettings()
        return
      }
      const raw = await fs.readFile(this.settingsPath, 'utf-8')
      const loaded = JSON.parse(raw)
      this.settings = { ...this._deepClone(DEFAULT_SETTINGS), ...loaded }
      this._ensureSchema()
      await this._saveSettings()
    } catch {
      this.settings = this._deepClone(DEFAULT_SETTINGS)
      await this._saveSettings()
    }
  }

  async _saveSettings(): Promise<void> {
    try {
      await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (err) {
      console.error(`Error writing ${SETTINGS_FILENAME}:`, err)
    }
  }

  // ==================== Private: Rules compilation ====================

  private _ensureSchema(): void {
    const mutableSettings = this.settings as Settings & { track_config?: unknown } & Record<string, unknown>

    if ((this.settings.schema_version ?? 2) < 4) {
      this.settings.schema_version = 4
      delete mutableSettings.track_config
      this.settings.global_ignore_patterns = [...DEFAULT_SETTINGS.global_ignore_patterns]
    }
    if ((this.settings.schema_version ?? 4) < 5) {
      this.settings.schema_version = 5
      this.settings.search_keywords = []
    }
    if ((this.settings.schema_version ?? 5) < 6) {
      this.settings.schema_version = 6
      this.settings.custom_ignore_patterns = []
    }
    if ((this.settings.schema_version ?? 6) < 7) {
      this.settings.schema_version = 7
      this.settings.search_cache = {}
    }
    if ((this.settings.schema_version ?? 7) < 8) {
      this.settings.schema_version = 8
      this.settings.wsl = { enabled: false, basePath: '\\\\wsl.localhost\\Ubuntu-24.04' }
    }
    // Fill missing keys
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(key in this.settings)) {
        mutableSettings[key] = this._deepClone(val)
      }
    }
    if (!Array.isArray(this.settings.search_keywords)) {
      this.settings.search_keywords = []
    }
    this.settings.custom_ignore_patterns = this._normalizeIgnorePatterns(this.settings.custom_ignore_patterns)
    // Sync ui config
    const ui = this.settings.ui
    if (ui.split_enabled === undefined) ui.split_enabled = this.settings.split_config.enabled
    if (ui.split_count === undefined) ui.split_count = this.settings.split_config.split_count
  }

  private _compileRules(): void {
    this.customIg = this._buildIgnoreSpec(this.settings.custom_ignore_patterns)
    this.baseIg = this._buildIgnoreSpec([
      ...this.settings.global_ignore_patterns
    ])
    this.included_paths = this._normalizePaths(this.settings.included_paths)
    this.excluded_paths = this._normalizePaths(this.settings.excluded_paths)
    this.priority_roots = this._normalizePriorityRoots(this.settings.priority_roots)
  }

  private _buildIgnoreSpec(patterns: string[]): Ignore {
    const spec = ignore()
    for (const pattern of patterns) {
      try {
        spec.add(pattern)
      } catch (err) {
        console.warn(`Skipping invalid ignore pattern "${pattern}":`, err)
      }
    }
    return spec
  }

  // ==================== Path normalization ====================

  private _normalizePath(p: string): string {
    return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '') || '.'
  }

  private _normalizePaths(paths: string[]): string[] {
    if (!Array.isArray(paths)) return []
    const seen = new Set<string>()
    return paths
      .filter((p): p is string => typeof p === 'string')
      .map(p => this._normalizePath(p))
      .filter(p => {
        if (seen.has(p)) return false
        seen.add(p)
        return true
      })
  }

  private _normalizePriorityRoots(roots: string[]): string[] {
    if (!Array.isArray(roots)) return []
    const seen = new Set<string>()
    return roots
      .filter((r): r is string => typeof r === 'string')
      .map(r => this._normalizePath(r))
      .filter(r => r !== '.' && !seen.has(r) && (seen.add(r), true))
  }

  private _normalizeIgnorePattern(pattern: string): string {
    return pattern.trim().replace(/\\/g, '/')
  }

  private _normalizeIgnorePatterns(patterns: string[]): string[] {
    if (!Array.isArray(patterns)) return []
    const seen = new Set<string>()
    return patterns
      .filter((pattern): pattern is string => typeof pattern === 'string')
      .map((pattern) => this._normalizeIgnorePattern(pattern))
      .filter((pattern) => {
        if (!pattern || seen.has(pattern)) return false
        seen.add(pattern)
        return true
      })
  }

  private _assertValidIgnorePattern(pattern: string): void {
    ignore().add(pattern)
  }

  // ==================== Path matching ====================

  private _pathMatchesRule(pathStr: string, rule: string): boolean {
    if (rule === '.') return true
    return pathStr === rule || pathStr.startsWith(rule + '/')
  }

  private _bestSpecificity(pathStr: string, rules: string[]): number {
    let best = -1
    for (const rule of rules) {
      if (this._pathMatchesRule(pathStr, rule)) {
        best = Math.max(best, rule.length)
      }
    }
    return best
  }

  hasDescendantRule(pathStr: string, rules: string[]): boolean {
    const norm = this._normalizePath(pathStr)
    const prefix = norm === '.' ? '' : norm + '/'
    for (const rule of rules) {
      if (rule === '.') continue
      if (prefix && rule.startsWith(prefix)) return true
      if (!prefix && rule !== '.') return true
    }
    return false
  }

  // ==================== Public query methods ====================

  isBaseIgnored(absPathOrRelPath: string, isDir: boolean, isAbs = false): boolean {
    const relPath = isAbs 
      ? path.relative(this.projectPath, absPathOrRelPath).replace(/\\/g, '/')
      : absPathOrRelPath

    const norm = this._normalizePath(relPath)
    if (norm === '_codebase' || norm.startsWith('_codebase/')) return true

    let checkPath = norm
    if (isDir && checkPath !== '.' && !checkPath.endsWith('/')) checkPath += '/'

    if (this.baseIg.ignores(checkPath)) return true
    if (this.gitignoreSpec?.ignores(checkPath)) return true
    return false
  }

  isGloballyIgnored(absPath: string, isDir: boolean): boolean {
    const relPath = path.relative(this.projectPath, absPath).replace(/\\/g, '/')
    return this.isGloballyIgnoredByRelPath(relPath, isDir)
  }

  isGloballyIgnoredByRelPath(relPath: string, isDir: boolean): boolean {
    if (this.isBaseIgnored(relPath, isDir, false)) return true

    const norm = this._normalizePath(relPath)
    let checkPath = norm
    if (isDir && checkPath !== '.' && !checkPath.endsWith('/')) checkPath += '/'

    if (this.customIg.ignores(checkPath)) return true
    return false
  }

  isCustomIgnoredByRelPath(relPath: string, isDir: boolean): boolean {
    const norm = this._normalizePath(relPath)
    if (norm === '_codebase' || norm.startsWith('_codebase/')) return true

    let checkPath = norm
    if (isDir && checkPath !== '.' && !checkPath.endsWith('/')) checkPath += '/'

    return this.customIg.ignores(checkPath)
  }

  isExplicitlyIncluded(pathStr: string): boolean {
    const norm = this._normalizePath(pathStr)
    const incSpec = this._bestSpecificity(norm, this.included_paths)
    const excSpec = this._bestSpecificity(norm, this.excluded_paths)
    return incSpec >= 0 && incSpec > excSpec
  }

  isPathSelected(pathStr: string): boolean {
    const norm = this._normalizePath(pathStr)
    const incSpec = this._bestSpecificity(norm, this.included_paths)
    const excSpec = this._bestSpecificity(norm, this.excluded_paths)

    if (incSpec < 0 && excSpec < 0) {
      return !this.excluded_paths.includes('.')
    }
    if (incSpec > excSpec) return true
    if (excSpec > incSpec) return false
    return false
  }

  getPathSelectionState(pathStr: string, isDir: boolean): 'checked' | 'unchecked' | 'partial' {
    const norm = this._normalizePath(pathStr)
    const selected = this.isPathSelected(norm)

    if (!isDir) return selected ? 'checked' : 'unchecked'

    const hasInc = this.hasDescendantRule(norm, this.included_paths)
    const hasExc = this.hasDescendantRule(norm, this.excluded_paths)

    if ((selected && hasExc) || (!selected && hasInc) || (hasInc && hasExc)) return 'partial'
    return selected ? 'checked' : 'unchecked'
  }

  // ==================== Mutation methods ====================

  async updateSelectionPaths(includedPaths: string[], excludedPaths: string[], persist = true): Promise<void> {
    this.settings.included_paths = this._normalizePaths(includedPaths)
    this.settings.excluded_paths = this._normalizePaths(excludedPaths)
    if (persist) await this._saveSettings()
    this._compileRules()
  }

  async updatePriorityRoots(priorityRoots: string[], persist = true): Promise<void> {
    this.settings.priority_roots = this._normalizePriorityRoots(priorityRoots)
    if (persist) await this._saveSettings()
    this._compileRules()
  }

  async updateUiPreferences(
    selectedFormats?: string[],
    splitEnabled?: boolean,
    splitCount?: number,
    persist = true
  ): Promise<void> {
    const ui = this.settings.ui
    if (Array.isArray(selectedFormats)) {
      ui.selected_formats = selectedFormats.length > 0 ? selectedFormats : ['txt']
    }
    if (splitEnabled !== undefined) {
      ui.split_enabled = Boolean(splitEnabled)
      this.settings.split_config.enabled = Boolean(splitEnabled)
    }
    if (typeof splitCount === 'number') {
      const safe = Math.max(2, splitCount)
      ui.split_count = safe
      this.settings.split_config.split_count = safe
    }
    if (persist) await this._saveSettings()
    this._compileRules()
  }

  getSearchKeywords(): string[] {
    if (!Array.isArray(this.settings.search_keywords)) return []
    return [...this.settings.search_keywords]
  }

  getSearchCache(): Record<string, string[]> {
    if (!this.settings.search_cache || typeof this.settings.search_cache !== 'object') return {}
    return { ...this.settings.search_cache }
  }

  async updateSearchCache(cache: Record<string, string[]>, persist = true): Promise<void> {
    this.settings.search_cache = { ...cache }
    if (persist) await this._saveSettings()
  }

  async updateSearchKeywords(keywords: string[], persist = true): Promise<void> {
    const seen = new Set<string>()
    this.settings.search_keywords = keywords
      .filter((keyword): keyword is string => typeof keyword === 'string')
      .map((keyword) => keyword.trim())
      .filter((keyword) => {
        if (!keyword || seen.has(keyword)) return false
        seen.add(keyword)
        return true
      })

    if (persist) await this._saveSettings()
  }

  getCustomIgnorePatterns(): string[] {
    if (!Array.isArray(this.settings.custom_ignore_patterns)) return []
    return [...this.settings.custom_ignore_patterns]
  }

  async addCustomIgnorePattern(pattern: string, persist = true): Promise<string[]> {
    const normalized = this._normalizeIgnorePattern(pattern)
    if (!normalized) return this.getCustomIgnorePatterns()

    this._assertValidIgnorePattern(normalized)

    const current = this._normalizeIgnorePatterns(this.settings.custom_ignore_patterns)
    if (!current.includes(normalized)) current.push(normalized)
    this.settings.custom_ignore_patterns = current

    if (persist) await this._saveSettings()
    this._compileRules()
    return this.getCustomIgnorePatterns()
  }

  async removeCustomIgnorePattern(pattern: string, persist = true): Promise<string[]> {
    const normalized = this._normalizeIgnorePattern(pattern)
    this.settings.custom_ignore_patterns = this._normalizeIgnorePatterns(
      this.settings.custom_ignore_patterns
    ).filter((item) => item !== normalized)

    if (persist) await this._saveSettings()
    this._compileRules()
    return this.getCustomIgnorePatterns()
  }

  async previewCustomPattern(pattern: string, maxResults = 50): Promise<IgnorePreviewEntry[]> {
    const normalized = this._normalizeIgnorePattern(pattern)
    if (!normalized) return []

    this._assertValidIgnorePattern(normalized)

    const tempIg = ignore().add(normalized)
    const limit = Math.max(1, Math.floor(maxResults))
    const results: IgnorePreviewEntry[] = []

    const walk = async (relDir: string): Promise<void> => {
      if (results.length >= limit) return

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
        if (results.length >= limit) return
        if (entry.name === '_codebase') continue

        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
        const isDir = entry.isDirectory()

        if (this.isGloballyIgnoredByRelPath(relPath, isDir)) continue

        let checkPath = this._normalizePath(relPath)
        if (isDir && checkPath !== '.' && !checkPath.endsWith('/')) checkPath += '/'

        if (tempIg.ignores(checkPath)) {
          results.push({
            absPath: path.join(absDir, entry.name),
            relPath,
            isDir,
            source: 'ignore'
          })
          continue
        }

        if (isDir) await walk(relPath)
      }
    }

    await walk('')
    return results
  }

  getUiPreferences(): { selected_formats: string[]; split_enabled: boolean; split_count: number } {
    const ui = this.settings.ui
    return {
      selected_formats: ui.selected_formats.length > 0 ? [...ui.selected_formats] : ['txt'],
      split_enabled: Boolean(ui.split_enabled),
      split_count: Math.max(2, ui.split_count)
    }
  }

  getPriorityRoots(): string[] {
    return [...this.priority_roots]
  }

  getSettingsPath(): string {
    return this.settingsPath
  }

  getWslConfig(): { enabled: boolean; basePath: string } {
    return {
      enabled: Boolean(this.settings.wsl?.enabled ?? false),
      basePath: String(this.settings.wsl?.basePath ?? '\\\\wsl.localhost\\Ubuntu-24.04')
    }
  }

  async updateWslConfig(enabled: boolean, basePath: string, persist = true): Promise<void> {
    this.settings.wsl = {
      enabled: Boolean(enabled),
      basePath: String(basePath).trim()
    }
    if (persist) await this._saveSettings()
  }

  async resetSettings(): Promise<void> {
    this.settings = this._deepClone(DEFAULT_SETTINGS)
    await this._saveSettings()
    this._compileRules()
  }

  // ==================== Utility ====================

  private _deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }
}
