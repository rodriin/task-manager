import type { Task } from '../types'
import {
  alertReason,
  alertState,
  buildScan,
  isDueSoon,
  isOverdue,
  isNew,
  isReminderActive,
  matchesDeadline,
  matchesSearch,
  matchesStatus,
  taskSignal,
  taskStatus,
  todayState,
  doneToday,
} from './taskHelpers'

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
    status: 'Not started',
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

describe('alertState', () => {
  it('is overdue before reminder, and nothing once completed or archived', () => {
    const late = task({ deadline: at(17, 9), remindAt: at(17, 8) })
    expect(alertState(late, NOW)).toBe('overdue')
    expect(alertState(task({ remindAt: at(17, 9) }), NOW)).toBe('reminder')
    expect(alertState(task({ deadline: at(18, 11) }), NOW)).toBeNull()
    expect(alertState({ ...late, completedAt: at(17, 9) }, NOW)).toBeNull()
    expect(alertState({ ...late, archivedAt: at(17, 9) }, NOW)).toBeNull()
  })

  it('puts the reminder before due soon', () => {
    const t = task({ deadline: at(17, 20), remindAt: at(17, 9) })
    expect(alertState(t, NOW)).toBe('reminder')
  })

  it('is quiet while snoozed, and back when the snooze ends', () => {
    const late = task({ deadline: at(16, 20), snoozedUntil: at(17, 13) })
    expect(alertState(late, NOW)).toBeNull()
    expect(alertReason(late, NOW)).toBe('overdue') // what it would show
    expect(alertState(late, at(17, 13))).toBe('overdue') // snooze over
  })
})

describe('isDueSoon', () => {
  it('is the next 24 hours, for a task with no reminder', () => {
    expect(isDueSoon(task({ deadline: at(18, 9) }), NOW)).toBe(true) // 23 h
    expect(isDueSoon(task({ deadline: at(18, 10) }), NOW)).toBe(true) // 24 h
    expect(isDueSoon(task({ deadline: at(18, 11) }), NOW)).toBe(false) // 25 h
    expect(isDueSoon(task({ deadline: at(17, 9) }), NOW)).toBe(false) // overdue
    expect(alertState(task({ deadline: at(18, 9) }), NOW)).toBe('soon')
  })

  it('never applies when he set a reminder: his reminder wins', () => {
    const t = task({ deadline: at(17, 20), remindAt: at(17, 18) })
    expect(isDueSoon(t, NOW)).toBe(false)
    expect(alertState(t, NOW)).toBeNull() // reminder still ahead: quiet
    expect(alertState(t, at(17, 18))).toBe('reminder')
  })

  it('is never on a completed or archived task', () => {
    const t = task({ deadline: at(17, 20) })
    expect(isDueSoon({ ...t, completedAt: at(17, 9) }, NOW)).toBe(false)
    expect(isDueSoon({ ...t, archivedAt: at(17, 9) }, NOW)).toBe(false)
  })
})

describe('taskSignal', () => {
  it('picks the icon: red bell, amber bell, snoozed, done or none', () => {
    expect(taskSignal(task({ deadline: at(16, 20) }), NOW)).toBe('overdue')
    expect(taskSignal(task({ deadline: at(17, 20) }), NOW)).toBe('warning')
    expect(taskSignal(task({ remindAt: at(17, 9) }), NOW)).toBe('warning')
    expect(
      taskSignal(task({ remindAt: at(17, 9), snoozedUntil: at(17, 12) }), NOW),
    ).toBe('snoozed')
    expect(taskSignal(task({ completedAt: at(16, 9) }), NOW)).toBe('done')
    expect(
      taskSignal(task({ completedAt: at(16, 9), archivedAt: at(16, 10) }), NOW),
    ).toBeNull()
    expect(taskSignal(task({ deadline: at(20, 20) }), NOW)).toBeNull()
  })
})

describe('taskStatus and the Status filter', () => {
  it('puts Archived before Completed, then the stored status', () => {
    expect(taskStatus(task())).toBe('Not started')
    expect(taskStatus(task({ status: 'In progress' }))).toBe('In progress')
    expect(taskStatus(task({ completedAt: at(16, 9) }))).toBe('Completed')
    expect(
      taskStatus(task({ completedAt: at(16, 9), archivedAt: at(16, 10) })),
    ).toBe('Archived')
  })

  it('Open matches Not started and In progress, overdue or not', () => {
    expect(matchesStatus(task(), 'Open', NOW)).toBe(true)
    expect(
      matchesStatus(
        task({ status: 'In progress', deadline: at(16, 9) }),
        'Open',
        NOW,
      ),
    ).toBe(true)
    expect(matchesStatus(task({ completedAt: at(16, 9) }), 'Open', NOW)).toBe(
      false,
    )
    expect(matchesStatus(task({ archivedAt: at(16, 9) }), 'Open', NOW)).toBe(
      false,
    )
  })

  it('In progress matches only open tasks stored as In progress', () => {
    const started = task({ status: 'In progress' })
    expect(matchesStatus(started, 'In progress', NOW)).toBe(true)
    expect(matchesStatus(started, 'Not started', NOW)).toBe(false)
    expect(
      matchesStatus({ ...started, completedAt: at(16, 9) }, 'In progress', NOW),
    ).toBe(false)
  })
})

