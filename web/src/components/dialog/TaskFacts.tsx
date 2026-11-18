import { day, when } from '../../helpers/formatDates'
import { alertState, isSnoozed } from '../../helpers/taskHelpers'
import type { Task } from '../../types'

/** What is derived about the task (alert, snooze, dates), as plain text above the fields. */
export function TaskFacts({ task, now }: { task: Task; now: Date }) {
  const alert = alertState(task, now)
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
      {alert === 'overdue' && task.deadline && (
        <span className="font-semibold text-red-700">
          Overdue · was due {when(task.deadline, now)}
        </span>
      )}
      {alert === 'reminder' && task.remindAt && (
        <span className="font-semibold text-amber-800">
          Reminder since {when(task.remindAt, now)}
        </span>
      )}
      {task.snoozedUntil && isSnoozed(task, now) && (
        <span>Snoozed until {when(task.snoozedUntil, now)}</span>
      )}
      <span>Created {day(task.createdAt, now)}</span>
      {task.completedAt && <span>Completed {day(task.completedAt, now)}</span>}
      {task.archivedAt && <span>Archived {day(task.archivedAt, now)}</span>}
    </div>
  )
}
