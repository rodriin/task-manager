// Task helpers: what goes in each section of the scan, and in what order.
// Plain functions with no React, so the tests can pass in a fixed "now".
// All day boundaries are the viewer's local day (date-fns works in local time).
import { addDays, startOfDay } from 'date-fns'
import type { Task } from '../types'

/** Open = not completed and not archived. Only open tasks appear in the scan. */
export function isOpen(task: Task): boolean {
  return task.completedAt === null && task.archivedAt === null
}

/** Overdue = the deadline has passed and the task isn't completed. Derived, never stored. */
export function isOverdue(task: Task, now: Date): boolean {
  return (
    task.deadline !== null &&
    task.completedAt === null &&
    task.deadline.getTime() < now.getTime()
  )
}

/** The reminder time has been reached. */
export function isReminderActive(task: Task, now: Date): boolean {
  return task.remindAt !== null && task.remindAt.getTime() <= now.getTime()
}

/** True if the snooze is still running. An expired snooze is ignored. */
export function isSnoozed(task: Task, now: Date): boolean {
  return (
    task.snoozedUntil !== null && task.snoozedUntil.getTime() > now.getTime()
  )
}

const time = (date: Date | null) =>
  date === null ? Number.MAX_SAFE_INTEGER : date.getTime()

/** Earliest deadline first; no deadline last, by reminder time; then by id so the order is stable. */
function byDeadline(a: Task, b: Task): number {
  return (
    time(a.deadline) - time(b.deadline) ||
    time(a.remindAt) - time(b.remindAt) ||
    a.id - b.id
  )
}

/** Overdue tasks first, then by deadline. */
function overdueFirst(now: Date) {
  const rank = (task: Task) => (isOverdue(task, now) ? 0 : 1)
  return (a: Task, b: Task) => rank(a) - rank(b) || byDeadline(a, b)
}

/** Oldest reminder first: the one that has been waiting longest. */
function byReminder(a: Task, b: Task): number {
  return time(a.remindAt) - time(b.remindAt) || a.id - b.id
}

export interface Scan {
  pinned: Task[]
  today: Task[]
  tomorrow: Task[]
  reminders: Task[]
}

/**
 * Splits the open tasks into the four sections of the scan. Each task lands in the
 * first section it qualifies for, so it appears once:
 *
 * 1. Pinned: every pinned task, whatever its dates. Too important to be out of sight.
 * 2. Today: deadline before the end of today, overdue included.
 * 3. Tomorrow: deadline tomorrow.
 * 4. Reminders: the reminder has been reached, and the task isn't in any
 *    section above (deadline later, or no deadline).
 *
 * Tasks that fit none of these (due later, no reminder reached yet) are left for the full list.
 */
export function buildScan(tasks: Task[], now: Date): Scan {
  const startOfTomorrow = startOfDay(addDays(now, 1))
  const startOfDayAfter = startOfDay(addDays(now, 2))
  const scan: Scan = { pinned: [], today: [], tomorrow: [], reminders: [] }

  for (const task of tasks.filter(isOpen)) {
    const deadline = task.deadline?.getTime()
    if (task.pinned) scan.pinned.push(task)
    else if (deadline !== undefined && deadline < startOfTomorrow.getTime())
      scan.today.push(task)
    else if (deadline !== undefined && deadline < startOfDayAfter.getTime())
      scan.tomorrow.push(task)
    else if (isReminderActive(task, now)) scan.reminders.push(task)
  }

  scan.pinned.sort(overdueFirst(now))
  scan.today.sort(overdueFirst(now))
  scan.tomorrow.sort(byDeadline)
  scan.reminders.sort(byReminder)
  return scan
}
