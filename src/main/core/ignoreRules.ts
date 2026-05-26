import fs from 'fs/promises'
import path from 'path'
import type { Dirent } from 'fs'
import ignore, { Ignore } from 'ignore'

const SETTINGS_FILENAME = 'settings.json'
const PROMPT_FILENAME = 'prompt_get_list_files_and_folders_related.md'
const INSTRUCTIONS_FILENAME = 'instructions.md'
const PLAN_REVIEW_FILENAME = 'plan_review.md'

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

const DEFAULT_PROMPT_CONTENT = `Dựa vào codebase và codebase structure tôi đã cung cấp ở trên cho bạn

Tôi cần bạn phân tích dự án này để giúp tôi giải quyết vấn đề sau:[ĐIỀN VẤN ĐỀ / TÍNH NĂNG BẠN MUỐN LÀM VÀO ĐÂY]

NHIỆM VỤ CỦA BẠN:
1. Phân tích cấu trúc thư mục và xác định TẤT CẢ các file/folder trọng tâm, cần thiết để bạn hiểu và code được yêu cầu trên.
2. Trả về kết quả CHỈ DƯỚI DẠNG pattern giống .gitignore (mỗi file/folder một dòng). Không giải thích, không định dạng Markdown, không nói thêm bất cứ điều gì.

Ví dụ định dạng đầu ra:
src/main/core/searchEngine.ts
src/renderer/src/SearchSidebar.tsx
src/types/**/*.ts

Không cần trả lời thêm bất cứ gì, chỉ cần liệt kê các file liên quan đến cấu trúc dự án và vấn đề tôi đang cần giải quyết.`

interface Settings {
  schema_version: number
  included_paths: string[]
  excluded_paths: string[]
  priority_roots: string[]
  global_ignore_patterns: string[]
  custom_ignore_patterns: string[]
  global_track_patterns: string[]
  attention_patterns: string[]
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
  instructions: {
    enabled: boolean
  }
  description: string
}

const DEFAULT_SETTINGS: Settings = {
  schema_version: 12,
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
  global_track_patterns: [],
  attention_patterns: [],
  split_config: { enabled: true, split_count: 5, token_threshold: 40000 },
  ui: { selected_formats: ['txt'], split_enabled: true, split_count: 5 },
  instructions: { enabled: false },
  description: 'Cấu hình gom mã nguồn dự án.'
}

export interface IgnorePreviewEntry {
  absPath: string
  relPath: string
  isDir: boolean
  source: 'ignore' | 'track'
}

