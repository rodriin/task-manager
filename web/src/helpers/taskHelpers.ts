// Task helpers: what goes in each section of the scan, and in what order.
// Plain functions with no React, so the tests can pass in a fixed "now".
// All day boundaries are the viewer's local day (date-fns works in local time).
import {
  addDays,
  endOfQuarter,
  isSameMonth,
  isSameQuarter,
  isSameWeek,
  startOfDay,
} from 'date-fns'
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

/**
 * The alert a task is showing right now, if any. Drives the colour everywhere:
 * red = overdue, amber = reminder reached (and not overdue).
 * Completed and archived tasks never alert.
 */
export function alertState(
  task: Task,
  now: Date,
): 'overdue' | 'reminder' | null {
  if (!isOpen(task)) return null
  if (isOverdue(task, now)) return 'overdue'
  if (isReminderActive(task, now)) return 'reminder'
  return null
}

// ---------------------------------------------------------------------------
// Full task list (All tasks tab): status, filters and search.

/** How far a task has got. Archived wins over Completed; open tasks show their stored status. */
export type TaskStatus =
  'Not started' | 'In progress' | 'Completed' | 'Archived'

export function taskStatus(task: Task): TaskStatus {
  if (task.archivedAt !== null) return 'Archived'
  if (task.completedAt !== null) return 'Completed'

  return task.status === 'In-Progress' ? 'In progress' : 'Not started'
}

/** Options of the Status filter. Open = Not started plus In progress. */
export const STATUS_FILTERS = [
  'Open',
  'Not started',
  'In progress',
  'Completed',
  'Archived',
] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export function matchesStatus(task: Task, filter: StatusFilter): boolean {
  return filter === 'Open' ? isOpen(task) : taskStatus(task) === filter
}
/** Options of the Deadline filter. Each is checked on its own, so they can overlap. */
export const DEADLINE_FILTERS = [
  'Overdue',
  'Today',
  'Tomorrow',
  'This week',
  'This month',
  'This quarter',
  'Later',
  'No deadline',
] as const
export type DeadlineFilter = (typeof DEADLINE_FILTERS)[number]

/**
 * Today and Tomorrow are calendar days in the viewer's time zone.
 * This week, This month and This quarter are the whole calendar period, past days included:
 * Monday to Sunday, 1st to last day, and the calendar quarter. So the Friday roll-up or the
 * quarterly paperwork shows whether it is still coming, overdue or done. They overlap each
 * other. Calendar quarters line up with the US federal fiscal quarters (the fiscal year
 * starts on 1 October). Later is after the end of this quarter.
 */
export function matchesDeadline(
  task: Task,
  filter: DeadlineFilter,
  now: Date,
): boolean {
  if (filter === 'No deadline') return task.deadline === null
  if (filter === 'Overdue') return isOverdue(task, now)
  if (task.deadline === null) return false

  const due = task.deadline.getTime()
  const today = startOfDay(now).getTime()
  const tomorrow = startOfDay(addDays(now, 1)).getTime()
  const dayAfter = startOfDay(addDays(now, 2)).getTime()
  const deadline = task.deadline

  switch (filter) {
    case 'Today':
      return due >= today && due < tomorrow
    case 'Tomorrow':
      return due >= tomorrow && due < dayAfter
    case 'This week':
      return isSameWeek(deadline, now, { weekStartsOn: 1 })
    case 'This month':
      return isSameMonth(deadline, now)
    case 'This quarter':
      return isSameQuarter(deadline, now)
    case 'Later':
      return due > endOfQuarter(now).getTime()
  }
}

/** Search: case-insensitive, in title, description, category, type and priority. */
export function matchesSearch(task: Task, query: string): boolean {
  const words = query.trim().toLowerCase()
  if (words === '') return true
  return [task.title, task.description, task.category, task.type, task.priority]
    .filter((text) => text !== null)
    .some((text) => text.toLowerCase().includes(words))
}
