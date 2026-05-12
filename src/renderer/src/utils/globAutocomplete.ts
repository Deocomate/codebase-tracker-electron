const GLOB_CHARS = new Set(['*', '?'])

function escapeRegexChar(char: string): string {
  return /[\\^$+?.()|[\]{}]/.test(char) ? `\\${char}` : char
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '')
}

function stripNegation(input: string): { pattern: string; isNegated: boolean } {
  const isNegated = input.startsWith('!')
  return {
    pattern: isNegated ? input.slice(1) : input,
    isNegated
  }
}

function getLiteralPrefix(pattern: string): string {
  const index = [...pattern].findIndex((char) => GLOB_CHARS.has(char))
  return index === -1 ? pattern : pattern.slice(0, index)
}

function getPathExtension(path: string): string | null {
  if (path.endsWith('/')) return null

  const fileName = path.split('/').pop() ?? ''
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return null
  return fileName.slice(dotIndex + 1)
}

function isFolderPath(path: string): boolean {
  return path.endsWith('/')
}

function shouldSuggestExtensions(pattern: string): boolean {
  const lastSegment = pattern.split('/').pop() ?? pattern
  return lastSegment.startsWith('*.')
}

function applyNegation(suggestion: string, isNegated: boolean): string {
  return isNegated ? `!${suggestion}` : suggestion
}

export function parseGlobToRegex(pattern: string): RegExp {
  const normalized = normalizePath(pattern)
  let source = '^'

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]

    if (char === '*' && next === '*') {
      const previous = normalized[index - 1]
      const afterGlobstar = normalized[index + 2]

      if (previous === '/' && afterGlobstar === '/') {
        source += '(?:.*\\/)?'
        index += 2
      } else {
        source += '.*'
        index += 1
      }
      continue
    }

    if (char === '*') {
      source += '[^/]*'
      continue
    }

    if (char === '?') {
      source += '[^/]'
      continue
    }

    source += escapeRegexChar(char)
  }

  source += '[^/]*'
  return new RegExp(source, 'i')
}

function getExtensionSuggestions(pattern: string, allPaths: string[], max: number): string[] {
  const lastSlashIndex = pattern.lastIndexOf('/')
  const prefix = lastSlashIndex === -1 ? '' : pattern.slice(0, lastSlashIndex + 1)
  const segment = lastSlashIndex === -1 ? pattern : pattern.slice(lastSlashIndex + 1)
  const extensionPrefix = segment.slice(2).toLowerCase()
  const pathRegex = prefix ? parseGlobToRegex(prefix) : null
  const extensions = new Set<string>()

  for (const path of allPaths) {
    const normalized = normalizePath(path)
    if (pathRegex && !pathRegex.test(normalized)) continue

    const extension = getPathExtension(normalized)
    if (!extension || !extension.toLowerCase().startsWith(extensionPrefix)) continue
    extensions.add(`${prefix}*.${extension}`)
  }

  return Array.from(extensions)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, max)
}

function getGlobstarFolderSuggestions(pattern: string, allPaths: string[], max: number): string[] {
  const basePrefix = pattern.slice(0, pattern.lastIndexOf('**/'))
  return allPaths
    .map(normalizePath)
    .filter((path) => isFolderPath(path) && path.startsWith(basePrefix) && path !== basePrefix)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, max)
}

function getRank(path: string, pattern: string): number {
  const lowerPath = path.toLowerCase()
  const lowerPattern = pattern.toLowerCase()
  const literalPrefix = getLiteralPrefix(lowerPattern)

  if (lowerPath === lowerPattern) return 0
  if (literalPrefix && lowerPath.startsWith(literalPrefix)) return 1
  if (!lowerPattern.includes('*') && lowerPath.includes(lowerPattern)) return 2
  if (isFolderPath(path)) return 3
  return 4
}

export function getGlobSuggestions(input: string, allPaths: string[], max = 50): string[] {
  const rawInput = input.trim()
  if (!rawInput) return []

  const { pattern: rawPattern, isNegated } = stripNegation(rawInput)
  const pattern = normalizePath(rawPattern)
  if (!pattern) return []

  if (shouldSuggestExtensions(pattern)) {
    return getExtensionSuggestions(pattern, allPaths, max).map((suggestion) =>
      applyNegation(suggestion, isNegated)
    )
  }

  if (pattern.endsWith('**/')) {
    return getGlobstarFolderSuggestions(pattern, allPaths, max).map((suggestion) =>
      applyNegation(suggestion, isNegated)
    )
  }

  const matcher = parseGlobToRegex(pattern)
  const suggestions = new Set<string>()

  for (const path of allPaths) {
    const normalized = normalizePath(path)
    if (matcher.test(normalized)) {
      suggestions.add(normalized)
    }
  }

  return Array.from(suggestions)
    .sort((a, b) => {
      const rankDiff = getRank(a, pattern) - getRank(b, pattern)
      return rankDiff || a.localeCompare(b)
    })
    .slice(0, max)
    .map((suggestion) => applyNegation(suggestion, isNegated))
}
