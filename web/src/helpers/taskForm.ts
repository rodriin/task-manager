// The edit form's rules, as plain functions with no React, so the tests can pass in a fixed "now".
// The form holds strings and booleans (what the inputs hold); `planSave` turns them into the
// PATCH to send, the errors to show, and the notes about what else the save will change.
import { format, set, subDays } from 'date-fns'
import type { TaskPatch } from '../api/client'
import type { Priority, Status, Task } from '../types'
import { isSnoozed } from './taskHelpers'

export const STATUSES: Status[] = ['Not started', 'In progress']
export const PRIORITIES: Priority[] = ['Low', 'Medium', 'High']
export const CATEGORIES = ['Admin', 'Supply', 'Flight', 'Personal']
export const TYPES = ['Follow-up', 'Reminder', 'Sign-off', 'Recurring']

/** Filled in when a date is picked and the time is empty. Same defaults as the seed. */
export const DEFAULT_DEADLINE_TIME = '20:00'
export const DEFAULT_REMINDER_TIME = '07:00'

export const TITLE_MAX = 120
export const DESCRIPTION_MAX = 5000

/** What the form's inputs hold. Dates are 'yyyy-MM-dd' (the date picker), times 'HH:mm'; '' = empty. */
export interface FormValues {
  title: string
  description: string
  status: Status
  priority: Priority
  category: string // '' = none
  type: string // '' = none
  deadlineDate: string
  deadlineTime: string
  remindDate: string
  remindTime: string
  pinned: boolean
  completed: boolean
  archived: boolean
}

const dateOf = (date: Date | null) => (date ? format(date, 'yyyy-MM-dd') : '')
const timeOf = (date: Date | null) => (date ? format(date, 'HH:mm') : '')

/** The form's starting values: the task as stored, in local time. */
export function toFormValues(task: Task): FormValues {
  return {
    title: task.title,
    description: task.description ?? '',
    status: task.status,
    priority: task.priority,
    category: task.category ?? '',
    type: task.type ?? '',
    deadlineDate: dateOf(task.deadline),
    deadlineTime: timeOf(task.deadline),
    remindDate: dateOf(task.remindAt),
    remindTime: timeOf(task.remindAt),
    pinned: task.pinned,
    completed: task.completedAt !== null,
    archived: task.archivedAt !== null,
  }
}

/** 24-hour time as typed: "07:00", "7:00" or "0700" all become "07:00". Anything else is null. */
export function normalizeTime(time: string): string | null {
  const match = /^([01]?\d|2[0-3]):?([0-5]\d)$/.exec(time.trim())
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null
}

/** A date and a time from the form, read as the viewer's local time. Null when empty or invalid. */
export function parseLocal(date: string, time: string): Date | null {
  const hhmm = normalizeTime(time)
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!ymd || !hhmm) return null
  const [hours, minutes] = hhmm.split(':').map(Number)
  return new Date(
    Number(ymd[1]),
    Number(ymd[2]) - 1,
    Number(ymd[3]),
    hours,
    minutes,
  )
}

// Wall-clock arithmetic: "the same amount" means the same days and hours on the clock, so a
// reminder at 07:00 stays at 07:00 when the deadline moves across a daylight-saving change.
const wall = (d: Date) =>
  Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
  )
const fromWall = (ms: number) => {
  const u = new Date(ms)
  return new Date(
    u.getUTCFullYear(),
    u.getUTCMonth(),
    u.getUTCDate(),
    u.getUTCHours(),
    u.getUTCMinutes(),
  )
}

/**
 * Where the reminder goes when the deadline changes, so the edit is never rejected.
 * Only moves it when the new deadline is before the reminder:
 * - the deadline moved: the reminder moves by the same amount;
 * - the task had no deadline before (nothing to measure from): the day before the new
 *   deadline, at the reminder's own time, so there is at least a day to act.
 */
export function shiftReminder(
  oldDeadline: Date | null,
  newDeadline: Date | null,
  remindAt: Date | null,
): { remindAt: Date | null; moved: boolean } {
  if (!newDeadline || !remindAt || remindAt <= newDeadline) {
    return { remindAt, moved: false }
  }
  const moved = oldDeadline
    ? fromWall(wall(remindAt) + wall(newDeadline) - wall(oldDeadline))
    : set(subDays(newDeadline, 1), {
        hours: remindAt.getHours(),
        minutes: remindAt.getMinutes(),
        seconds: 0,
        milliseconds: 0,
      })
  // Never after the deadline, even on the odd daylight-saving hour.
  return { remindAt: moved > newDeadline ? newDeadline : moved, moved: true }
}

export interface FormErrors {
  title?: string
  description?: string
  deadline?: string
  remindAt?: string
}

export interface SavePlan {
  /** Only the changed fields. Empty: nothing to save. */
  patch: TaskPatch
  errors: FormErrors
  /** Set when the save will move the reminder (the deadline moved before it). */
  reminderMovesTo: Date | null
  /** True when the save will end a running snooze (the dates changed). */
  snoozeEnds: boolean
}

