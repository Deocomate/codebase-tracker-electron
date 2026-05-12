import type { ReactElement } from 'react'
import Card from '../../components/ui/Card'
import type { OutputFormats } from '../../types'

interface WorkspaceSettingsProps {
  projectPath: string
  formats: OutputFormats
  splitEnabled: boolean
  splitCount: number
  instructionsEnabled: boolean
  onUpdateSettings: (
    formats: OutputFormats,
    splitEnabled: boolean,
    splitCount: number,
    instructionsEnabled?: boolean
  ) => void | Promise<void>
  onEditInstructions: () => void | Promise<void>
}

export default function WorkspaceSettings({
  projectPath,
  formats,
  splitEnabled,
  splitCount,
  instructionsEnabled,
  onUpdateSettings,
  onEditInstructions
}: WorkspaceSettingsProps): ReactElement {
  return (
    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-8">
      <Card title="Export Formats">
        <div className="flex flex-wrap gap-4 mt-1">
          {['txt', 'json', 'md', 'xml'].map((format) => (
            <label key={format} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 border-borderDark text-accent focus:ring-accent"
                checked={formats[format as keyof OutputFormats]}
                onChange={(event) =>
                  onUpdateSettings({ ...formats, [format]: event.target.checked }, splitEnabled, splitCount)
                }
              />
              <span className="uppercase text-[13px] text-textMain">{format}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card title="Output Splitting (Token limit)">
        <div className="flex items-center gap-6 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 border-borderDark text-accent focus:ring-accent"
              checked={splitEnabled}
              onChange={(event) => onUpdateSettings(formats, event.target.checked, splitCount)}
            />
            <span className="text-[13px] text-textMain">Enable split</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-textMuted">Parts:</span>
            <input
              type="number"
              min={2}
              max={20}
              value={splitCount}
              onChange={(event) => onUpdateSettings(formats, splitEnabled, Number(event.target.value))}
              disabled={!splitEnabled}
              className="w-16 bg-white border border-borderDark rounded-sm px-2 py-1 text-[13px] focus:border-accent disabled:bg-gray-50 disabled:opacity-50"
            />
          </div>
        </div>
      </Card>

      <Card title="LLM Instructions">
        <div className="flex items-center gap-4 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 border-borderDark text-accent focus:ring-accent"
              checked={instructionsEnabled}
              onChange={(event) =>
                onUpdateSettings(formats, splitEnabled, splitCount, event.target.checked)
              }
            />
            <span className="text-[13px] text-textMain">
              Include LLM Instructions (instructions.md)
            </span>
          </label>
          <button
            onClick={onEditInstructions}
            disabled={!projectPath}
            className="text-[13px] text-accent hover:text-accentHover underline underline-offset-2 disabled:opacity-40 disabled:no-underline transition"
            title="Open instructions.md in default editor"
          >
            Edit
          </button>
        </div>
      </Card>
    </div>
  )
}
