import { FileScanner } from './scanner'
import { FileCombiner, CombinerStats } from './combiner'
import { IgnoreRules } from './ignoreRules'
import ignore from 'ignore'
import fs from 'fs/promises'
import path from 'path'
import { isTextFile } from './fileUtils'
import { collectRelatedDependencies } from './dependencyParser'

type ProgressCallback = (message: string, progress: number) => void

export interface ProcessorResult {
  success: boolean
  message: string
  stats: CombinerStats | Record<string, never>
}

export class ProjectProcessor {
  public projectPath: string
  private ignoreRules: IgnoreRules

  constructor(projectPath: string, ignoreRules: IgnoreRules) {
    this.projectPath = projectPath
    this.ignoreRules = ignoreRules
  }

  async run(
    scanCallback: ProgressCallback,
    combineCallback: ProgressCallback,
    cancelRef: { cancelled: boolean },
    exportFormats?: string[],
    splitCount?: number | null,
    attentionPatterns?: string[]
  ): Promise<ProcessorResult> {
    try {
      scanCallback('Scanning project files...', 0)

      const scanner = new FileScanner(this.projectPath, this.ignoreRules)
      const { categorizedFiles, ignoredItems, allFiles } = await scanner.scan(scanCallback, cancelRef)

      if (cancelRef.cancelled) {
        return { success: false, message: 'Process was cancelled by user.', stats: {} }
      }

      const effectivePatterns = (attentionPatterns ?? [])
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.trim())
        .filter(Boolean)

      if (effectivePatterns.length > 0) {
        scanCallback('Finding attention files...', -1)
        const attnIg = ignore().add(effectivePatterns)
        const attentionFilesMap = new Map<string, FileEntry>()

        // Quét độc lập để bắt toàn bộ các file khớp pattern 
        // (Ép đưa vào Context kể cả khi user không tick trong TreeView)
        const walk = async (relDir: string): Promise<void> => {
          const absDir = relDir ? path.join(this.projectPath, relDir) : this.projectPath
          let entries
          try {
            entries = await fs.readdir(absDir, { withFileTypes: true })
          } catch {
            return
          }
          for (const entry of entries) {
            if (entry.name === '_codebase') continue
            const relPath = relDir ? `${relDir}/${entry.name}` : entry.name
            
            // Vẫn tôn trọng Global Ignore (.git, node_modules, .env...)
            if (this.ignoreRules.isGloballyIgnoredByRelPath(relPath, entry.isDirectory())) continue

            if (entry.isDirectory()) {
              await walk(relPath)
            } else {
              const checkPath = relPath.replace(/\\/g, '/')
              if (attnIg.ignores(checkPath)) {
                // Chỉ lấy file văn bản (code), bỏ qua file ảnh/zip
                if (isTextFile(relPath)) {
                  attentionFilesMap.set(relPath, {
                    absPath: path.join(this.projectPath, relPath),
                    relPath,
                    isAttention: true
                  })
                }
              }
            }
          }
        }

        await walk('')

        const directAttentionFiles = Array.from(attentionFilesMap.values())
        const relatedAttentionFiles = await collectRelatedDependencies(this.projectPath, directAttentionFiles, {
          ignoreRules: this.ignoreRules,
          existingRelPaths: new Set(attentionFilesMap.keys())
        })

        for (const relatedFile of relatedAttentionFiles) {
          attentionFilesMap.set(relatedFile.relPath, {
            absPath: relatedFile.absPath,
            relPath: relatedFile.relPath,
            isAttention: true,
            isRelated: true,
            importedBy: relatedFile.importedBy
          })
        }

        const secondaryFiles: FileEntry[] = []
        const attentionFiles: FileEntry[] = Array.from(attentionFilesMap.values())

        // Phân tách các file user đã chọn trong TreeView
        for (const file of categorizedFiles.codebase) {
          // Tránh bị trùng lặp nếu file đó vừa được tick, vừa nằm trong attention pattern
          if (!attentionFilesMap.has(file.relPath)) {
            secondaryFiles.push(file)
          }
        }

        categorizedFiles.codebase = [...secondaryFiles, ...attentionFiles]
        scanCallback(
          `Attention split: ${secondaryFiles.length} secondary + ${attentionFiles.length} attention files.`,
          0.45
        )
      }

      const totalMatches = Object.values(categorizedFiles).reduce((sum, v) => sum + v.length, 0)
      scanCallback(
        `Scan complete! Found ${totalMatches} matches across ${Object.keys(categorizedFiles).length} configs.`,
        0.5
      )

      combineCallback('Combining files...', 0.5)

      const combiner = new FileCombiner(this.projectPath)
      const result = await combiner.combine(
        categorizedFiles,
        ignoredItems,
        this.ignoreRules,
        allFiles,
        combineCallback,
        cancelRef,
        exportFormats,
        splitCount
      )

      if (cancelRef.cancelled) {
        return { success: false, message: 'Process was cancelled by user.', stats: {} }
      }

      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message: `An unexpected error occurred: ${message}`, stats: {} }
    }
  }
}

interface FileEntry {
  absPath: string
  relPath: string
  isAttention?: boolean
  isRelated?: boolean
  importedBy?: string
}
