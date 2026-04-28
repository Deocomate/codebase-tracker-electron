import fs from 'fs/promises'
import path from 'path'
import chardet from 'chardet'

// Binary file extensions - always skip
const NON_TEXT_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp', 'ico', 'heic', 'heif', 'avif',
  'icns', 'cur', 'mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'opus', 'mp4', 'mov',
  'avi', 'mkv', 'webm', 'flv', 'wmv', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'zip',
  'rar', 'tar', 'gz', '7z', 'bz2', 'xz', 'iso', 'img', 'dmg', 'pdf', 'doc', 'docx',
  'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'key', 'numbers', 'pages', 'exe',
  'dll', 'so', 'dylib', 'app', 'msi', 'deb', 'rpm', 'jar', 'db', 'sqlite', 'sqlite3',
  'mdb', 'accdb', 'sqlitedb', 'bin', 'dat', 'class', 'pyd', 'pyc', 'pyo', 'o', 'a',
  'lib', 'swf', 'psd', 'ai', 'eps', 'bak', 'tmp', 'temp', 'swp'
])

// Force text extensions - override MIME detection
const FORCE_TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'mts', 'cts',
  'jsx',
  'vue', 'svelte',
  'astro', 'mdx',
  'prisma', 'graphql', 'gql',
  'tf', 'tfvars',
  'proto',
  'html', 'htm', 'css', 'scss', 'less'
])

// Common text files by name
const COMMON_TEXT_FILES = new Set([
  'dockerfile', 'makefile', 'readme', 'license', 'authors', 'changelog',
  'contributing', 'procfile', 'gemfile', 'rakefile', 'jenkinsfile', 'vagrantfile',
  'pipeline', '.gitattributes', '.gitignore', '.gitmodules', '.npmrc',
  '.yarnrc', '.npmignore', '.babelrc', '.eslintrc', '.prettierrc', '.editorconfig',
  '.browserslistrc', 'requirements.txt', 'pipfile', 'go.mod', 'go.sum',
  'package.json', 'package-lock.json', 'yarn.lock', 'tsconfig.json',
  'manifest.json', 'config.xml', 'pom.xml', 'build.gradle', 'settings.gradle',
  'cmakelists.txt'
])

export function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase().replace('.', '')
  const baseName = path.basename(filePath).toLowerCase()

  // 1. Check common text files by name
  if (COMMON_TEXT_FILES.has(baseName)) return true
  // 2. Check .env / .lock
  if (baseName.endsWith('.env') || baseName.endsWith('.lock')) return true
  // 3. Skip known binary extensions
  if (NON_TEXT_EXTENSIONS.has(ext)) return false
  // 4. Force text
  if (FORCE_TEXT_EXTENSIONS.has(ext)) return true
  // 5-6. File không có extension hoặc không xác định → đọc thử
  return true
}

export async function readTextFile(filePath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filePath)
    const encoding = (await chardet.detect(buffer)) || 'utf-8'
    const decoder = new TextDecoder(encoding, { fatal: false })
    return decoder.decode(buffer)
  } catch {
    return `ERROR: Could not read file: ${filePath}`
  }
}

export function ensureDirectory(dirPath: string): void {
  fs.mkdir(dirPath, { recursive: true }).catch(() => {})
}

// Chỉ dùng để chuẩn hóa ID/Key lưu trữ, không dùng cho đọc/ghi file
export function normalizeForStorage(p: string): string {
  return p.replace(/\\/g, '/')
}

export function getRelativePath(absPath: string, basePath: string): string {
  return normalizeForStorage(path.relative(basePath, absPath))
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIdx = 0
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024
    unitIdx++
  }
  return `${size.toFixed(2)} ${units[unitIdx]}`
}