const sameTime = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null)

const BAD_TIME = 'Enter a 24-hour time, for example 20:00.'

/**
 * Works out what a save would send, from the stored task and the form.
 *
 * - An archived task that is still ticked Archived is locked: nothing is sent, whatever the
 *   other fields hold (the form puts them back anyway).
 * - Completed and Archived become timestamps (`now`) or null.
 * - Changing the deadline or reminder clears any stored snooze, running or expired: the alerts
 *   follow the new dates, and the database checks a snooze against them.
 * - A reminder typed by hand is never moved; one after the deadline is an error.
 */
export function planSave(task: Task, values: FormValues, now: Date): SavePlan {
  const plan: SavePlan = {
    patch: {},
    errors: {},
    reminderMovesTo: null,
    snoozeEnds: false,
  }
  if (task.archivedAt !== null && values.archived) return plan

  const initial = toFormValues(task)
  const { patch, errors } = plan

  const title = values.title.trim()
  if (title === '') errors.title = 'A title is needed.'
  else if (title.length > TITLE_MAX)
    errors.title = `At most ${TITLE_MAX} characters.`
  else if (title !== task.title) patch.title = title

  if (values.description.length > DESCRIPTION_MAX) {
    errors.description = `At most ${DESCRIPTION_MAX} characters.`
  } else if (values.description !== initial.description) {
    patch.description =
      values.description.trim() === '' ? null : values.description
  }

  if (values.status !== task.status) patch.status = values.status
  if (values.priority !== task.priority) patch.priority = values.priority
  const category = values.category || null
  if (category !== task.category) patch.category = category
  const type = values.type || null
  if (type !== task.type) patch.type = type

  // Dates: only a field the user touched counts as changed.
  const deadlineEdited =
    values.deadlineDate !== initial.deadlineDate ||
    values.deadlineTime !== initial.deadlineTime
  const reminderEdited =
    values.remindDate !== initial.remindDate ||
    values.remindTime !== initial.remindTime
  if (values.deadlineDate && !normalizeTime(values.deadlineTime))
    errors.deadline = BAD_TIME
  if (values.remindDate && !normalizeTime(values.remindTime))
    errors.remindAt = BAD_TIME

  const deadline = deadlineEdited
    ? parseLocal(values.deadlineDate, values.deadlineTime)
    : task.deadline
  let remindAt = reminderEdited
    ? parseLocal(values.remindDate, values.remindTime)
    : task.remindAt

  if (deadlineEdited && !reminderEdited && !errors.deadline) {
    const shift = shiftReminder(task.deadline, deadline, task.remindAt)
    if (shift.moved) {
      remindAt = shift.remindAt
      plan.reminderMovesTo = shift.remindAt
    }
  }
  if (
    !errors.deadline &&
    !errors.remindAt &&
    deadline &&
    remindAt &&
    remindAt > deadline
  ) {
    errors.remindAt = "The reminder can't be after the deadline."
  }
  if (
    deadlineEdited &&
    !errors.deadline &&
    !sameTime(deadline, task.deadline)
  ) {
    patch.deadline = deadline
  }
  if (
    (reminderEdited || plan.reminderMovesTo) &&
    !errors.remindAt &&
    !sameTime(remindAt, task.remindAt)
  ) {
    patch.remindAt = remindAt
  }

  if (values.pinned !== task.pinned) patch.pinned = values.pinned
  if (values.completed !== (task.completedAt !== null)) {
    patch.completedAt = values.completed ? now : null
  }
  if (values.archived !== (task.archivedAt !== null)) {
    patch.archivedAt = values.archived ? now : null
    // The server unpins on archive too; sending it keeps the patch honest about what changes.
    if (values.archived && task.pinned) patch.pinned = false
  }

  if (
    task.snoozedUntil !== null &&
    ('deadline' in patch || 'remindAt' in patch)
  ) {
    patch.snoozedUntil = null
    plan.snoozeEnds = isSnoozed(task, now)
  }
  return plan
}

export const hasErrors = (errors: FormErrors) => Object.keys(errors).length > 0

/** Plain sentences for the database rules in schema.sql (the API returns the rule's name). */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  remind_not_after_deadline: "The reminder can't be after the deadline.",
  snooze_needs_alert_source: 'A snoozed task needs a deadline or a reminder.',
  snooze_after_reminder: 'The snooze has to end after the reminder.',
  no_snooze_when_done: "A completed or archived task can't be snoozed.",
  no_pin_when_archived: "An archived task can't be pinned.",
  archived_on_or_after_created:
    "A task can't be archived before it was created.",
  snooze_on_or_after_created: "A snooze can't end before the task was created.",
}

/** The message shown when a save fails. Nothing was saved, so it says so. */
export function saveErrorMessage(detail: string | undefined): string {
  const known = detail ? CONSTRAINT_MESSAGES[detail] : undefined
  if (known) return `${known} Nothing was saved.`
  return `Couldn't save${detail ? ` (${detail})` : ''}. Nothing was saved.`
}
