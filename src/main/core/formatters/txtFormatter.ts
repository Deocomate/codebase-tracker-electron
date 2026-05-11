import { BaseFormatter } from './baseFormatter'

const ATTENTION_MARKER = `\n${'='.repeat(64)}\nCRITICAL ATTENTION CONTEXT (BELOW)\n${'='.repeat(64)}\n\n`

export class TxtFormatter extends BaseFormatter {
  getExtension(): string { return 'txt' }

  async formatOutput(
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string; isAttention?: boolean }[]
  ): Promise<string> {
    const parts: string[] = []
    parts.push(`# ${configName} | ${files.length} files | ${timestamp}\n`)

    let attentionMarkerInserted = false

    for (const { absPath, relPath, isAttention } of files) {
      if (isAttention && !attentionMarkerInserted) {
        parts.push(ATTENTION_MARKER)
        attentionMarkerInserted = true
      }

      const content = await this._readFileContent(absPath, relPath)
      const prefix = isAttention ? '// [ATTENTION] ' : '// '
      parts.push(`${prefix}${relPath}\n${content}\n`)
    }

    return parts.join('\n')
  }

  async writeOutput(
    fileHandle: { write: (s: string) => boolean },
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string; isAttention?: boolean }[],
    instructionContent?: string | null
  ): Promise<number> {
    let chars = 0
    const header = `# ${configName} | ${files.length} files | ${timestamp}\n\n`
    fileHandle.write(header)
    chars += header.length

    if (instructionContent) {
      const instructions = `\n${'='.repeat(64)}\nSYSTEM INSTRUCTIONS\n${'='.repeat(64)}\n\n${instructionContent}\n\n${'='.repeat(64)}\n\n`
      fileHandle.write(instructions)
      chars += instructions.length
    }

    let attentionMarkerInserted = false

    for (const { absPath, relPath, isAttention } of files) {
      if (isAttention && !attentionMarkerInserted) {
        fileHandle.write(ATTENTION_MARKER)
        chars += ATTENTION_MARKER.length
        attentionMarkerInserted = true
      }

      const content = await this._readFileContent(absPath, relPath)
      const prefix = isAttention ? '// [ATTENTION] ' : '// '
      const chunk = `${prefix}${relPath}\n${content}\n\n`
      fileHandle.write(chunk)
      chars += chunk.length
    }
    return chars
  }
}
