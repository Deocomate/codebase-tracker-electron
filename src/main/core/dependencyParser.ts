import fs from 'fs/promises'
import path from 'path'
import { isTextFile, readTextFile } from './fileUtils'
import { IgnoreRules } from './ignoreRules'

export interface DependencySourceFile {
  absPath: string
  relPath: string
}

export interface ResolvedDependency {
  absPath: string
  relPath: string
  importedBy: string
}

export interface AttentionFileEntry extends DependencySourceFile {
  tokens?: number
  isRelated?: boolean
  importedBy?: string
}

interface CollectRelatedOptions {
  ignoreRules?: IgnoreRules
  maxSourceFiles?: number
  existingRelPaths?: Set<string>
}

const JS_TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']
const PYTHON_EXTENSIONS = ['.py']
const CPP_EXTENSIONS = ['.h', '.hpp', '.hh', '.c', '.cc', '.cpp', '.cxx']
const GO_EXTENSIONS = ['.go']
const PHP_EXTENSIONS = ['.php']
const RUST_EXTENSIONS = ['.rs']

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\.\//, '')
}

function normalizeAbsPath(absPath: string): string {
  return path.resolve(absPath)
}

function getLanguageKind(filePath: string): 'js' | 'python' | 'cpp' | 'go' | 'php' | 'rust' | 'unknown' {
  const ext = path.extname(filePath).toLowerCase()
  if (['.js', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.mjs', '.cjs'].includes(ext)) return 'js'
  if (ext === '.py') return 'python'
  if (['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp'].includes(ext)) return 'cpp'
  if (ext === '.go') return 'go'
  if (ext === '.php') return 'php'
  if (ext === '.rs') return 'rust'
  return 'unknown'
}

function pushMatches(content: string, regex: RegExp, deps: Set<string>): void {
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    for (let i = 1; i < match.length; i++) {
      if (match[i]) {
        deps.add(match[i].trim())
        break
      }
    }
  }
}

function pushPhpDependencies(content: string, deps: Set<string>): void {
  pushMatches(content, /\b(?:include|include_once|require|require_once)\s*(?:\(\s*)?['"]([^'"]+)['"]/g, deps)

  let match: RegExpExecArray | null
  const useRegex = /^\s*use\s+(?!function\b|const\b)([^;{]+);/gim
  while ((match = useRegex.exec(content)) !== null) {
    const namespace = match[1]
      .split(/\s+as\s+/i)[0]
      .trim()
      .replace(/^\\+/, '')

    if (namespace.startsWith('App\\')) {
      deps.add(namespace)
    }
  }

  const inlineAppRegex = /(?:^|[^\w\\])\\?(App\\[A-Za-z_][\w\\]*)/g
  while ((match = inlineAppRegex.exec(content)) !== null) {
    deps.add(match[1])
  }
}

export function extractDependencies(filePath: string, content: string): string[] {
  const deps = new Set<string>()
  const language = getLanguageKind(filePath)

  switch (language) {
    case 'js':
      pushMatches(content, /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g, deps)
      pushMatches(content, /\bexport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/g, deps)
      pushMatches(content, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, deps)
      pushMatches(content, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, deps)
      break
    case 'python':
      pushMatches(content, /^\s*from\s+([.\w]+)\s+import\b/gm, deps)
      pushMatches(content, /^\s*import\s+([.\w]+)(?:\s+as\s+\w+)?\s*$/gm, deps)
      break
    case 'cpp':
      pushMatches(content, /^\s*#\s*include\s+"([^"]+)"/gm, deps)
      break
    case 'go':
      pushMatches(content, /^\s*import\s+"([^"]+)"/gm, deps)
      pushMatches(content, /^\s*"([^"]+)"\s*$/gm, deps)
      break
    case 'php':
      pushPhpDependencies(content, deps)
      break
    case 'rust':
      pushMatches(content, /^\s*mod\s+([A-Za-z_][\w]*)\s*;/gm, deps)
      pushMatches(content, /^\s*use\s+([^;]+);/gm, deps)
      break
  }

  return Array.from(deps)
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..'
}

function getExtensionsForSource(sourceFilePath: string): string[] {
  switch (getLanguageKind(sourceFilePath)) {
    case 'js':
      return JS_TS_EXTENSIONS
    case 'python':
      return PYTHON_EXTENSIONS
    case 'cpp':
      return CPP_EXTENSIONS
    case 'go':
      return GO_EXTENSIONS
    case 'php':
      return PHP_EXTENSIONS
    case 'rust':
      return RUST_EXTENSIONS
    default:
      return []
  }
}

function normalizeModuleSpecifier(sourceFilePath: string, rawImport: string): string | null {
  const language = getLanguageKind(sourceFilePath)
  const specifier = rawImport.trim()
  if (!specifier) return null

  if (language === 'python') {
    if (specifier.startsWith('.')) {
      const dots = specifier.match(/^\.+/)?.[0].length ?? 0
      const rest = specifier.slice(dots).replace(/\./g, '/')
      const parents = dots <= 1 ? '.' : '../'.repeat(dots - 1).replace(/\/$/, '')
      return rest ? `${parents}/${rest}` : parents
    }
    return specifier.replace(/\./g, '/')
  }

  if (language === 'php') {
    if (isRelativeSpecifier(specifier)) return specifier
    return specifier
      .replace(/^\\+/, '')
      .replace(/\s+as\s+\w+$/i, '')
      .replace(/\\/g, '/')
  }

  if (language === 'rust') {
    if (isRelativeSpecifier(specifier)) return specifier
    return specifier
      .replace(/^crate::/, '')
      .replace(/^(self|super)::/, (_m, prefix: string) => (prefix === 'super' ? '../' : './'))
      .replace(/::/g, '/')
  }

  return specifier
}

function getBaseCandidates(projectPath: string, sourceFilePath: string, rawImport: string): string[] {
  const sourceDir = path.dirname(sourceFilePath)
  const normalizedSpecifier = normalizeModuleSpecifier(sourceFilePath, rawImport)
  if (!normalizedSpecifier) return []

  const language = getLanguageKind(sourceFilePath)

  if (isRelativeSpecifier(normalizedSpecifier)) {
    return [path.resolve(sourceDir, normalizedSpecifier)]
  }

  if (language === 'cpp') {
    return [path.resolve(sourceDir, normalizedSpecifier), path.resolve(projectPath, normalizedSpecifier)]
  }

  if (language === 'php') {
    const candidates = [path.resolve(sourceDir, normalizedSpecifier), path.resolve(projectPath, normalizedSpecifier)]
    if (normalizedSpecifier.startsWith('App/')) {
      candidates.unshift(path.resolve(projectPath, 'app', normalizedSpecifier.slice('App/'.length)))
    }
    return candidates
  }

  if (['python', 'go', 'php', 'rust'].includes(language)) {
    return [path.resolve(sourceDir, normalizedSpecifier), path.resolve(projectPath, normalizedSpecifier)]
  }

  return []
}

function buildPathCandidates(basePath: string, sourceFilePath: string): string[] {
  const ext = path.extname(basePath)
  const extensions = getExtensionsForSource(sourceFilePath)
  const candidates = new Set<string>([basePath])

  if (!ext) {
    for (const candidateExt of extensions) {
      candidates.add(`${basePath}${candidateExt}`)
    }

    if (getLanguageKind(sourceFilePath) === 'python') {
      candidates.add(path.join(basePath, '__init__.py'))
    } else {
      for (const candidateExt of extensions) {
        candidates.add(path.join(basePath, `index${candidateExt}`))
      }
    }

    if (getLanguageKind(sourceFilePath) === 'rust') {
      candidates.add(path.join(basePath, 'mod.rs'))
    }
  }

  return Array.from(candidates)
}

function isInsideProject(projectPath: string, candidatePath: string): boolean {
  const relative = path.relative(projectPath, candidatePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function resolveExistingFile(projectPath: string, candidatePath: string): Promise<string | null> {
  const resolved = normalizeAbsPath(candidatePath)
  if (!isInsideProject(projectPath, resolved)) return null

  try {
    const stat = await fs.stat(resolved)
    if (!stat.isFile()) return null
    if (!isTextFile(resolved)) return null
    return resolved
  } catch {
    return null
  }
}

export async function resolveDependencyPaths(
  projectPath: string,
  sourceFilePath: string,
  rawImports: string[]
): Promise<ResolvedDependency[]> {
  const projectRoot = normalizeAbsPath(projectPath)
  const sourceAbsPath = normalizeAbsPath(sourceFilePath)
  const resolved = new Map<string, ResolvedDependency>()

  for (const rawImport of rawImports) {
    const bases = getBaseCandidates(projectRoot, sourceAbsPath, rawImport)
    let foundForImport = false
    for (const base of bases) {
      const candidates = buildPathCandidates(base, sourceAbsPath)
      for (const candidate of candidates) {
        const existingPath = await resolveExistingFile(projectRoot, candidate)
        if (!existingPath || existingPath === sourceAbsPath) continue

        const relPath = normalizeRelPath(path.relative(projectRoot, existingPath))
        if (!resolved.has(relPath)) {
          resolved.set(relPath, {
            absPath: existingPath,
            relPath,
            importedBy: normalizeRelPath(path.relative(projectRoot, sourceAbsPath))
          })
        }
        foundForImport = true
        break
      }
      if (foundForImport) break
    }
  }

  return Array.from(resolved.values())
}

export async function collectRelatedDependencies(
  projectPath: string,
  sourceFiles: DependencySourceFile[],
  options: CollectRelatedOptions = {}
): Promise<AttentionFileEntry[]> {
  const maxSourceFiles = options.maxSourceFiles ?? sourceFiles.length
  const seenRelPaths = new Set(Array.from(options.existingRelPaths ?? []).map(normalizeRelPath))
  const related = new Map<string, AttentionFileEntry>()

  for (const sourceFile of sourceFiles.slice(0, maxSourceFiles)) {
    if (!isTextFile(sourceFile.relPath)) continue

    const content = await readTextFile(sourceFile.absPath)
    if (content.startsWith('ERROR: Could not read file:')) continue

    const rawImports = extractDependencies(sourceFile.absPath, content)
    const dependencies = await resolveDependencyPaths(projectPath, sourceFile.absPath, rawImports)

    for (const dependency of dependencies) {
      const normalizedRel = normalizeRelPath(dependency.relPath)
      if (seenRelPaths.has(normalizedRel) || related.has(normalizedRel)) continue

      const ignored = options.ignoreRules?.isGloballyIgnoredByRelPath(normalizedRel, false)
      if (ignored) continue

      try {
        const stat = await fs.stat(dependency.absPath)
        related.set(normalizedRel, {
          absPath: dependency.absPath,
          relPath: normalizedRel,
          tokens: Math.ceil(stat.size / 4),
          isRelated: true,
          importedBy: sourceFile.relPath
        })
      } catch {
        related.set(normalizedRel, {
          absPath: dependency.absPath,
          relPath: normalizedRel,
          isRelated: true,
          importedBy: sourceFile.relPath
        })
      }
    }
  }

  return Array.from(related.values())
}
