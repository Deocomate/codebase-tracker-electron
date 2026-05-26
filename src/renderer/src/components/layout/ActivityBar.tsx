import type { ReactElement } from 'react'
import { ClipboardList, EyeOff, Focus, Pin, Target } from 'lucide-react'

export type ActivityView = 'attention' | 'plan' | 'ignore' | 'track'

interface ActivityBarProps {
  activeView: ActivityView
  onChangeView: (view: ActivityView) => void
  onTogglePin: () => void
  isPinning?: boolean
}

const activities: Array<{ view: ActivityView; label: string; icon: typeof Focus }> = [
  { view: 'attention', label: 'Focus', icon: Focus },
  { view: 'plan', label: 'Plan', icon: ClipboardList },
  { view: 'ignore', label: 'Global Ignore', icon: EyeOff },
  { view: 'track', label: 'Global Track', icon: Target }
]

export default function ActivityBar({ activeView, onChangeView, onTogglePin, isPinning }: ActivityBarProps): ReactElement {
  return (
    <nav className="flex h-full w-12 shrink-0 flex-col items-center border-r border-borderDark/30 bg-[#20252b] py-2 text-slate-300">
      {activities.map(({ view, label, icon: Icon }) => {
        const active = activeView === view
        return (
          <button
            key={view}
            type="button"
            onClick={() => onChangeView(view)}
            className={[
              'relative flex h-12 w-12 items-center justify-center transition-colors',
              active ? 'text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
            ].join(' ')}
            title={label}
            aria-label={label}
            aria-pressed={active}
          >
            {active && <span className="absolute left-0 h-7 w-0.5 rounded-r bg-accent" />}
            <Icon size={22} />
          </button>
        )
      })}

      {/* Spacer pushes Mini Mode button to the bottom */}
      <div className="flex-1" />

      {/* Mini Mode button */}
      <button
        type="button"
        onClick={onTogglePin}
        disabled={isPinning}
        className="relative flex h-12 w-12 items-center justify-center text-slate-400 transition-colors hover:text-slate-100 disabled:opacity-50"
        title="Mini Mode"
        aria-label="Mini Mode"
      >
        <Pin size={20} />
      </button>
    </nav>
  )
}
