import { BaseFormatter } from './baseFormatter'

const ATTENTION_MARKER = `\n---\n## CRITICAL ATTENTION CONTEXT\n---\n\n`

export class MarkdownFormatter extends BaseFormatter {
  getExtension(): string { return 'md' }

  async formatOutput(
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string; isAttention?: boolean; isRelated?: boolean; importedBy?: string }[]
  ): Promise<string> {
    const parts: string[] = []
    parts.push(`# ${configName}\n`)
    parts.push(`> Generated: ${timestamp} | Files: ${files.length}\n`)
    parts.push('---\n')

    let attentionMarkerInserted = false

    for (const { absPath, relPath, isAttention, isRelated, importedBy } of files) {
      if (isAttention && !attentionMarkerInserted) {
        parts.push(ATTENTION_MARKER)
        attentionMarkerInserted = true
      }

      const content = await this._readFileContent(absPath, relPath)
      const lang = this._getLanguageFromExtension(relPath)
      const normPath = relPath.replace(/\\/g, '/')
      parts.push(`## \`${normPath}\`\n`)
      if (isRelated) {
        parts.push(`> Attention related: imported by \`${importedBy || 'unknown'}\`\n`)
      }
      parts.push(`\`\`\`${lang}\n${content}\n\`\`\`\n`)
    }

    return parts.join('\n')
  }

  async writeOutput(
    fileHandle: { write: (s: string) => boolean },
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string; isAttention?: boolean; isRelated?: boolean; importedBy?: string }[],
    instructionContent?: string | null
  ): Promise<number> {
    let chars = 0
    const header = `# ${configName}\n\n> Generated: ${timestamp} | Files: ${files.length}\n\n---\n\n`
    fileHandle.write(header)
    chars += header.length

    if (instructionContent) {
      const instructions = `## System Instructions\n\n${instructionContent}\n\n---\n\n`
      fileHandle.write(instructions)
      chars += instructions.length
    }

    let attentionMarkerInserted = false

    for (const { absPath, relPath, isAttention, isRelated, importedBy } of files) {
      if (isAttention && !attentionMarkerInserted) {
        fileHandle.write(ATTENTION_MARKER)
        chars += ATTENTION_MARKER.length
        attentionMarkerInserted = true
      }

      const content = await this._readFileContent(absPath, relPath)
      const lang = this._getLanguageFromExtension(relPath)
      const normPath = relPath.replace(/\\/g, '/')
      const relatedLine = isRelated ? `\n> Attention related: imported by \`${importedBy || 'unknown'}\`\n` : ''
      const chunk = `## \`${normPath}\`\n${relatedLine}\n\`\`\`${lang}\n${content}\n\`\`\`\n\n`
      fileHandle.write(chunk)
      chars += chunk.length
    }
    return chars
  }
}
