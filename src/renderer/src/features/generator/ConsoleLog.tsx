import { useEffect, useRef, type ReactElement } from 'react'
import Card from '../../components/ui/Card'

interface ConsoleLogProps {
  logs: string[]
}

export default function ConsoleLog({ logs }: ConsoleLogProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight
      }
    })

    return () => cancelAnimationFrame(frameId)
  }, [logs])

  return (
    <Card title="Output Console" bodyClassName="p-0">
      <div
        ref={containerRef}
        className="h-48 overflow-y-auto rounded-b-lg bg-[#1e1e1e] p-4 font-mono text-[12px] text-[#cccccc] shadow-inner"
      >
        {logs.map((log, index) => (
          <div key={index} className="mb-1 leading-relaxed">
            <span className="mr-3 select-none text-[#858585]">
              [{new Date().toLocaleTimeString()}]
            </span>
            <span
              className={
                log.includes('Lỗi')
                  ? 'text-[#f48771]'
                  : log.includes('Hoàn tất')
                    ? 'text-[#89d185]'
                    : ''
              }
            >
              {log}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
