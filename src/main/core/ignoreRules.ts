import fs from 'fs/promises'
import path from 'path'
import ignore, { Ignore } from 'ignore'

const SETTINGS_FILENAME = 'settings.json'

interface Settings {
  schema_version: number
  included_paths: string[]
  excluded_paths: string[]
  priority_roots: string[]
  global_ignore_patterns: string[]
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
  description: string
}

const DEFAULT_SETTINGS: Settings = {
  schema_version: 4,
  included_paths: [],
  excluded_paths: [],
  priority_roots: [],
  global_ignore_patterns: [
    '.git/', 'node_modules/', 'venv/', 'env/', '.venv/',
    '__pycache__/', '.pytest_cache/', '.mypy_cache/', '.ruff_cache/',
    'dist/', 'build/', 'out/', 'target/', 'coverage/',
    '.idea/', '.vscode/', '*.log', '*.bak', '*.swp', '*.tmp', '.DS_Store'
  ],
  split_config: { enabled: true, split_count: 5, token_threshold: 40000 },
  ui: { selected_formats: ['txt'], split_enabled: true, split_count: 5 },
  description: 'Cấu hình gom mã nguồn dự án.'
}

export class IgnoreRules {
  public projectPath: string
  private codebaseDir: string
  private settingsPath: string
  private ig: Ignore
  private gitignoreSpec: Ignore | null = null
  public included_paths: string[] = []
  public excluded_paths: string[] = []
  public priority_roots: string[] = []
  public settings: Settings

  constructor(projectPath: string) {
    this.projectPath = projectPath
    this.codebaseDir = path.join(projectPath, '_codebase')
    this.settingsPath = path.join(this.codebaseDir, SETTINGS_FILENAME)
    this.ig = ignore().add(DEFAULT_SETTINGS.global_ignore_patterns)
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
    if ((this.settings.schema_version ?? 2) < 4) {
      this.settings.schema_version = 4
      delete (this.settings as any).track_config
      this.settings.global_ignore_patterns = [...DEFAULT_SETTINGS.global_ignore_patterns]
    }
    // Fill missing keys
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(key in this.settings)) {
        (this.settings as any)[key] = this._deepClone(val)
      }
    }
    // Sync ui config
    const ui = this.settings.ui
    if (ui.split_enabled === undefined) ui.split_enabled = this.settings.split_config.enabled
    if (ui.split_count === undefined) ui.split_count = this.settings.split_config.split_count
  }

  private _compileRules(): void {
    this.ig = ignore().add(this.settings.global_ignore_patterns)
    this.included_paths = this._normalizePaths(this.settings.included_paths)
    this.excluded_paths = this._normalizePaths(this.settings.excluded_paths)
    this.priority_roots = this._normalizePriorityRoots(this.settings.priority_roots)
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

  isGloballyIgnored(absPath: string, isDir: boolean): boolean {
    const relPath = path.relative(this.projectPath, absPath).replace(/\\/g, '/')
    if (relPath === '_codebase' || relPath.startsWith('_codebase/')) return true

    let checkPath = this._normalizePath(relPath)
    if (isDir && checkPath !== '.' && !checkPath.endsWith('/')) checkPath += '/'

    if (this.ig.ignores(checkPath)) return true
    if (this.gitignoreSpec?.ignores(checkPath)) return true
    return false
  }

  isGloballyIgnoredByRelPath(relPath: string, isDir: boolean): boolean {
    const norm = this._normalizePath(relPath)
    if (norm === '_codebase' || norm.startsWith('_codebase/')) return true

    let checkPath = norm
    if (isDir && checkPath !== '.' && !checkPath.endsWith('/')) checkPath += '/'

    if (this.ig.ignores(checkPath)) return true
    if (this.gitignoreSpec?.ignores(checkPath)) return true
    return false
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
