import type { Task } from '../types'
import { cardLine } from './printCard'

// Fixed "now": Tuesday 17 Nov 2026, 10:00 local time.
const NOW = new Date(2026, 10, 17, 10, 0)
const at = (day: number, hour: number) => new Date(2026, 10, day, hour)

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

describe('cardLine', () => {
  it('a deadline today is the time only; another day adds the day', () => {
    expect(cardLine(task({ deadline: at(17, 20) }), NOW).time).toBe('20:00')
    expect(cardLine(task({ deadline: at(19, 20) }), NOW).time).toBe('Thu 20:00')
  })

  it('overdue prints as overdue, snoozed or not', () => {
    expect(cardLine(task({ deadline: at(16, 20) }), NOW).overdue).toBe(true)
    expect(
      cardLine(task({ deadline: at(16, 20), snoozedUntil: at(18, 7) }), NOW)
        .overdue,
    ).toBe(true)
    expect(cardLine(task({ deadline: at(17, 20) }), NOW).overdue).toBe(false)
  })

  it('only a reminder: "Rem" and its time; neither: empty', () => {
    expect(cardLine(task({ remindAt: at(17, 7) }), NOW).time).toBe('Rem 07:00')
    expect(cardLine(task(), NOW).time).toBe('')
  })

  it('carries High and pinned', () => {
    const line = cardLine(task({ priority: 'High', pinned: true }), NOW)
    expect(line.high).toBe(true)
    expect(line.pinned).toBe(true)
  })
})
