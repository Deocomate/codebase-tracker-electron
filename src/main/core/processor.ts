import { FileScanner } from './scanner'
import { FileCombiner, CombinerStats } from './combiner'
import { IgnoreRules } from './ignoreRules'
import ignore from 'ignore'

type ProgressCallback = (message: string, progress: number) => void

export interface ProcessorResult {
  success: boolean
  message: string
  stats: CombinerStats | {}
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
        scanCallback('Applying attention patterns...', -1)

        const attnIg = ignore().add(effectivePatterns)
        const secondaryFiles: FileEntry[] = []
        const attentionFiles: FileEntry[] = []

        for (const file of categorizedFiles.codebase) {
          const normPath = file.relPath.replace(/\\/g, '/')
          if (attnIg.ignores(normPath)) {
            attentionFiles.push({ ...file, isAttention: true })
          } else {
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
    } catch (err: any) {
      return { success: false, message: `An unexpected error occurred: ${err.message}`, stats: {} }
    }
  }
}

interface FileEntry {
  absPath: string
  relPath: string
  isAttention?: boolean
}
