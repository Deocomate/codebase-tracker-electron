import { FileScanner } from './scanner'
import { FileCombiner, CombinerStats } from './combiner'
import { IgnoreRules } from './ignoreRules'
import { SearchEngine } from './searchEngine'

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
    searchKeywords?: string[]
  ): Promise<ProcessorResult> {
    try {
      scanCallback('Scanning project files...', 0)

      const scanner = new FileScanner(this.projectPath, this.ignoreRules)
      const { categorizedFiles, ignoredItems, allFiles } = await scanner.scan(scanCallback, cancelRef)

      if (cancelRef.cancelled) {
        return { success: false, message: 'Process was cancelled by user.', stats: {} }
      }

      const effectiveSearchKeywords = (searchKeywords ?? [])
        .filter((keyword): keyword is string => typeof keyword === 'string')
        .map((keyword) => keyword.trim())
        .filter(Boolean)

      if (effectiveSearchKeywords.length > 0) {
        scanCallback('Searching for keyword matches...', -1)

        const searchEngine = new SearchEngine(this.projectPath, this.ignoreRules)
        const searchFiles = await searchEngine.search(effectiveSearchKeywords)

        if (cancelRef.cancelled) {
          return { success: false, message: 'Process was cancelled by user.', stats: {} }
        }

        const searchAbsPaths = new Set(searchFiles.map((file) => file.absPath))
        const globalOnly = categorizedFiles.codebase.filter((file) => !searchAbsPaths.has(file.absPath))
        categorizedFiles.codebase = [...globalOnly, ...searchFiles]

        scanCallback(`Search complete! ${searchFiles.length} keyword matches found.`, 0.45)
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
