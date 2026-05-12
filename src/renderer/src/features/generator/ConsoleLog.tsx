import { useEffect, useRef, type ReactElement } from 'react'
import Card from '../../components/ui/Card'

interface ConsoleLogProps {
  logs: string[]
}

export default function ConsoleLog({ logs }: ConsoleLogProps): ReactElement {
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <Card title="Output Console">
      <div className="bg-[#1e1e1e] p-3 h-40 overflow-y-auto font-mono text-[12px] text-[#cccccc]">
        {logs.map((log, index) => (
          <div key={index} className="mb-0.5 leading-relaxed">
            <span className="text-[#858585] mr-2">
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
        <div ref={logEndRef} />
      </div>
    </Card>
  )
}
