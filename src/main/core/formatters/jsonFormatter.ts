import { BaseFormatter } from './baseFormatter'

export class JsonFormatter extends BaseFormatter {
  getExtension(): string { return 'json' }

  async formatOutput(
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string }[]
  ): Promise<string> {
    const output: Record<string, any> = {
      metadata: { config: configName, files_count: files.length, generated_at: timestamp },
      files: []
    }

    for (const { absPath, relPath } of files) {
      const content = await this._readFileContent(absPath, relPath)
      output.files.push({
        path: relPath.replace(/\\/g, '/'),
        language: this._getLanguageFromExtension(relPath),
        content
      })
    }

    return JSON.stringify(output, null, 2)
  }
}