describe('Deadline filter', () => {
  // NOW is Tuesday 17 Nov; the week ends at the end of Sunday 22 Nov.
  const due = (day: number, hour = 12) => task({ deadline: at(day, hour) })

  it('splits Today and Tomorrow at local midnight', () => {
    expect(matchesDeadline(due(17, 23), 'Today', NOW)).toBe(true)
    expect(matchesDeadline(due(18, 0), 'Today', NOW)).toBe(false)
    expect(matchesDeadline(due(18, 0), 'Tomorrow', NOW)).toBe(true)
    expect(matchesDeadline(due(19, 0), 'Tomorrow', NOW)).toBe(false)
  })

  it('counts a task due earlier today as both Today and Overdue', () => {
    expect(matchesDeadline(due(17, 9), 'Today', NOW)).toBe(true)
    expect(matchesDeadline(due(17, 9), 'Overdue', NOW)).toBe(true)
    expect(matchesDeadline(due(16, 9), 'Today', NOW)).toBe(false)
  })

  it('This week is Monday to Sunday, past days included', () => {
    // Monday 16 Nov to Sunday 22 Nov.
    expect(matchesDeadline(due(16, 0), 'This week', NOW)).toBe(true) // Monday, already past
    expect(matchesDeadline(due(22, 23), 'This week', NOW)).toBe(true)
    expect(matchesDeadline(due(15, 23), 'This week', NOW)).toBe(false) // last Sunday
    expect(matchesDeadline(due(23, 0), 'This week', NOW)).toBe(false) // next Monday
  })

  it('This month is the whole of November; This quarter October to December', () => {
    const on = (month: number, day: number) =>
      task({ deadline: new Date(2026, month, day, 12) })
    expect(matchesDeadline(on(10, 1), 'This month', NOW)).toBe(true)
    expect(matchesDeadline(on(10, 30), 'This month', NOW)).toBe(true)
    expect(matchesDeadline(on(11, 1), 'This month', NOW)).toBe(false)
    expect(matchesDeadline(on(9, 1), 'This quarter', NOW)).toBe(true)
    expect(matchesDeadline(on(11, 31), 'This quarter', NOW)).toBe(true)
    expect(matchesDeadline(on(8, 30), 'This quarter', NOW)).toBe(false)
  })

  it('Later is after the end of this quarter', () => {
    expect(matchesDeadline(due(30), 'Later', NOW)).toBe(false)
    expect(
      matchesDeadline(
        task({ deadline: new Date(2026, 11, 31, 23) }),
        'Later',
        NOW,
      ),
    ).toBe(false)
    expect(
      matchesDeadline(task({ deadline: new Date(2027, 0, 1) }), 'Later', NOW),
    ).toBe(true)
  })

  it('No deadline matches only tasks without one; completed is never Overdue', () => {
    expect(matchesDeadline(task(), 'No deadline', NOW)).toBe(true)
    expect(matchesDeadline(due(17), 'No deadline', NOW)).toBe(false)
    expect(matchesDeadline(task(), 'Today', NOW)).toBe(false)
    const done = task({ deadline: at(16, 9), completedAt: at(16, 8) })
    expect(matchesDeadline(done, 'Overdue', NOW)).toBe(false)
  })
})

describe('matchesSearch', () => {
  it('looks in title, description, category, type and priority, ignoring case', () => {
    const t = task({
      title: 'Return the tow bar',
      description: 'Borrowed from VFA-41',
      category: 'Supply',
      type: 'Sign-off',
      priority: 'High',
    })
    for (const q of ['TOW', 'vfa', 'supply', 'sign-off', 'high', '  '])
      expect(matchesSearch(t, q)).toBe(true)
    expect(matchesSearch(t, 'brief')).toBe(false)
  })
})

