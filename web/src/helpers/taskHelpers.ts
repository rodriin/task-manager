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
import type { Status, Task } from '../types'
import { day, when } from './formatDates'

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

/** How far ahead "due soon" looks. */
export const DUE_SOON_MS = 24 * 60 * 60 * 1000

/**
 * Due soon = open, no reminder, and the deadline is in the next 24 hours. A task with a reminder
 * alerts by its reminder instead: he already chose when to be told, so the app doesn't guess.
 */
export function isDueSoon(task: Task, now: Date): boolean {
  if (!isOpen(task) || task.remindAt !== null || task.deadline === null)
    return false
  const left = task.deadline.getTime() - now.getTime()
  return left > 0 && left <= DUE_SOON_MS
}

/** How long a task counts as New after it's created. */
export const NEW_FOR_MS = 24 * 60 * 60 * 1000

/**
 * New = open and created in the past 24 hours, overdue or not. Derived from createdAt, never
 * stored. It keeps a fresh capture easy to see (and hard to add twice) for its first day.
 */
export function isNew(task: Task, now: Date): boolean {
  // No lower bound: `now` ticks once a minute and the server's clock may differ slightly, so a
  // task created a moment ago can look a few seconds "in the future". It is still new.
  return isOpen(task) && now.getTime() - task.createdAt.getTime() < NEW_FOR_MS
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
  newTasks: Task[]
  reminders: Task[]
}

/**
 * Splits the open tasks into the five sections of the scan. Each task lands in the
 * first section it qualifies for, so it appears once:
 *
 * 1. Pinned: every pinned task, whatever its dates. Too important to be out of sight.
 * 2. Today: deadline before the end of today, overdue included.
 * 3. Tomorrow: deadline tomorrow.
 * 4. New: created in the past 24 hours, so a task just added with no date (or a later one)
 *    is still in sight. Newest first.
 * 5. Reminders: the reminder has been reached, and the task isn't in any
 *    section above (deadline later, or no deadline).
 *
 * Tasks that fit none of these (due later, no reminder reached yet) are left for the full list.
 */
export function buildScan(tasks: Task[], now: Date): Scan {
  const startOfTomorrow = startOfDay(addDays(now, 1))
  const startOfDayAfter = startOfDay(addDays(now, 2))
  const scan: Scan = {
    pinned: [],
    today: [],
    tomorrow: [],
    newTasks: [],
    reminders: [],
  }

  for (const task of tasks.filter(isOpen)) {
    const deadline = task.deadline?.getTime()
    if (task.pinned) scan.pinned.push(task)
    else if (deadline !== undefined && deadline < startOfTomorrow.getTime())
      scan.today.push(task)
    else if (deadline !== undefined && deadline < startOfDayAfter.getTime())
      scan.tomorrow.push(task)
    else if (isNew(task, now)) scan.newTasks.push(task)
    else if (isReminderActive(task, now)) scan.reminders.push(task)
  }

  scan.pinned.sort(overdueFirst(now))
  scan.today.sort(overdueFirst(now))
  scan.tomorrow.sort(byDeadline)
  scan.newTasks.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
  )
  scan.reminders.sort(byReminder)
  return scan
}

export type Alert = 'overdue' | 'reminder' | 'soon'

/**
 * Why a task would alert, ignoring any snooze. The first that applies wins: overdue, then the
 * reminder (he set it himself), then due soon. Completed and archived tasks never alert.
 */
export function alertReason(task: Task, now: Date): Alert | null {
  if (!isOpen(task)) return null
  if (isOverdue(task, now)) return 'overdue'
  if (isReminderActive(task, now)) return 'reminder'
  if (isDueSoon(task, now)) return 'soon'
  return null
}

/**
 * The alert a task is showing right now, if any. Drives the color and the bell everywhere:
 * red = overdue, amber = reminder reached or due soon. A running snooze quiets it (null); the
 * task stays where it is, and the alert comes back by itself when the snooze ends.
 */
export function alertState(task: Task, now: Date): Alert | null {
  return isSnoozed(task, now) ? null : alertReason(task, now)
}

/** The icon a task shows: a red or amber bell, the snoozed bell, the done check, or none. */
export type Signal = 'overdue' | 'warning' | 'snoozed' | 'done'

export function taskSignal(task: Task, now: Date): Signal | null {
  if (task.archivedAt !== null) return null
  if (task.completedAt !== null) return 'done'
  if (isSnoozed(task, now)) return 'snoozed'
  const alert = alertReason(task, now)
  if (alert === 'overdue') return 'overdue'
  return alert ? 'warning' : null
}

/** The words an icon stands for, e.g. "Overdue, was due Mon 16 Nov, 20:00". */
export function signalLabel(task: Task, now: Date): string | null {
  const signal = taskSignal(task, now)
  if (signal === 'done') return `Completed ${day(task.completedAt!, now)}`
  if (signal === 'snoozed')
    return `Snoozed until ${when(task.snoozedUntil!, now)}`
  const reason = alertReason(task, now)
  if (reason === 'overdue')
    return `Overdue, was due ${when(task.deadline!, now)}`
  if (reason === 'reminder')
    return `Reminder since ${when(task.remindAt!, now)}`
  if (reason === 'soon') return `Due soon, ${when(task.deadline!, now)}`
  return null
}

// ---------------------------------------------------------------------------
// Full task list (All tasks tab): status, filters and search.

/**
 * How far a task has got. Archived wins over Completed; open tasks show their stored status,
 * which uses the same words as the UI ('Not started', 'In progress').
 */
export type TaskStatus = Status | 'Completed' | 'Archived'

export function taskStatus(task: Task): TaskStatus {
  if (task.archivedAt !== null) return 'Archived'
  if (task.completedAt !== null) return 'Completed'
  return task.status
}

/**
 * Options of the Status filter. Open = Not started plus In progress. New = the tasks showing
 * the New tag (open, created in the past 24 hours), overdue ones included. Alerting = a bell
 * showing now (not snoozed); Snoozed = a running snooze. Like New, these aren't stored statuses.
 */
export const STATUS_FILTERS = [
  'Open',
  'New',
  'Alerting',
  'Snoozed',
  'Not started',
  'In progress',
  'Completed',
  'Archived',
] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export function matchesStatus(
  task: Task,
  filter: StatusFilter,
  now: Date,
): boolean {
  if (filter === 'Open') return isOpen(task)
  if (filter === 'New') return isNew(task, now)
  if (filter === 'Alerting') return alertState(task, now) !== null
  if (filter === 'Snoozed') return isOpen(task) && isSnoozed(task, now)
  return taskStatus(task) === filter
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
