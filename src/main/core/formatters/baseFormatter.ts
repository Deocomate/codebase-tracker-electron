import { readTextFile } from '../fileUtils'
import path from 'path'

const COMMENT_MARKERS: Record<string, string> = {
  '.py': '#', '.sh': '#', '.rb': '#', '.yml': '#', '.yaml': '#',
  '.js': '//', '.ts': '//', '.tsx': '//', '.jsx': '//',
  '.java': '//', '.c': '//', '.cpp': '//', '.h': '//',
  '.cs': '//', '.go': '//', '.rs': '//', '.swift': '//', '.kt': '//'
}

export abstract class BaseFormatter {
  abstract getExtension(): string

  constructor(public stripComments = true) {}

  abstract formatOutput(
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string; isAttention?: boolean; isRelated?: boolean; importedBy?: string }[]
  ): Promise<string>

  async writeOutput(
    fileHandle: { write: (s: string) => boolean },
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string; isAttention?: boolean; isRelated?: boolean; importedBy?: string }[],
    _instructionContent?: string | null
  ): Promise<number> {
    void _instructionContent
    const content = await this.formatOutput(configName, timestamp, files)
    fileHandle.write(content)
    return content.length
  }

  protected async _readFileContent(absPath: string, relPath: string): Promise<string> {
    try {
      const content = await readTextFile(absPath)
      if (!this.stripComments) return content

      const marker = COMMENT_MARKERS[path.extname(relPath).toLowerCase()]
      return content
        .split('\n')
        .filter(line => {
          const trimmed = line.trim()
          if (!trimmed) return false
          if (marker && trimmed.startsWith(marker)) return false
          return true
        })
        .join('\n')
    } catch {
      return `ERROR: Could not read file: ${relPath}`
    }
  }

  protected _getLanguageFromExtension(relPath: string): string {
    const extMap: Record<string, string> = {
      '.py': 'python', '.js': 'javascript', '.ts': 'typescript',
      '.tsx': 'tsx', '.jsx': 'jsx', '.java': 'java',
      '.c': 'c', '.cpp': 'cpp', '.cs': 'csharp',
      '.go': 'go', '.rs': 'rust', '.swift': 'swift',
      '.kt': 'kotlin', '.rb': 'ruby', '.php': 'php',
      '.sh': 'bash', '.ps1': 'powershell',
      '.yml': 'yaml', '.yaml': 'yaml', '.json': 'json',
      '.xml': 'xml', '.html': 'html', '.css': 'css',
      '.scss': 'scss', '.less': 'less', '.sql': 'sql',
      '.md': 'markdown', '.vue': 'vue', '.svelte': 'svelte'
    }
    return extMap[path.extname(relPath).toLowerCase()] || ''
  }
}
