/**
 * Path Mapper: Bi-directional translation between Windows UNC paths and Linux POSIX paths.
 * Used by WorkerManager to translate paths when communicating with WSL Worker processes.
 */

/**
 * Extract the distro name from a WSL UNC path.
 * @example extractDistro('\\\\wsl.localhost\\Ubuntu-24.04\\home\\user') → 'Ubuntu-24.04'
 * @example extractDistro('\\\\wsl$\\Ubuntu\\home\\user') → 'Ubuntu'
 */
export function extractDistro(wslUncPath: string): string | null {
  // Match \\wsl.localhost\<distro> or \\wsl$\<distro>
  const match = wslUncPath.match(/^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)/)
  return match ? match[1] : null
}

/**
 * Convert a Windows UNC WSL path to a Linux POSIX path.
 * @example windowsToLinux('\\\\wsl.localhost\\Ubuntu-24.04\\home\\user\\project') → '/home/user/project'
 */
export function windowsToLinux(wslUncPath: string): string {
  // Remove \\wsl.localhost\<distro> or \\wsl$\<distro> prefix
  const cleaned = wslUncPath.replace(/^\\\\(?:wsl\.localhost|wsl\$)\\[^\\]+/, '')
  // Convert remaining backslashes to forward slashes
  const posix = cleaned.replace(/\\/g, '/')
  // Ensure leading slash
  return posix.startsWith('/') ? posix : `/${posix}`
}

/**
 * Convert a Linux POSIX path back to Windows UNC WSL path.
 * @example linuxToWindows('/home/user/project', 'Ubuntu-24.04') → '\\\\wsl.localhost\\Ubuntu-24.04\\home\\user\\project'
 */
export function linuxToWindows(linuxPath: string, distro: string): string {
  const windowsRelPath = linuxPath.replace(/\//g, '\\')
  return `\\\\wsl.localhost\\${distro}${windowsRelPath}`
}

/**
 * Detect if a path is a WSL UNC path.
 */
export function isWslPath(inputPath: string): boolean {
  return inputPath.startsWith('\\\\wsl.localhost\\') || inputPath.startsWith('\\\\wsl$\\')
}

/**
 * Convert a Windows path to a WSL mount path (for accessing Windows files from inside WSL).
 * @example windowsToWslMount('C:\\Users\\user\\app\\out\\main\\worker.js') → '/mnt/c/Users/user/app/out/main/worker.js'
 */
export function windowsToWslMount(windowsPath: string): string {
  // Match drive letter: C:\ or c:\
  const match = windowsPath.match(/^([a-zA-Z]):\\(.*)$/)
  if (!match) return windowsPath

  const driveLetter = match[1].toLowerCase()
  const rest = match[2].replace(/\\/g, '/')
  return `/mnt/${driveLetter}/${rest}`
}
