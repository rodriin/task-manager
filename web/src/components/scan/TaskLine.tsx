import { short, when } from '../../helpers/formatDates'
import {
  alertReason,
  alertState,
  isNew,
  isSnoozed,
} from '../../helpers/taskHelpers'
import type { Task } from '../../types'
import { NewIcon, TimeIcon } from '../shared/Icons'
import { SnoozeMenu } from '../shared/SnoozeMenu'
import { Tag } from '../shared/Tag'
import { TitleButton } from '../shared/TitleButton'

/**
 * One task in a section of the scan (a line in a list), two lines at most.
 * The icon slot comes first, a fixed width, so the bells line up in a column: red bell =
 * overdue, amber bell = reminder reached or due soon, crossed-out bell = snoozed (quiet, no tint).
 * The bell is the snooze button. The tint and the time's color follow the same alert state.
 * Red and amber are kept for alerts only, so the High priority tag is neutral.
 * New is a violet icon right after the title, not a third tag next to High and In progress.
 *
 * Line 2 leads with the deadline, the one time spelled out. The reminder (only when it's the
 * alert, or there's no deadline) and the snooze end follow as a small icon and a short time, in
 * grey unless they're the alert. A reminder still ahead shows in the dialog only.
 */
export function TaskLine({
  task,
  now,
  onOpen,
}: {
  task: Task
  now: Date
  /** Opens the task's detail and edit dialog. */
  onOpen: (id: number) => void
}) {
  const alert = alertState(task, now)
  const tone =
    alert === 'overdue'
      ? 'border-red-600 bg-red-50'
      : alert
        ? 'border-amber-500 bg-amber-50'
        : 'border-gray-200 bg-white'
  const deadlineTone =
    alert === 'overdue'
      ? 'font-semibold text-red-700'
      : alert === 'soon'
        ? 'font-semibold text-amber-800'
        : 'text-gray-900'
  // Snoozed or not: the reminder shows when it's why the task alerts.
  const showReminder =
    task.remindAt !== null &&
    (alertReason(task, now) === 'reminder' || task.deadline === null)
  const snoozed = isSnoozed(task, now)

  return (
    <li className={`flex gap-2 border-l-4 py-2 pr-3 pl-2 ${tone}`}>
      <div className="flex w-5 shrink-0 justify-center pt-1">
        <SnoozeMenu task={task} now={now} />
      </div>
      <div className="flex min-w-0 grow flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <TitleButton task={task} onOpen={onOpen} />
          {isNew(task, now) && <NewIcon />}
          {task.pinned && (
            <span role="img" title="Pinned" aria-label="Pinned">
              📌
            </span>
          )}
          {task.priority === 'High' && (
            <Tag className="bg-gray-700 text-white">High</Tag>
          )}
          {task.status === 'In progress' && (
            <Tag className="bg-blue-200 text-blue-900">In progress</Tag>
          )}
          {task.category && (
            <span className="ml-auto text-sm text-gray-500">
              {task.category}
            </span>
          )}
        </div>
        {(task.deadline || showReminder || snoozed) && (
          <div className="flex flex-wrap gap-x-3 text-sm text-gray-600">
            {task.deadline && (
              <span className={deadlineTone}>
                Due {when(task.deadline, now)}
              </span>
            )}
            {showReminder && (
              <span
                title={`Reminder ${when(task.remindAt!, now)}`}
                className={`flex items-center gap-1 ${
                  alert === 'reminder'
                    ? 'font-semibold text-amber-800'
                    : 'text-gray-500'
                }`}
              >
                <TimeIcon kind="reminder" />
                <span className="sr-only">Reminder</span>
                {short(task.remindAt!, now)}
              </span>
            )}
            {snoozed && (
              <span
                title={`Snoozed until ${when(task.snoozedUntil!, now)}`}
                className="flex items-center gap-1 text-gray-400"
              >
                <TimeIcon kind="snoozed" />
                <span className="sr-only">Snoozed until</span>
                {short(task.snoozedUntil!, now)}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
