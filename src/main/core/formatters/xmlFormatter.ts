import { BaseFormatter } from './baseFormatter'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export class XmlFormatter extends BaseFormatter {
  getExtension(): string { return 'xml' }

  async formatOutput(
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string; isAttention?: boolean; isRelated?: boolean; importedBy?: string }[]
  ): Promise<string> {
    const parts: string[] = []
    parts.push('<?xml version="1.0" encoding="UTF-8"?>')
    parts.push(`<codebase config="${escapeXml(configName)}" files="${files.length}" generated="${timestamp}">`)

    for (const { absPath, relPath, isAttention, isRelated, importedBy } of files) {
      const content = await this._readFileContent(absPath, relPath)
      const lang = this._getLanguageFromExtension(relPath)
      const normPath = relPath.replace(/\\/g, '/')
      const safeContent = content.replace(/]]>/g, ']]]]><![CDATA[>')
      const attnAttr = isAttention ? ' is_attention="true"' : ''
      const relatedAttr = isRelated ? ` is_related="true" imported_by="${escapeXml(importedBy || '')}"` : ''
      parts.push(`  <file path="${escapeXml(normPath)}" language="${escapeXml(lang)}"${attnAttr}${relatedAttr}><![CDATA[${safeContent}]]></file>`)
    }

    parts.push('</codebase>')
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
    const header = `<?xml version="1.0" encoding="UTF-8"?>\n<codebase config="${escapeXml(configName)}" files="${files.length}" generated="${timestamp}">\n`
    fileHandle.write(header)
    chars += header.length

    if (instructionContent) {
      const safeInstructions = instructionContent.replace(/]]>/g, ']]]]><![CDATA[>')
      const line = `  <system_instructions><![CDATA[${safeInstructions}]]></system_instructions>\n`
      fileHandle.write(line)
      chars += line.length
    }

    for (const { absPath, relPath, isAttention, isRelated, importedBy } of files) {
      const content = await this._readFileContent(absPath, relPath)
      const lang = this._getLanguageFromExtension(relPath)
      const normPath = relPath.replace(/\\/g, '/')
      const safeContent = content.replace(/]]>/g, ']]]]><![CDATA[>')
      const attnAttr = isAttention ? ' is_attention="true"' : ''
      const relatedAttr = isRelated ? ` is_related="true" imported_by="${escapeXml(importedBy || '')}"` : ''
      const line = `  <file path="${escapeXml(normPath)}" language="${escapeXml(lang)}"${attnAttr}${relatedAttr}><![CDATA[${safeContent}]]></file>\n`
      fileHandle.write(line)
      chars += line.length
    }

    const footer = '</codebase>\n'
    fileHandle.write(footer)
    chars += footer.length
    return chars
  }
}