export class IgnoreRules {
  public projectPath: string
  private codebaseDir: string
  private settingsPath: string
  private baseIg: Ignore
  private customIg: Ignore
  private trackIg: Ignore
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
    this.trackIg = ignore()
    this.settings = this._deepClone(DEFAULT_SETTINGS)
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.codebaseDir, { recursive: true })
    await this._loadGitignore()
    await this._loadSettings()
    this._compileRules()
    await this.ensurePromptFileExists()
    await this.ensureInstructionsFileExists()
    await this.ensurePlanReviewFileExists()
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
      mutableSettings.search_keywords = []
    }
    if ((this.settings.schema_version ?? 5) < 6) {
      this.settings.schema_version = 6
      this.settings.custom_ignore_patterns = []
    }
    if ((this.settings.schema_version ?? 6) < 7) {
      this.settings.schema_version = 7
      mutableSettings.search_cache = {}
    }
    if ((this.settings.schema_version ?? 7) < 8) {
      this.settings.schema_version = 8
    }
    if ((this.settings.schema_version ?? 8) < 9) {
      this.settings.schema_version = 9
      delete mutableSettings.search_keywords
      delete mutableSettings.search_cache
      this.settings.attention_patterns = []
    }
    if ((this.settings.schema_version ?? 9) < 10) {
      this.settings.schema_version = 10
      this.settings.instructions = { enabled: false }
    }
    if ((this.settings.schema_version ?? 10) < 11) {
      this.settings.schema_version = 11
      delete mutableSettings.wsl
    }
    if ((this.settings.schema_version ?? 11) < 12) {
      this.settings.schema_version = 12
      this.settings.global_track_patterns = []
    }
    // Fill missing keys
    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(key in this.settings)) {
        mutableSettings[key] = this._deepClone(val)
      }
    }
    delete mutableSettings.wsl
    this.settings.custom_ignore_patterns = this._normalizeIgnorePatterns(this.settings.custom_ignore_patterns)
    this.settings.global_track_patterns = this._normalizeIgnorePatterns(this.settings.global_track_patterns)
    // Sync ui config
    const ui = this.settings.ui
    if (ui.split_enabled === undefined) ui.split_enabled = this.settings.split_config.enabled
    if (ui.split_count === undefined) ui.split_count = this.settings.split_config.split_count
  }

  private _compileRules(): void {
    this.customIg = this._buildIgnoreSpec(this.settings.custom_ignore_patterns)
    this.trackIg = this._buildIgnoreSpec(this.settings.global_track_patterns)
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

  private _toCheckPath(relPath: string, isDir: boolean): string {
    const norm = this._normalizePath(relPath)
    if (isDir && norm !== '.' && !norm.endsWith('/')) return `${norm}/`
    return norm
  }

  private _stripPatternSyntax(pattern: string): string {
    return pattern
      .replace(/^!+/, '')
      .replace(/^\/+/, '')
      .replace(/\\/g, '/')
      .trim()
  }

  private _literalPrefixBeforeGlob(pattern: string): string {
    const normalized = this._stripPatternSyntax(pattern)
    const globIndex = normalized.search(/[*?[\]{}()]/)
    const prefix = globIndex === -1 ? normalized : normalized.slice(0, globIndex)
    return prefix.replace(/\/+$/, '')
  }

  private _hasPotentialTrackDescendant(relPath: string): boolean {
    const norm = this._normalizePath(relPath)
    if (norm === '.') return this.settings.global_track_patterns.length > 0

    const dirPrefix = `${norm}/`
    for (const rawPattern of this.settings.global_track_patterns) {
      const pattern = this._stripPatternSyntax(rawPattern)
      if (!pattern) continue
      if (pattern === norm || pattern.startsWith(dirPrefix)) return true

      const literalPrefix = this._literalPrefixBeforeGlob(pattern)
      if (!literalPrefix) return true
      if (literalPrefix === norm || literalPrefix.startsWith(dirPrefix)) return true
      if (norm.startsWith(`${literalPrefix}/`)) return true
    }
    return false
  }

  private _matchesOverridableIgnore(relPath: string, isDir: boolean): boolean {
    const checkPath = this._toCheckPath(relPath, isDir)
    if (this.baseIg.ignores(checkPath)) return true
    if (this.gitignoreSpec?.ignores(checkPath)) return true
    if (this.customIg.ignores(checkPath)) return true
    return false
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
    if (this.isHardIgnoredByRelPath(norm, isDir)) return true
    if (this.isGlobalTrackedByRelPath(norm, isDir)) return false
    if (isDir && this._hasPotentialTrackDescendant(norm)) return false

    const checkPath = this._toCheckPath(norm, isDir)

    if (this.baseIg.ignores(checkPath)) return true
    if (this.gitignoreSpec?.ignores(checkPath)) return true
    return false
  }

  isGloballyIgnored(absPath: string, isDir: boolean): boolean {
    const relPath = path.relative(this.projectPath, absPath).replace(/\\/g, '/')
    return this.isGloballyIgnoredByRelPath(relPath, isDir)
  }

  isGloballyIgnoredByRelPath(relPath: string, isDir: boolean): boolean {
    const norm = this._normalizePath(relPath)
    if (this.isHardIgnoredByRelPath(norm, isDir)) return true
    if (this.isGlobalTrackedByRelPath(norm, isDir)) return false

    const checkPath = this._toCheckPath(norm, isDir)
    const ignored = this.baseIg.ignores(checkPath) ||
      Boolean(this.gitignoreSpec?.ignores(checkPath)) ||
      this.customIg.ignores(checkPath)

    if (ignored && isDir && this._hasPotentialTrackDescendant(norm)) return false
    return ignored
  }

  isCustomIgnoredByRelPath(relPath: string, isDir: boolean): boolean {
    const norm = this._normalizePath(relPath)
    if (this.isHardIgnoredByRelPath(norm, isDir)) return true
    if (this.isGlobalTrackedByRelPath(norm, isDir)) return false
    if (isDir && this._hasPotentialTrackDescendant(norm)) return false

    const checkPath = this._toCheckPath(norm, isDir)

    return this.customIg.ignores(checkPath)
  }

  isHardIgnoredByRelPath(relPath: string, isDir: boolean): boolean {
    const checkPath = this._toCheckPath(relPath, isDir)
    return checkPath === '_codebase' ||
      checkPath === '_codebase/' ||
      checkPath.startsWith('_codebase/') ||
      checkPath === '.git' ||
      checkPath === '.git/' ||
      checkPath.startsWith('.git/')
  }

  isGlobalTrackedByRelPath(relPath: string, isDir: boolean): boolean {
    const norm = this._normalizePath(relPath)
    if (this.isHardIgnoredByRelPath(norm, isDir)) return false
    return this.trackIg.ignores(this._toCheckPath(norm, isDir))
  }

  isExplicitlyIncluded(pathStr: string): boolean {
    const norm = this._normalizePath(pathStr)
    const incSpec = this._bestSpecificity(norm, this.included_paths)
    const excSpec = this._bestSpecificity(norm, this.excluded_paths)
    return incSpec >= 0 && incSpec > excSpec
  }

  isPathSelected(pathStr: string): boolean {
    const norm = this._normalizePath(pathStr)
    if (this.isGlobalTrackedByRelPath(norm, false)) return true

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
    const hasTrack = isDir && this._hasPotentialTrackDescendant(norm)

    if ((selected && hasExc) || (!selected && (hasInc || hasTrack)) || (hasInc && hasExc)) {
      return 'partial'
    }
    return selected ? 'checked' : 'unchecked'
  }

  hasGlobalTrackDescendant(pathStr: string): boolean {
    return this._hasPotentialTrackDescendant(pathStr)
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

  getAttentionPatterns(): string[] {
    if (!Array.isArray(this.settings.attention_patterns)) return []
    return [...this.settings.attention_patterns]
  }

  async updateAttentionPatterns(patterns: string[], persist = true): Promise<void> {
    this.settings.attention_patterns = patterns
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.trim())
      .filter(Boolean)
    if (persist) await this._saveSettings()
  }

  getCustomIgnorePatterns(): string[] {
    if (!Array.isArray(this.settings.custom_ignore_patterns)) return []
    return [...this.settings.custom_ignore_patterns]
  }

  getGlobalTrackPatterns(): string[] {
    if (!Array.isArray(this.settings.global_track_patterns)) return []
    return [...this.settings.global_track_patterns]
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

  async addGlobalTrackPattern(pattern: string, persist = true): Promise<string[]> {
    const normalized = this._normalizeIgnorePattern(pattern)
    if (!normalized) return this.getGlobalTrackPatterns()

    this._assertValidIgnorePattern(normalized)

    const current = this._normalizeIgnorePatterns(this.settings.global_track_patterns)
    if (!current.includes(normalized)) current.push(normalized)
    this.settings.global_track_patterns = current

    if (persist) await this._saveSettings()
    this._compileRules()
    return this.getGlobalTrackPatterns()
  }

  async removeGlobalTrackPattern(pattern: string, persist = true): Promise<string[]> {
    const normalized = this._normalizeIgnorePattern(pattern)
    this.settings.global_track_patterns = this._normalizeIgnorePatterns(
      this.settings.global_track_patterns
    ).filter((item) => item !== normalized)

    if (persist) await this._saveSettings()
    this._compileRules()
    return this.getGlobalTrackPatterns()
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

        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
        const isDir = entry.isDirectory()
        if (this.isHardIgnoredByRelPath(relPath, isDir)) continue
        if (this.isGlobalTrackedByRelPath(relPath, isDir)) continue

        if (this.isGloballyIgnoredByRelPath(relPath, isDir)) continue

        if (tempIg.ignores(this._toCheckPath(relPath, isDir))) {
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

  async previewGlobalTrackPattern(pattern: string, maxResults = 50): Promise<IgnorePreviewEntry[]> {
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

        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
        const isDir = entry.isDirectory()
        if (this.isHardIgnoredByRelPath(relPath, isDir)) continue

        if (tempIg.ignores(this._toCheckPath(relPath, isDir)) &&
          this._matchesOverridableIgnore(relPath, isDir)) {
          results.push({
            absPath: path.join(absDir, entry.name),
            relPath,
            isDir,
            source: 'track'
          })
        }

        if (isDir) await walk(relPath)
      }
    }

    await walk('')
    return results
  }

  async collectSuggestionPaths(maxPaths = 10000): Promise<string[]> {
    const results = new Set<string>()

    const walk = async (relDir: string, includeIgnored: boolean): Promise<void> => {
      if (results.size >= maxPaths) return

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
        if (results.size >= maxPaths) return
        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
        const isDir = entry.isDirectory()
        if (this.isHardIgnoredByRelPath(relPath, isDir)) continue

        const ignored = this._matchesOverridableIgnore(relPath, isDir) &&
          !this.isGlobalTrackedByRelPath(relPath, isDir)
        if (!includeIgnored && ignored) continue

        results.add(isDir ? `${relPath}/` : relPath)
        if (isDir) await walk(relPath, includeIgnored)
      }
    }

    await walk('', false)
    if (results.size < maxPaths) await walk('', true)
    return Array.from(results).sort((a, b) => a.localeCompare(b))
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

  // ==================== Prompt File Manager ====================

  private getPromptFilePath(): string {
    return path.join(this.codebaseDir, PROMPT_FILENAME)
  }

  async ensurePromptFileExists(): Promise<void> {
    const fp = this.getPromptFilePath()
    try {
      await fs.access(fp)
    } catch {
      await fs.writeFile(fp, DEFAULT_PROMPT_CONTENT, 'utf-8')
    }
  }

  async resetPromptFile(): Promise<void> {
    await fs.writeFile(this.getPromptFilePath(), DEFAULT_PROMPT_CONTENT, 'utf-8')
  }

  async readPromptFile(): Promise<string> {
    try {
      return await fs.readFile(this.getPromptFilePath(), 'utf-8')
    } catch {
      return DEFAULT_PROMPT_CONTENT
    }
  }

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

  // ==================== Plan Review File Manager ====================

  private getPlanReviewFilePath(): string {
    return path.join(this.codebaseDir, PLAN_REVIEW_FILENAME)
  }

  async ensurePlanReviewFileExists(): Promise<void> {
    const fp = this.getPlanReviewFilePath()
    try {
      await fs.access(fp)
    } catch {
      await fs.writeFile(fp, '', 'utf-8')
    }
  }

  async readPlanReviewFile(): Promise<string> {
    try {
      return await fs.readFile(this.getPlanReviewFilePath(), 'utf-8')
    } catch {
      return ''
    }
  }

  async writePlanReviewFile(content: string): Promise<void> {
    await fs.mkdir(this.codebaseDir, { recursive: true })
    await fs.writeFile(this.getPlanReviewFilePath(), content, 'utf-8')
  }

  // ==================== Utility ====================

  private _deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }
}
