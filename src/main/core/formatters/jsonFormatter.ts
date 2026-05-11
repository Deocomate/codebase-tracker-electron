import { BaseFormatter } from './baseFormatter'

export class JsonFormatter extends BaseFormatter {
  getExtension(): string { return 'json' }

  // Khóa hàm formatOutput (vì nó gom toàn bộ RAM)
  // Bắt buộc phải gọi thông qua writeOutput để dùng cơ chế Streaming.
  async formatOutput(
    _configName: string,
    _timestamp: string,
    _files: { absPath: string; relPath: string }[]
  ): Promise<string> {
    throw new Error('Not implemented: JsonFormatter requires streaming via writeOutput.')
  }

  // Ghi đè writeOutput để xử lý theo kiểu luồng (Stream)
  async writeOutput(
    fileHandle: { write: (s: string) => boolean },
    configName: string,
    timestamp: string,
    files: { absPath: string; relPath: string; isAttention?: boolean }[],
    instructionContent?: string | null
  ): Promise<number> {
    let chars = 0

    const metadata: Record<string, unknown> = {
      config: configName,
      files_count: files.length,
      generated_at: timestamp
    }

    if (instructionContent) {
      metadata.system_instructions = instructionContent
    }

    const header = `{\n  "metadata": ${JSON.stringify(metadata, null, 2).replace(/\n/g, '\n  ')},\n  "files": [\n`
    fileHandle.write(header)
    chars += header.length

    for (let i = 0; i < files.length; i++) {
      const { absPath, relPath, isAttention } = files[i]
      const content = await this._readFileContent(absPath, relPath)

      const fileObj = {
        path: relPath.replace(/\\/g, '/'),
        language: this._getLanguageFromExtension(relPath),
        is_attention: Boolean(isAttention),
        content: content
      }

      // Convert object file thành JSON string với mức lùi lề 4 space
      let chunk = JSON.stringify(fileObj, null, 4)

      // Chỉnh lề toàn bộ chuỗi để thụt vào bên trong mảng "files": []
      chunk = chunk.split('\n').map(line => `    ${line}`).join('\n')

      // Nếu chưa phải file cuối cùng, cần thêm dấu phẩy
      if (i < files.length - 1) {
        chunk += ',\n'
      } else {
        chunk += '\n'
      }

      // Đẩy luồng văn bản xuống ổ cứng
      fileHandle.write(chunk)
      chars += chunk.length
    }

    // 3. Đóng mảng và Object
    const footer = `  ]\n}\n`
    fileHandle.write(footer)
    chars += footer.length

    return chars
  }
}
