import { BaseFormatter } from './baseFormatter'

export class TxtFormatter extends BaseFormatter {
  getExtension(): string { return 'txt' }

  async formatOutput(
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string; source?: 'global' | 'search' }[]
  ): Promise<string> {
    const parts: string[] = []
    parts.push(`# ${configName} | ${files.length} files | ${timestamp}\n`)

    for (const { absPath, relPath, source } of files) {
      const content = await this._readFileContent(absPath, relPath)
      const prefix = source === 'search' ? '// [SEARCH MATCH] ' : '// '
      parts.push(`${prefix}${relPath}\n${content}\n`)
    }

    return parts.join('\n')
  }

  async writeOutput(
    fileHandle: { write: (s: string) => boolean },
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string; source?: 'global' | 'search' }[]
  ): Promise<number> {
    let chars = 0
    const header = `# ${configName} | ${files.length} files | ${timestamp}\n\n`
    fileHandle.write(header)
    chars += header.length

    for (const { absPath, relPath, source } of files) {
      const content = await this._readFileContent(absPath, relPath)
      const prefix = source === 'search' ? '// [SEARCH MATCH] ' : '// '
      const chunk = `${prefix}${relPath}\n${content}\n\n`
      fileHandle.write(chunk)
      chars += chunk.length
    }
    return chars
  }
}
