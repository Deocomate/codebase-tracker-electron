import fs from 'fs/promises'
import path from 'path'

function looksLikeFilePath(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const hasSep = /[/\\]/.test(t)
  const lastSeg = t.split(/[/\\]/).pop() || ''
  const hasExt = lastSeg.includes('.')
  const noSpaces = !t.includes(' ') || t.includes('/')
  return (hasSep || hasExt) && noSpaces
}

function extractHeader(content: string): { header: string; body: string } {
  const lines = content.split('\n')
  let headerEnd = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('// ') && looksLikeFilePath(lines[i].slice(3))) {
      headerEnd = i
      break
    }
  }

  if (headerEnd < 0) return { header: '', body: content }

  return {
    header: lines.slice(0, headerEnd).join('\n'),
    body: lines.slice(headerEnd).join('\n')
  }
}

export async function splitOutputFile(
  outputPath: string,
  splitCount: number
): Promise<string[]> {
  let fullContent: string
  try {
    fullContent = await fs.readFile(outputPath, 'utf-8')
  } catch {
    return []
  }

  if (!fullContent.trim()) return []

  const { header, body } = extractHeader(fullContent)
  if (!body.trim()) return []

  const chunkSize = Math.max(1, Math.ceil(body.length / splitCount))
  const chunks: string[] = []

  for (let i = 0; i < splitCount; i++) {
    const start = i * chunkSize
    const chunk = i === splitCount - 1 ? body.slice(start) : body.slice(start, start + chunkSize)
    if (chunk) chunks.push(chunk)
  }

  const basePath = path.parse(outputPath)
  const generated: string[] = []

  for (let i = 0; i < chunks.length; i++) {
    const partName = `${basePath.name}_${i + 1}${basePath.ext}`
    const partPath = path.join(basePath.dir, partName)
    const partContent = `${header}\n# Part ${i + 1}/${chunks.length}\n\n${chunks[i]}`

    await fs.writeFile(partPath, partContent, 'utf-8')
    generated.push(partPath)
  }

  return generated
}
