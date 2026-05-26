import type { ReactElement, ReactNode } from 'react'

interface CardProps {
  title: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export default function Card({
  title,
  children,
  className = '',
  bodyClassName = 'p-5'
}: CardProps): ReactElement {
  return (
    <div className={`rounded-lg border border-borderDark/30 bg-white shadow-sm ${className}`}>
      <div className="rounded-t-lg border-b border-borderDark/10 bg-gray-50/50 px-5 py-3.5">
        {typeof title === 'string' ? (
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-textMain">
            {title}
          </h3>
        ) : (
          title
        )}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  )
}
