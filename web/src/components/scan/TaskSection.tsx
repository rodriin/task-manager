import { PrintIcon } from '../shared/Icons'
import { TaskLine } from './TaskLine'
import type { Task } from '../../types'

interface Props {
  title: string
  subtitle?: string
  tasks: Task[]
  now: Date
  /** Hide the whole section when it has no tasks (Pinned, New, Reminders). */
  hideWhenEmpty?: boolean
  /** What to say when there are no tasks (Today's "You're caught up"). Default: "Nothing due". */
  empty?: React.ReactNode
  onOpen: (id: number) => void
  /** Print this section as an index card. The button shows only when there are tasks. */
  onPrint?: () => void
}

/**
 * One block of the scan: a heading with a count, then the tasks, or "Nothing due".
 * A native <details>, so the heading collapses and expands it, by mouse or keyboard, with no
 * state code. Open by default; the count stays in the heading when it's collapsed.
 * The print button sits over the heading row, right-aligned with the list's border, but outside
 * the <details> and its <summary>: a click on it must never collapse the section, and it stays
 * reachable when the section is collapsed.
 */
export function TaskSection({
  title,
  subtitle,
  tasks,
  now,
  hideWhenEmpty = false,
  empty,
  onOpen,
  onPrint,
}: Props) {
  if (hideWhenEmpty && tasks.length === 0) return null
  return (
    <section aria-label={title} className="relative">
      <details open className="group flex flex-col">
        <summary className="cursor-pointer list-none rounded pr-8 [&::-webkit-details-marker]:hidden">
          <h2 className="inline-flex items-baseline gap-2 text-lg font-semibold">
            {/* Chevron: points right when collapsed, down when open. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="size-5 self-center text-gray-600 transition-transform group-open:rotate-90"
            >
              <path
                d="M7 4l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {title}
            <span className="text-sm font-normal text-gray-500">
              {subtitle ? `${subtitle} ` : ''}({tasks.length}{' '}
              {tasks.length === 1 ? 'Task' : 'Tasks'})
            </span>
          </h2>
        </summary>
        {tasks.length === 0 ? (
          (empty ?? <p className="mt-2 text-sm text-gray-500">Nothing due</p>)
        ) : (
          <ul className="mt-2 divide-y divide-gray-200 rounded border border-gray-200 bg-white">
            {tasks.map((task) => (
              <TaskLine key={task.id} task={task} now={now} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </details>
      {onPrint && tasks.length > 0 && (
        <button
          type="button"
          onClick={onPrint}
          aria-label={`Print ${title} as an index card`}
          title={`Print ${title} as an index card`}
          className="cursor-pointer absolute top-0.5 -right-1 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          <PrintIcon />
        </button>
      )}
    </section>
  )
}
