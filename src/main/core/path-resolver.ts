/**
 * Path Resolver: Converts Linux/WSL paths to Windows UNC paths
 * 
 * This utility helps users work with WSL paths seamlessly on Windows by mapping
 * Linux paths (e.g., /home/user/project) to Windows UNC paths (e.g., \\wsl.localhost\Ubuntu-24.04\home\user\project)
 */

export interface WslConfig {
  enabled: boolean
  basePath: string
}

/**
 * Resolves a workspace path from Linux format to Windows UNC format if WSL is enabled.
 * 
 * @param inputPath - The path provided by the user (can be Linux or Windows format)
 * @param wslConfig - WSL configuration with enabled flag and basePath
 * @returns The resolved path ready for file system operations
 * 
 * @example
 * // WSL disabled, Windows path input
 * resolveWorkspacePath('C:\\Users\\Desktop', { enabled: false, basePath: '' })
 * // Returns: 'C:\\Users\\Desktop'
 * 
 * @example
 * // WSL enabled, Linux path input
 * resolveWorkspacePath('/home/minhlong/project', { enabled: true, basePath: '\\\\wsl.localhost\\Ubuntu-24.04' })
 * // Returns: '\\\\wsl.localhost\\Ubuntu-24.04\\home\\minhlong\\project'
 * 
 * @example
 * // WSL enabled, Windows path input (edge case handling)
 * resolveWorkspacePath('C:\\Users\\Desktop', { enabled: true, basePath: '\\\\wsl.localhost\\Ubuntu-24.04' })
 * // Returns: 'C:\\Users\\Desktop' (unchanged because it's already Windows path)
 */
export function resolveWorkspacePath(inputPath: string, wslConfig: WslConfig): string {
  // 1. Trim whitespace from input
  let path = inputPath.trim()

  // 2. If WSL is disabled OR path doesn't start with '/', return as-is
  if (!wslConfig.enabled || !path.startsWith('/')) {
    return path
  }

  // 3. Normalize WSL base path (remove trailing backslash if present)
  let basePath = wslConfig.basePath.trim()
  if (basePath.endsWith('\\')) {
    basePath = basePath.slice(0, -1)
  }

  // 4. Convert Input Path: Remove leading '/', replace '/' with '\'
  // Example: /home/minhlong -> home\minhlong
  let cleanInputPath = path.substring(1).replace(/\//g, '\\')

  // 5. Concatenate base path with clean input path
  return `${basePath}\\${cleanInputPath}`
}

/**
 * Validates a WSL base path format
 * @param basePath - The base path to validate
 * @returns true if the path is valid WSL UNC format, false otherwise
 */
export function isValidWslBasePath(basePath: string): boolean {
  const trimmed = basePath.trim()
  return trimmed.startsWith('\\\\wsl.localhost\\') || trimmed.startsWith('\\\\wsl$\\')
}

/**
 * Formats a WSL base path for display (removes trailing backslash)
 * @param basePath - The base path to format
 * @returns Formatted base path
 */
export function formatWslBasePath(basePath: string): string {
  let formatted = basePath.trim()
  if (formatted.endsWith('\\')) {
    formatted = formatted.slice(0, -1)
  }
  return formatted
}

/**
 * Gets display path for UI (preserves original Linux format if WSL is enabled)
 * @param osPath - The actual OS path used for file operations
 * @param linuxPath - The original Linux path provided by user
 * @param wslConfig - WSL configuration
 * @returns Display path for UI (preferring Linux format when WSL is enabled)
 */
export function getDisplayPath(osPath: string, linuxPath: string, wslConfig: WslConfig): string {
  // If WSL is enabled and we have the original Linux path, display that
  if (wslConfig.enabled && linuxPath.startsWith('/')) {
    return linuxPath
  }
  // Otherwise, display the actual OS path
  return osPath
}