describe('New', () => {
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000)

  it('is an open task created in the past 24 hours, overdue or not', () => {
    expect(isNew(task({ createdAt: hoursAgo(1) }), NOW)).toBe(true)
    expect(isNew(task({ createdAt: hoursAgo(23.9) }), NOW)).toBe(true)
    expect(isNew(task({ createdAt: hoursAgo(24) }), NOW)).toBe(false)
    expect(isNew(task({ createdAt: hoursAgo(25) }), NOW)).toBe(false)
    // Created after the clock's last tick (or a server clock slightly ahead): still new.
    expect(isNew(task({ createdAt: hoursAgo(-0.01) }), NOW)).toBe(true)
    expect(
      isNew(task({ createdAt: hoursAgo(1), deadline: at(16, 20) }), NOW),
    ).toBe(true)
    expect(
      isNew(task({ createdAt: hoursAgo(1), completedAt: hoursAgo(0.5) }), NOW),
    ).toBe(false)
    expect(
      isNew(task({ createdAt: hoursAgo(1), archivedAt: hoursAgo(0.5) }), NOW),
    ).toBe(false)
  })

  it('has its own scan section after Tomorrow, first match wins', () => {
    expect(sectionOf(task({ createdAt: hoursAgo(1) }))).toBe('newTasks')
    expect(sectionOf(task({ createdAt: hoursAgo(25) }))).toBe(null)
    expect(
      sectionOf(task({ createdAt: hoursAgo(1), deadline: at(17, 20) })),
    ).toBe('today')
    expect(
      sectionOf(task({ createdAt: hoursAgo(1), deadline: at(18, 20) })),
    ).toBe('tomorrow')
    expect(sectionOf(task({ createdAt: hoursAgo(1), pinned: true }))).toBe(
      'pinned',
    )
    // A reminder that has gone off: New comes before Reminders.
    expect(
      sectionOf(
        task({
          createdAt: hoursAgo(1),
          remindAt: at(17, 9),
          deadline: at(25, 20),
        }),
      ),
    ).toBe('newTasks')
  })

  it('lists the newest first', () => {
    const older = task({ createdAt: hoursAgo(5) })
    const newer = task({ createdAt: hoursAgo(1) })
    expect(ids(buildScan([older, newer], NOW).newTasks)).toEqual([
      newer.id,
      older.id,
    ])
  })

  it('the New filter matches every new task, overdue ones included', () => {
    const overdueNew = task({ createdAt: hoursAgo(1), deadline: at(16, 20) })
    expect(matchesStatus(overdueNew, 'New', NOW)).toBe(true)
    expect(matchesStatus(task({ createdAt: hoursAgo(30) }), 'New', NOW)).toBe(
      false,
    )
  })
})

describe('Alerting and Snoozed filters', () => {
  const overdue = task({ deadline: at(16, 20) })
  const soon = task({ deadline: at(17, 20) })
  const snoozed = task({ deadline: at(16, 20), snoozedUntil: at(17, 13) })
  const expired = task({ remindAt: at(17, 8), snoozedUntil: at(17, 9) })
  const later = task({ deadline: at(25, 20) })
  const done = task({ deadline: at(16, 20), completedAt: at(16, 9) })
  const all = [overdue, soon, snoozed, expired, later, done]
  const matching = (filter: 'Alerting' | 'Snoozed') =>
    all.filter((t) => matchesStatus(t, filter, NOW))

  it('Alerting lists the bells showing now, an expired snooze included', () => {
    expect(matching('Alerting')).toEqual([overdue, soon, expired])
  })

  it('Snoozed lists the running snoozes', () => {
    expect(matching('Snoozed')).toEqual([snoozed])
  })
})

describe('todayState', () => {
  it('is caught up when nothing open is due today or overdue', () => {
    expect(todayState([], NOW)).toBe('caughtUp')
    expect(
      todayState(
        [
          task({ deadline: at(18, 20) }), // tomorrow
          task({ remindAt: at(17, 7) }), // a reached reminder, no deadline
          task({ deadline: at(17, 20), completedAt: at(17, 9) }),
          task({ deadline: at(16, 20), archivedAt: at(16, 9) }),
        ],
        NOW,
      ),
    ).toBe('caughtUp')
  })

  it('a snoozed overdue task still counts', () => {
    expect(
      todayState(
        [task({ deadline: at(16, 20), snoozedUntil: at(18, 7) })],
        NOW,
      ),
    ).toBe('due')
  })

  it('pinnedOnly when every task due today is pinned', () => {
    expect(
      todayState([task({ deadline: at(16, 20), pinned: true })], NOW),
    ).toBe('pinnedOnly')
    expect(
      todayState(
        [
          task({ deadline: at(16, 20), pinned: true }),
          task({ deadline: at(17, 20) }),
        ],
        NOW,
      ),
    ).toBe('due')
  })

  it("just after midnight, yesterday's open deadline is overdue: not caught up", () => {
    expect(todayState([task({ deadline: at(16, 23) })], at(17, 0, 5))).toBe(
      'due',
    )
  })
})

describe('doneToday', () => {
  it("counts tasks completed on today's date, archived included", () => {
    expect(
      doneToday(
        [
          task({ completedAt: at(17, 8) }),
          task({ completedAt: at(17, 0, 1), archivedAt: at(17, 9) }),
          task({ completedAt: at(16, 23) }),
          task(),
        ],
        NOW,
      ),
    ).toBe(2)
  })
})
