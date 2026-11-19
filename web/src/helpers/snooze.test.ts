import type { Task } from '../types'
import { nextMorning, snoozeOptions } from './snooze'

// Fixed "now": Tuesday 17 Nov 2026, 10:00 local time.
const NOW = new Date(2026, 10, 17, 10, 0)
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute)

function task(fields: Partial<Task> = {}): Task {
  return {
    id: 1,
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

const byLabel = (t: Task, now = NOW) =>
  Object.fromEntries(snoozeOptions(t, now).map((o) => [o.label, o]))

describe('snoozeOptions', () => {
  it('offers six options, counted from now', () => {
    const options = snoozeOptions(task({ remindAt: at(17, 9) }), NOW)
    expect(options.map((o) => o.label)).toEqual([
      '30 minutes',
      '1 hour',
      '3 hours',
      '6 hours',
      '8 hours',
      'Tomorrow morning',
    ])
    expect(options[0].until).toEqual(at(17, 10, 30))
    expect(options[4].until).toEqual(at(17, 18))
    expect(options[5].until).toEqual(at(18, 7))
    expect(options.every((o) => !o.capped)).toBe(true)
  })

  it('ends at the deadline when the deadline comes first', () => {
    const options = byLabel(task({ deadline: at(17, 15) }))
    expect(options['3 hours']).toEqual({
      label: '3 hours',
      until: at(17, 13),
      capped: false,
    })
    for (const label of ['6 hours', '8 hours', 'Tomorrow morning']) {
      expect(options[label].until).toEqual(at(17, 15))
      expect(options[label].capped).toBe(true)
    }
  })

  it("doesn't cap an overdue task: snoozing it is his choice, and it ends", () => {
    const options = byLabel(task({ deadline: at(16, 20) }))
    expect(options['8 hours'].until).toEqual(at(17, 18))
    expect(options['8 hours'].capped).toBe(false)
  })

  it('ends every option after a reached reminder (the database checks it)', () => {
    const t = task({ deadline: at(17, 20), remindAt: at(17, 9, 59) })
    for (const option of snoozeOptions(t, NOW))
      expect(option.until > t.remindAt!).toBe(true)
  })
})

describe('nextMorning', () => {
  it('is 07:00 tomorrow during the day and late at night', () => {
    expect(nextMorning(NOW)).toEqual({
      label: 'Tomorrow morning',
      until: at(18, 7),
    })
    expect(nextMorning(at(17, 23, 30)).until).toEqual(at(18, 7))
    expect(nextMorning(at(17, 7)).until).toEqual(at(18, 7))
  })

  it('is this morning before 07:00', () => {
    expect(nextMorning(at(17, 1))).toEqual({
      label: 'This morning',
      until: at(17, 7),
    })
  })
})
