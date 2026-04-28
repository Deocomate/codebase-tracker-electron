import { BaseFormatter } from './baseFormatter'

export class MarkdownFormatter extends BaseFormatter {
  getExtension(): string { return 'md' }

  async formatOutput(
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string }[]
  ): Promise<string> {
    const parts: string[] = []
    parts.push(`# ${configName}\n`)
    parts.push(`> Generated: ${timestamp} | Files: ${files.length}\n`)
    parts.push('---\n')

    for (const { absPath, relPath } of files) {
      const content = await this._readFileContent(absPath, relPath)
      const lang = this._getLanguageFromExtension(relPath)
      const normPath = relPath.replace(/\\/g, '/')
      parts.push(`## \`${normPath}\`\n`)
      parts.push(`\`\`\`${lang}\n${content}\n\`\`\`\n`)
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
    const header = `# ${configName}\n\n> Generated: ${timestamp} | Files: ${files.length}\n\n---\n\n`
    fileHandle.write(header)
    chars += header.length

    for (const { absPath, relPath } of files) {
      const content = await this._readFileContent(absPath, relPath)
      const lang = this._getLanguageFromExtension(relPath)
      const normPath = relPath.replace(/\\/g, '/')
      const chunk = `## \`${normPath}\`\n\n\`\`\`${lang}\n${content}\n\`\`\`\n\n`
      fileHandle.write(chunk)
      chars += chunk.length
    }
    return chars
  }
}
