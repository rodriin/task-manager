import { format, isSameDay } from 'date-fns'
import { isOverdue, isReminderActive, isSnoozed } from '../helpers/taskHelpers'
import type { Task } from '../types'

// 24-hour times: military friendly, and what a flight schedule uses.
const TIME = 'HH:mm'
const DAY_TIME = 'EEE d MMM, HH:mm'

/** Show just the time when the date is today, otherwise the day as well. */
function when(date: Date, now: Date): string {
  return format(date, isSameDay(date, now) ? TIME : DAY_TIME)
}

function Tag({
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

/**
 * One task. Colour carries the alert state:
 * red = overdue; amber = reminder reached (and not overdue); otherwise plain.
 * Red and amber are kept for alerts only, so the High priority tag is neutral.
 */
export function TaskRow({ task, now }: { task: Task; now: Date }) {
  const overdue = isOverdue(task, now)
  const reminding = !overdue && isReminderActive(task, now)
  const tone = overdue
    ? 'border-red-600 bg-red-50'
    : reminding
      ? 'border-amber-500 bg-amber-50'
      : 'border-gray-200 bg-white'

  return (
    <li className={`flex flex-col gap-1 border-l-4 px-3 py-2 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        {task.pinned && (
          <span title="Pinned" aria-label="Pinned">
            📌
          </span>
        )}
        <span className="font-medium">{task.title}</span>
        {task.priority === 'High' && (
          <Tag className="bg-gray-700 text-white">High</Tag>
        )}
        {task.status === 'In-Progress' && (
          <Tag className="bg-blue-200 text-blue-900">In progress</Tag>
        )}
      </div>
      <div className="flex flex-wrap flex-col text-sm text-gray-600">
        <div className="flex flex-wrap justify-between grow">
          <div className="flex flex-wrap gap-x-3">
            {task.deadline &&
              (overdue ? (
                <span className="font-semibold text-red-700">
                  Overdue · was due {when(task.deadline, now)}
                </span>
              ) : (
                <span className="text-gray-900">
                  Due {when(task.deadline, now)}
                </span>
              ))}
            {task.remindAt && (
              <span className={reminding ? 'font-semibold text-amber-800' : ''}>
                Reminder {when(task.remindAt, now)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3">
            {task.category && (
              <span className="text-gray-500">{task.category}</span>
            )}
          </div>
        </div>
        <div>
          {task.snoozedUntil && isSnoozed(task, now) && (
            <span className="text-gray-400">
              Snoozed until {when(task.snoozedUntil, now)}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
