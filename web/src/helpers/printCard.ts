// What one task looks like on a printed index card. Plain text, because most printers are
// black and white: flags are words and marks, not colors.
import type { Task } from '../types'
import { short } from './formatDates'
import { isOverdue } from './taskHelpers'

export interface CardLine {
  id: number
  title: string
  high: boolean
  pinned: boolean
  /** Overdue prints as OVERDUE, snoozed or not: paper can't snooze. */
  overdue: boolean
  /** The deadline ("20:00", "Thu 20:00"), "Rem 07:00" when there's only a reminder, or ''. */
  time: string
}

export function cardLine(task: Task, now: Date): CardLine {
  let time = ''
  if (task.deadline) time = short(task.deadline, now)
  else if (task.remindAt) time = `Rem ${short(task.remindAt, now)}`
  return {
    id: task.id,
    title: task.title,
    high: task.priority === 'High',
    pinned: task.pinned,
    overdue: isOverdue(task, now),
    time,
  }
}
