import type { Task } from '../types'
import { buildScan, isOverdue, isReminderActive } from './taskHelpers'

// Fixed "now": Tuesday 17 Nov 2026, 10:00 in the machine's local time.
// Dates are built with local-time constructors, so the tests pass in any time zone.
const NOW = new Date(2026, 10, 17, 10, 0)
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute)

let nextId = 1
function task(fields: Partial<Task> = {}): Task {
  return {
    id: nextId++,
    title: 'Task',
    description: null,
    deadline: null,
    status: 'Not Started',
    category: null,
    type: null,
    priority: 'Low',
    remindAt: null,
    ownerId: 1,
    pinned: false,
    snoozedUntil: null,
    createdAt: at(1, 9),
    completedAt: null,
    archivedAt: null,
    ...fields,
  }
}

const ids = (tasks: Task[]) => tasks.map((t) => t.id)

/** Which section a single task lands in, or null if none. */
function sectionOf(t: Task, now = NOW) {
  const scan = buildScan([t], now)
  const hits = (Object.keys(scan) as (keyof typeof scan)[]).filter(
    (k) => scan[k].length > 0,
  )
  expect(hits.length).toBeLessThanOrEqual(1) // never in two sections
  return hits[0] ?? null
}

describe('isOverdue', () => {
  it('flips the minute the deadline passes', () => {
    const t = task({ deadline: at(17, 10) })
    expect(isOverdue(t, at(17, 9, 59))).toBe(false)
    expect(isOverdue(t, at(17, 10))).toBe(false)
    expect(isOverdue(t, at(17, 10, 1))).toBe(true)
  })

  it('is never overdue once completed, or with no deadline', () => {
    expect(
      isOverdue(task({ deadline: at(16, 20), completedAt: at(16, 16) }), NOW),
    ).toBe(false)
    expect(isOverdue(task({ remindAt: at(16, 7) }), NOW)).toBe(false)
  })
})

describe('isReminderActive', () => {
  it('turns on when the reminder time is reached', () => {
    const t = task({ remindAt: at(17, 10) })
    expect(isReminderActive(t, at(17, 9, 59))).toBe(false)
    expect(isReminderActive(t, at(17, 10))).toBe(true)
  })
})

describe('buildScan sections', () => {
  it('puts every pinned task in Pinned, whatever its dates', () => {
    expect(sectionOf(task({ pinned: true }))).toBe('pinned')
    expect(sectionOf(task({ pinned: true, deadline: at(30, 20) }))).toBe(
      'pinned',
    )
    expect(sectionOf(task({ pinned: true, deadline: at(17, 20) }))).toBe(
      'pinned',
    )
    expect(sectionOf(task({ pinned: true, deadline: at(14, 20) }))).toBe(
      'pinned',
    )
  })

  it('splits Today and Tomorrow on the local day boundary', () => {
    expect(sectionOf(task({ deadline: at(17, 23, 59) }))).toBe('today')
    expect(sectionOf(task({ deadline: at(18, 0, 1) }))).toBe('tomorrow')
    expect(sectionOf(task({ deadline: at(19, 9) }))).toBe(null)
  })

  it('includes overdue tasks from earlier days in Today', () => {
    expect(sectionOf(task({ deadline: at(14, 20) }))).toBe('today')
  })

  it('keeps a task due today or tomorrow in its day, even with a reminder reached', () => {
    expect(sectionOf(task({ deadline: at(17, 20), remindAt: at(17, 7) }))).toBe(
      'today',
    )
    expect(sectionOf(task({ deadline: at(18, 20), remindAt: at(17, 7) }))).toBe(
      'tomorrow',
    )
  })

  it('puts a reached reminder with a later or no deadline in Reminders', () => {
    expect(sectionOf(task({ deadline: at(24, 20), remindAt: at(16, 7) }))).toBe(
      'reminders',
    )
    expect(sectionOf(task({ remindAt: at(15, 7) }))).toBe('reminders')
  })

  it('leaves out reminders that have not been reached yet', () => {
    expect(sectionOf(task({ remindAt: at(17, 15) }))).toBe(null)
    expect(sectionOf(task({ deadline: at(24, 20), remindAt: at(18, 7) }))).toBe(
      null,
    )
  })

  it('never shows completed or archived tasks', () => {
    expect(
      sectionOf(task({ deadline: at(17, 20), completedAt: at(17, 9) })),
    ).toBe(null)
    expect(
      sectionOf(task({ deadline: at(14, 20), archivedAt: at(15, 9) })),
    ).toBe(null)
    expect(sectionOf(task({ pinned: true, completedAt: at(17, 9) }))).toBe(null)
    expect(
      sectionOf(task({ remindAt: at(15, 7), completedAt: at(16, 9) })),
    ).toBe(null)
  })

  it('keeps snoozed tasks visible', () => {
    expect(
      sectionOf(task({ deadline: at(17, 20), snoozedUntil: at(17, 13) })),
    ).toBe('today')
    expect(
      sectionOf(task({ remindAt: at(16, 7), snoozedUntil: at(18, 7) })),
    ).toBe('reminders')
  })
})

describe('buildScan order', () => {
  it('orders Today: overdue first, then by deadline', () => {
    const later = task({ deadline: at(17, 20) })
    const sooner = task({ deadline: at(17, 12) })
    const overdueYesterday = task({ deadline: at(16, 20) })
    const overdueThisMorning = task({ deadline: at(17, 8) })
    const { today } = buildScan(
      [later, sooner, overdueThisMorning, overdueYesterday],
      NOW,
    )
    expect(ids(today)).toEqual([
      overdueYesterday.id,
      overdueThisMorning.id,
      sooner.id,
      later.id,
    ])
  })

  it('orders Pinned: overdue first, then by deadline, no deadline last', () => {
    const noDeadline = task({ pinned: true })
    const nextWeek = task({ pinned: true, deadline: at(24, 20) })
    const overdue = task({ pinned: true, deadline: at(15, 20) })
    const { pinned } = buildScan([noDeadline, nextWeek, overdue], NOW)
    expect(ids(pinned)).toEqual([overdue.id, nextWeek.id, noDeadline.id])
  })

  it('orders Reminders: oldest reminder first', () => {
    const recent = task({ remindAt: at(17, 7) })
    const old = task({ remindAt: at(12, 7) })
    const { reminders } = buildScan([recent, old], NOW)
    expect(ids(reminders)).toEqual([old.id, recent.id])
  })
})
