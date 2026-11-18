import { TaskRow } from './TaskRow'
import type { Task } from '../types'

interface Props {
  title: string
  subtitle?: string
  tasks: Task[]
  now: Date
  /** Hide the whole section when it has no tasks (Pinned, Reminders). */
  hideWhenEmpty?: boolean
}

/** One block of the scan: a heading with a count, then the tasks, or "Nothing due". */
export function TaskSection({
  title,
  subtitle,
  tasks,
  now,
  hideWhenEmpty = false,
}: Props) {
  if (hideWhenEmpty && tasks.length === 0) return null
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="flex items-baseline gap-2 text-lg font-semibold">
        {title}
        <span className="text-sm font-normal text-gray-500">
          {subtitle ? `${subtitle} ` : ''}({tasks.length}{' '}
          {tasks.length === 1 ? 'Task' : 'Tasks'})
        </span>
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing due</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} now={now} />
          ))}
        </ul>
      )}
    </section>
  )
}
