import fs from 'fs'
import path from 'path'
import { TreeBuilder } from './treeBuilder'
import { FORMATTERS } from './formatters'
import { IgnoreRules } from './ignoreRules'
import { splitOutputFile } from './fileSplitter'

type ProgressCallback = (message: string, progress: number) => void

interface FileEntry {
  absPath: string
  relPath: string
}

export interface CombinerStats {
  generated_files: string[]
  output_dir: string
  structure_file: string
  total_chars: number
  total_files_included: number
  ignored_items: number
  summary: string
}

export class FileCombiner {
  public projectPath: string
  public outputDir: string
  public structureFile: string
  private treeBuilder: TreeBuilder

  constructor(projectPath: string) {
    this.projectPath = projectPath
    this.outputDir = path.join(projectPath, '_codebase')
    this.structureFile = path.join(this.outputDir, 'codebase_structure.txt')
    this.treeBuilder = new TreeBuilder()
  }

  async combine(
    categorizedFiles: Record<string, FileEntry[]>,
    ignoredItems: { absPath: string; relPath: string; reason: string }[],
    ignoreRules: IgnoreRules,
    allFiles?: string[],
    callback?: ProgressCallback,
    cancelRef?: { cancelled: boolean },
    exportFormats?: string[],
    splitCountArg?: number | null
  ): Promise<{ success: boolean; message: string; stats: CombinerStats | {} }> {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const generatedFiles: string[] = []

    if (!exportFormats || exportFormats.length === 0) {
      exportFormats = ['txt']
    }

    const splitEnabled = ignoreRules.settings.split_config.enabled
    const splitCount = splitCountArg ?? ignoreRules.settings.split_config.split_count

    // Generate structure file
    if (allFiles) {
      callback?.('Generating structure tree...', 0.1)

      const tree = await this.treeBuilder.buildTree(this.projectPath, ignoreRules)
      await fs.promises.mkdir(this.outputDir, { recursive: true })
      await fs.promises.writeFile(
        this.structureFile,
        `# ${path.basename(this.projectPath)} | Structure | ${timestamp}\n\n${tree}`,
        'utf-8'
      )
      generatedFiles.push(path.basename(this.structureFile))
    }

    // Generate output files
    const configNames = Object.keys(categorizedFiles)
    const totalConfigs = configNames.length
    const totalFormats = exportFormats.length
    const totalStats = { total_chars: 0, total_files_included: 0 }

    for (let ci = 0; ci < configNames.length; ci++) {
      const configName = configNames[ci]
      const textFiles = categorizedFiles[configName]
      if (!textFiles || textFiles.length === 0) continue

      for (let fi = 0; fi < exportFormats.length; fi++) {
        if (cancelRef?.cancelled) return { success: false, message: 'Cancelled', stats: {} }

        const fmt = exportFormats[fi]
        const FormatterClass = FORMATTERS[fmt]
        if (!FormatterClass) continue

        const formatter = new FormatterClass()
        const ext = formatter.getExtension()
        const outputFilename = `${configName}.${ext}`
        const outputPath = path.join(this.outputDir, outputFilename)

        const progress = 0.5 + ((ci / totalConfigs) + (fi / (totalConfigs * totalFormats))) * 0.5

        callback?.(`Generating ${outputFilename} (${textFiles.length} files)...`, progress)

        try {
          const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' })
          const chars = await formatter.writeOutput(writeStream, configName, timestamp, textFiles)
          writeStream.end()

          await new Promise<void>((resolve, reject) => {
            writeStream.on('finish', resolve)
            writeStream.on('error', reject)
          })

          generatedFiles.push(outputFilename)
          totalStats.total_chars += chars

          // Auto-split if enabled and format is txt
          if (splitEnabled && fmt === 'txt') {
            callback?.(`Splitting ${outputFilename} into ${splitCount} parts...`, progress)
            const splitFiles = await splitOutputFile(outputPath, splitCount)

            if (splitFiles.length > 0) {
              try { await fs.promises.unlink(outputPath) } catch { /* ignore */ }
              const idx = generatedFiles.indexOf(outputFilename)
              if (idx >= 0) generatedFiles.splice(idx, 1)
              for (const sf of splitFiles) {
                generatedFiles.push(path.basename(sf))
              }
              callback?.(`Split into ${splitFiles.length} parts (original removed).`, progress)
            }
          }
        } catch (err) {
          console.error(`Error creating ${outputFilename}:`, err)
        }
      }

      totalStats.total_files_included += textFiles.length
    }

    const stats: CombinerStats = {
      generated_files: generatedFiles,
      output_dir: this.outputDir,
      structure_file: this.structureFile,
      total_chars: totalStats.total_chars,
      total_files_included: totalStats.total_files_included,
      ignored_items: ignoredItems.length,
      summary: `Created ${generatedFiles.length} files with ${totalStats.total_files_included} source files.`
    }

    return { success: true, message: 'Process Complete', stats }
  }
}
