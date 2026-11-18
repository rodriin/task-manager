/** A small label next to a task title (High, In progress, Overdue). */
export function Tag({
  children,
  className,
}: {
  children: React.ReactNode
  className: string
}) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}
