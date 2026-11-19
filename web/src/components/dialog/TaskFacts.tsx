import { formatDistanceStrict } from 'date-fns'
import { day, short, when } from '../../helpers/formatDates'
import { alertReason, alertState, isSnoozed } from '../../helpers/taskHelpers'
import type { Task } from '../../types'
import { SignalIcon } from '../shared/Icons'
import { ACCENT_BUTTON } from './styles'

/** "12 days", "3 hours": how far a time is from now, rounded down. */
const distance = (date: Date, now: Date) =>
  formatDistanceStrict(date, now, { roundingMethod: 'floor' })

/**
 * The task's state, one short line under the heading, or nothing when there's nothing to say.
 * The exact dates are in the fields below, so this says how far off they are ("Overdue by
 * 12 days", "Due in 3 hours"), with the exact time in the tooltip. A snoozed alert leads with
 * the snooze, names the alert in its color (red overdue, amber otherwise), and offers End snooze (applied on Save; starting a
 * snooze happens on the bell).
 */
export function TaskState({
  task,
  now,
  snoozeEnding,
  onEndSnooze,
}: {
  task: Task
  now: Date
  /** End snooze was clicked: the button hides until the dialog closes. */
  snoozeEnding: boolean
  onEndSnooze: () => void
}) {
  if (task.completedAt) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-green-800">
        <SignalIcon signal="done" />
        Completed {day(task.completedAt, now)}
      </p>
    )
  }
  const reason = alertReason(task, now)
  const alert =
    reason === 'overdue'
      ? {
          words: `Overdue by ${distance(task.deadline!, now)}`,
          exact: `Was due ${when(task.deadline!, now)}`,
        }
      : reason === 'soon'
        ? {
            words: `Due in ${distance(task.deadline!, now)}`,
            exact: `Due ${when(task.deadline!, now)}`,
          }
        : reason === 'reminder'
          ? {
              words: `Reminder since ${short(task.remindAt!, now)}`,
              exact: `Reminder ${when(task.remindAt!, now)}`,
            }
          : null

  if (task.snoozedUntil && isSnoozed(task, now)) {
    return (
      <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-gray-600">
        <SignalIcon signal="snoozed" />
        <span title={`Snoozed until ${when(task.snoozedUntil, now)}`}>
          Snoozed until {short(task.snoozedUntil, now)}
        </span>
        {alert && (
          <span
            title={alert.exact}
            className={reason === 'overdue' ? 'text-red-700' : 'text-amber-800'}
          >
            · {alert.words.charAt(0).toLowerCase() + alert.words.slice(1)}
          </span>
        )}
        {!snoozeEnding && (
          <button
            type="button"
            onClick={onEndSnooze}
            className={`${ACCENT_BUTTON} ml-1 text-sm`}
          >
            End snooze
          </button>
        )}
      </p>
    )
  }

  if (!alert || alertState(task, now) === null) return null
  const overdue = reason === 'overdue'
  return (
    <p
      title={alert.exact}
      className={`flex items-center gap-1.5 text-sm font-semibold ${overdue ? 'text-red-700' : 'text-amber-800'}`}
    >
      <SignalIcon signal={overdue ? 'overdue' : 'warning'} />
      {alert.words}
    </p>
  )
}

/** When the task was created (and archived): small print, at the bottom of the dialog. */
export function TaskDates({ task, now }: { task: Task; now: Date }) {
  return (
    <p className="text-xs text-gray-500">
      Created {day(task.createdAt, now)}
      {task.archivedAt && ` · Archived ${day(task.archivedAt, now)}`}
    </p>
  )
}
