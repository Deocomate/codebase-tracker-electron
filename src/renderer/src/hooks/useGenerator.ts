import { useCallback, useEffect, useState } from 'react'
import type { OutputFormats, Stats } from '../types'

interface GeneratorSettingsSnapshot {
  formats: OutputFormats
  splitEnabled: boolean
  splitCount: number
}

function selectedFromFormats(formats: OutputFormats): string[] {
  return Object.keys(formats).filter((format) => formats[format as keyof OutputFormats])
}

export interface UseGeneratorReturn {
  isGenerating: boolean
  progress: number
  logs: string[]
  toast: string | null
  stats: Stats | null
  appendLog: (message: string) => void
  startGeneration: () => Promise<void>
  cancelGeneration: () => Promise<void>
  openOutputFolder: () => Promise<void>
  autoCopy: () => Promise<void>
  openSettingsFile: () => Promise<void>
  openInstructionsFile: () => Promise<void>
  clearOutput: () => Promise<void>
}

export function useGenerator(
  projectPath: string,
  settings: GeneratorSettingsSnapshot,
  attentionPatterns: string[]
): UseGeneratorReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<string[]>(['Hệ thống sẵn sàng...'])
  const [toast, setToast] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)

  const appendLog = useCallback((message: string): void => {
    setLogs((prev) => [...prev, message])
  }, [])

  useEffect(() => {
    const unsubProgress = window.api.onProgressUpdate((prog, msg) => {
      if (prog >= 0) setProgress(Math.round(prog * 100))
      if (msg) appendLog(msg)
    })

    const unsubFinished = window.api.onGenerationFinished(async (success, msg, statsData) => {
      setIsGenerating(false)
      if (success) {
        setProgress(100)
        appendLog(`[Hoàn tất] ${msg}`)
        if (statsData) {
          setStats(statsData)
          const res = await window.api.auto_copy_files(statsData.generated_files)
          if (!('error' in res)) {
            setToast('Đã tạo thành công và Tự động Copy vào bộ nhớ tạm!')
            setTimeout(() => setToast(null), 4000)
          }
        }
      } else {
        appendLog(`[Lỗi] ${msg}`)
      }
    })

    return () => {
      unsubProgress()
      unsubFinished()
    }
  }, [appendLog])

  const startGeneration = useCallback(async (): Promise<void> => {
    if (!projectPath) return

    setIsGenerating(true)
    setProgress(0)
    setStats(null)
    await window.api.start_generation(
      selectedFromFormats(settings.formats),
      settings.splitEnabled,
      settings.splitCount,
      attentionPatterns
    )
  }, [attentionPatterns, projectPath, settings.formats, settings.splitCount, settings.splitEnabled])

  const cancelGeneration = useCallback(async (): Promise<void> => {
    await window.api.cancel_generation()
  }, [])

  const openOutputFolder = useCallback(async (): Promise<void> => {
    await window.api.open_output_folder()
  }, [])

  const autoCopy = useCallback(async (): Promise<void> => {
    if (!stats?.generated_files) return
    await window.api.auto_copy_files(stats.generated_files)
  }, [stats])

  const openSettingsFile = useCallback(async (): Promise<void> => {
    await window.api.open_settings_file()
  }, [])

  const openInstructionsFile = useCallback(async (): Promise<void> => {
    await window.api.open_instructions_file()
  }, [])

  const clearOutput = useCallback(async (): Promise<void> => {
    setStats(null)
    await window.api.clear_output()
  }, [])

  return {
    isGenerating,
    progress,
    logs,
    toast,
    stats,
    appendLog,
    startGeneration,
    cancelGeneration,
    openOutputFolder,
    autoCopy,
    openSettingsFile,
    openInstructionsFile,
    clearOutput
  }
}
