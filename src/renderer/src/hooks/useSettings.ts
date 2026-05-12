import { useCallback, useState } from 'react'
import type { OutputFormats } from '../types'

const DEFAULT_FORMATS: OutputFormats = {
  txt: true,
  json: false,
  md: false,
  xml: false
}

function formatsFromSelected(selectedFormats: string[]): OutputFormats {
  const nextFormats: OutputFormats = { txt: false, json: false, md: false, xml: false }
  selectedFormats.forEach((format) => {
    if (format in nextFormats) nextFormats[format as keyof OutputFormats] = true
  })
  return nextFormats
}

function selectedFromFormats(formats: OutputFormats): string[] {
  return Object.keys(formats).filter((format) => formats[format as keyof OutputFormats])
}

export interface UseSettingsReturn {
  formats: OutputFormats
  splitEnabled: boolean
  splitCount: number
  instructionsEnabled: boolean
  fetchSettings: () => Promise<void>
  updateSettings: (
    newFormats: OutputFormats,
    newSplitEnabled: boolean,
    newSplitCount: number,
    newInstructionsEnabled?: boolean
  ) => Promise<void>
}

export function useSettings(projectPath: string): UseSettingsReturn {
  const [formats, setFormats] = useState<OutputFormats>(DEFAULT_FORMATS)
  const [splitEnabled, setSplitEnabled] = useState(true)
  const [splitCount, setSplitCount] = useState(5)
  const [instructionsEnabled, setInstructionsEnabled] = useState(false)

  const fetchSettings = useCallback(async (): Promise<void> => {
    const settingsRes = await window.api.get_settings()
    if (settingsRes.status !== 'success' || !settingsRes.ui_preferences) return

    const { selected_formats, split_enabled, split_count } = settingsRes.ui_preferences
    setFormats(formatsFromSelected(selected_formats))
    setSplitEnabled(split_enabled)
    setSplitCount(split_count)
    if (settingsRes.instructions_config) {
      setInstructionsEnabled(settingsRes.instructions_config.enabled)
    }
  }, [])

  const updateSettings = useCallback(
    async (
      newFormats: OutputFormats,
      newSplitEnabled: boolean,
      newSplitCount: number,
      newInstructionsEnabled?: boolean
    ): Promise<void> => {
      setFormats(newFormats)
      setSplitEnabled(newSplitEnabled)
      setSplitCount(newSplitCount)
      if (newInstructionsEnabled !== undefined) setInstructionsEnabled(newInstructionsEnabled)

      if (projectPath) {
        await window.api.save_settings(
          selectedFromFormats(newFormats),
          newSplitEnabled,
          newSplitCount,
          newInstructionsEnabled
        )
      }
    },
    [projectPath]
  )

  return {
    formats,
    splitEnabled,
    splitCount,
    instructionsEnabled,
    fetchSettings,
    updateSettings
  }
}
