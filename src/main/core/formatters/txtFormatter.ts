import { BaseFormatter } from './baseFormatter'

export class TxtFormatter extends BaseFormatter {
  getExtension(): string { return 'txt' }

  async formatOutput(
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string }[]
  ): Promise<string> {
    const parts: string[] = []
    parts.push(`# ${configName} | ${files.length} files | ${timestamp}\n`)

    for (const { absPath, relPath } of files) {
      const content = await this._readFileContent(absPath, relPath)
      parts.push(`// ${relPath}\n${content}\n`)
    }

    return parts.join('\n')
  }

  async writeOutput(
    fileHandle: { write: (s: string) => boolean },
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string }[]
  ): Promise<number> {
    let chars = 0
    const header = `# ${configName} | ${files.length} files | ${timestamp}\n\n`
    fileHandle.write(header)
    chars += header.length

    for (const { absPath, relPath } of files) {
      const content = await this._readFileContent(absPath, relPath)
      const chunk = `// ${relPath}\n${content}\n\n`
      fileHandle.write(chunk)
      chars += chunk.length
    }
    return chars
  }
}
