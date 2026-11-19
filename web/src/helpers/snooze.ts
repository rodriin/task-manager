// Snooze options: what the bell's menu offers, as plain functions so the tests can pass a fixed "now".
// The option is only how he picks; what gets saved is the time it ends (`snoozedUntil`).
import { addDays, addMinutes, set } from 'date-fns'
import type { Task } from '../types'

/** "Morning" is 07:00 local, the same as the default reminder time. */
export const MORNING_HOUR = 7

/** Fixed lengths, counted from now. Guesses to check with Maverick. */
const LENGTHS: [label: string, minutes: number][] = [
  ['30 minutes', 30],
  ['1 hour', 60],
  ['3 hours', 3 * 60],
  ['6 hours', 6 * 60],
  ['8 hours', 8 * 60],
]

export interface SnoozeOption {
  label: string
  until: Date
  /** True when the option was cut short at the deadline. */
  capped: boolean
}

/**
 * The next 07:00. A clock time, not a length: 21 hours away at 10:00, 8 hours at 23:00.
 * Before 07:00 it's this morning, because at 01:00 that's what "the morning" means.
 * date-fns `set` works in local time, so a daylight-saving change is handled.
 */
export function nextMorning(now: Date): { label: string; until: Date } {
  const at7 = (day: Date) =>
    set(day, { hours: MORNING_HOUR, minutes: 0, seconds: 0, milliseconds: 0 })
  const today = at7(now)
  return today > now
    ? { label: 'This morning', until: today }
    : { label: 'Tomorrow morning', until: at7(addDays(now, 1)) }
}

/**
 * The snooze options for a task, each with the time it ends.
 * A snooze never runs past a deadline that is still ahead: it ends at the deadline, so the task
 * turns red the minute it goes overdue. An overdue task's snooze isn't capped.
 * (Every alerting task with a reminder has already reached it, so each option ends after the
 * reminder, as the database requires.)
 */
export function snoozeOptions(task: Task, now: Date): SnoozeOption[] {
  const options = [
    ...LENGTHS.map(([label, minutes]) => ({
      label,
      until: addMinutes(now, minutes),
    })),
    nextMorning(now),
  ]
  const deadline =
    task.deadline !== null && task.deadline > now ? task.deadline : null
  return options.map((option) =>
    deadline !== null && option.until > deadline
      ? { ...option, until: deadline, capped: true }
      : { ...option, capped: false },
  )
}
