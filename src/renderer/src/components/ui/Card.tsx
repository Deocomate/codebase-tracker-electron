import type { ReactElement, ReactNode } from 'react'

interface CardProps {
  title: string
  children: ReactNode
  className?: string
}

export default function Card({ title, children, className = '' }: CardProps): ReactElement {
  return (
    <div className={`mb-8 ${className}`}>
      <h3 className="text-sm font-semibold text-textMain mb-3 pb-1 border-b border-borderDark">
        {title}
      </h3>
      <div className="px-1">{children}</div>
    </div>
  )
}
