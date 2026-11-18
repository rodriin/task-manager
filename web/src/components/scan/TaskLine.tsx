import { when } from '../../helpers/formatDates'
import { alertState, isSnoozed } from '../../helpers/taskHelpers'
import type { Task } from '../../types'
import { Tag } from '../shared/Tag'
import { TitleButton } from '../shared/TitleButton'

/**
 * One task in a section of the scan (a line in a list). Color carries the alert state:
 * red = overdue; amber = reminder reached (and not overdue); otherwise plain.
 * Red and amber are kept for alerts only, so the High priority tag is neutral.
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
  const overdue = alert === 'overdue'
  const reminding = alert === 'reminder'
  const tone = overdue
    ? 'border-red-600 bg-red-50'
    : reminding
      ? 'border-amber-500 bg-amber-50'
      : 'border-gray-200 bg-white'

  return (
    <li className={`flex flex-col gap-1 border-l-4 px-3 py-2 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        {task.pinned && (
          <span role="img" title="Pinned" aria-label="Pinned">
            📌
          </span>
        )}
        <TitleButton task={task} onOpen={onOpen} />
        {task.priority === 'High' && (
          <Tag className="bg-gray-700 text-white">High</Tag>
        )}
        {task.status === 'In progress' && (
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
