import type { Task } from '../types'
import {
  normalizeTime,
  parseLocal,
  planSave,
  saveErrorMessage,
  shiftReminder,
  toFormValues,
  type FormValues,
} from './taskForm'

// Fixed "now": Tuesday 17 Nov 2026, 10:00 local time.
const NOW = new Date(2026, 10, 17, 10, 0)
const at = (day: number, hour = 12, minute = 0) =>
  new Date(2026, 10, day, hour, minute)

function task(fields: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Tow bar inspection',
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
    createdAt: at(1),
    completedAt: null,
    archivedAt: null,
    ...fields,
  }
}

/** The form for `t`, with some inputs changed. */
const edit = (t: Task, changes: Partial<FormValues> = {}) => ({
  ...toFormValues(t),
  ...changes,
})

describe('times and dates', () => {
  it('accepts 24-hour times in a few typed forms', () => {
    expect(normalizeTime('07:00')).toBe('07:00')
    expect(normalizeTime('7:00')).toBe('07:00')
    expect(normalizeTime('0700')).toBe('07:00')
    expect(normalizeTime('23:59')).toBe('23:59')
  })

  it('rejects times that are not 24-hour HH:mm', () => {
    for (const bad of ['24:00', '7pm', '07:60', '', '12:5']) {
      expect(normalizeTime(bad)).toBeNull()
    }
  })

  it('reads the date and time as local time', () => {
    expect(parseLocal('2026-11-18', '20:00')).toEqual(at(18, 20))
    expect(parseLocal('', '20:00')).toBeNull()
    expect(parseLocal('2026-11-18', 'noon')).toBeNull()
  })

  it('shows the stored task in local time', () => {
    const values = toFormValues(
      task({ deadline: at(18, 20), remindAt: at(18, 7) }),
    )
    expect(values).toMatchObject({
      deadlineDate: '2026-11-18',
      deadlineTime: '20:00',
      remindDate: '2026-11-18',
      remindTime: '07:00',
      category: '',
    })
  })
})

describe('shiftReminder', () => {
  it('moves the reminder by the same amount as the deadline, across midnight', () => {
    // Deadline 19 Nov 20:00 -> 19 Nov 01:00 (19 hours earlier); reminder 19 Nov 07:00 -> 18 Nov 12:00.
    const { remindAt, moved } = shiftReminder(at(19, 20), at(19, 1), at(19, 7))
    expect(moved).toBe(true)
    expect(remindAt).toEqual(at(18, 12))
  })

  it('keeps the clock time across a daylight-saving change', () => {
    // US clocks go forward on 8 March 2026. Moving a deadline back over it by two days keeps 07:00.
    const old = new Date(2026, 2, 9, 20)
    const next = new Date(2026, 2, 7, 20)
    const { remindAt } = shiftReminder(old, next, new Date(2026, 2, 8, 7))
    expect(remindAt).toEqual(new Date(2026, 2, 6, 7))
    expect(remindAt!.getHours()).toBe(7)
  })

  it('leaves the reminder alone when it is still before the deadline', () => {
    expect(shiftReminder(at(20, 20), at(19, 20), at(18, 7))).toEqual({
      remindAt: at(18, 7),
      moved: false,
    })
  })

  it('with no old deadline, moves the reminder to the day before at its own time', () => {
    const { remindAt, moved } = shiftReminder(null, at(19, 20), at(20, 7, 30))
    expect(moved).toBe(true)
    expect(remindAt).toEqual(at(18, 7, 30))
  })

  it('with no old deadline, keeps the clock time across a daylight-saving change', () => {
    // Deadline Sunday 8 March (the change day); the reminder lands on Saturday 7 March, 09:15.
    const { remindAt } = shiftReminder(
      null,
      new Date(2026, 2, 8, 20),
      new Date(2026, 2, 12, 9, 15),
    )
    expect(remindAt).toEqual(new Date(2026, 2, 7, 9, 15))
  })
})

describe('planSave', () => {
  it('sends nothing for an untouched form', () => {
    const t = task({
      deadline: at(18, 20),
      remindAt: at(18, 7),
      category: 'Supply',
    })
    expect(planSave(t, edit(t), NOW).patch).toEqual({})
  })

  it('sends only the changed fields, trimmed', () => {
    const t = task()
    expect(
      planSave(t, edit(t, { title: '  Tow bar check ', priority: 'High' }), NOW)
        .patch,
    ).toEqual({
      title: 'Tow bar check',
      priority: 'High',
    })
  })

  it('sends null when a field is cleared', () => {
    const t = task({
      description: 'Ask the shop',
      category: 'Supply',
      deadline: at(18, 20),
    })
    const plan = planSave(
      t,
      edit(t, {
        description: '',
        category: '',
        deadlineDate: '',
        deadlineTime: '',
      }),
      NOW,
    )
    expect(plan.patch).toEqual({
      description: null,
      category: null,
      deadline: null,
    })
  })

  it('needs a title of at most 120 characters', () => {
    const t = task()
    expect(
      planSave(t, edit(t, { title: '   ' }), NOW).errors.title,
    ).toBeDefined()
    expect(
      planSave(t, edit(t, { title: 'x'.repeat(121) }), NOW).errors.title,
    ).toBeDefined()
  })

  it('flags a time that is not HH:mm', () => {
    const t = task()
    const plan = planSave(
      t,
      edit(t, { deadlineDate: '2026-11-18', deadlineTime: '8pm' }),
      NOW,
    )
    expect(plan.errors.deadline).toMatch(/24-hour/)
    expect(plan.patch).toEqual({})
  })

  it('completes with "now" and un-completes with null', () => {
    const open = task()
    expect(planSave(open, edit(open, { completed: true }), NOW).patch).toEqual({
      completedAt: NOW,
    })
    const done = task({ completedAt: at(16) })
    expect(planSave(done, edit(done, { completed: false }), NOW).patch).toEqual(
      { completedAt: null },
    )
  })

  it('moves the reminder with the deadline and says so', () => {
    const t = task({ deadline: at(20, 20), remindAt: at(19, 7) })
    const plan = planSave(t, edit(t, { deadlineDate: '2026-11-18' }), NOW)
    expect(plan.reminderMovesTo).toEqual(at(17, 7))
    expect(plan.patch).toEqual({ deadline: at(18, 20), remindAt: at(17, 7) })
    expect(plan.errors).toEqual({})
  })

  it('moves the reminder to the day before when a first deadline lands before it', () => {
    const t = task({ remindAt: at(20, 7) })
    const plan = planSave(
      t,
      edit(t, { deadlineDate: '2026-11-19', deadlineTime: '20:00' }),
      NOW,
    )
    expect(plan.patch).toEqual({ deadline: at(19, 20), remindAt: at(18, 7) })
  })

  it('never moves a reminder typed by hand: after the deadline it is an error', () => {
    const t = task({ deadline: at(20, 20), remindAt: at(19, 7) })
    const plan = planSave(t, edit(t, { remindDate: '2026-11-21' }), NOW)
    expect(plan.errors.remindAt).toBe(
      "The reminder can't be after the deadline.",
    )
    expect(plan.reminderMovesTo).toBeNull()
    expect(plan.patch).toEqual({})
  })

  it('archiving unpins, and keeps the other edits', () => {
    const t = task({ pinned: true })
    const plan = planSave(
      t,
      edit(t, { title: 'Tow bar done', pinned: false, archived: true }),
      NOW,
    )
    expect(plan.patch).toEqual({
      title: 'Tow bar done',
      pinned: false,
      archivedAt: NOW,
    })
  })

  it('sends nothing for an archived task that is still ticked Archived, whatever the fields hold', () => {
    const t = task({ archivedAt: at(10) })
    expect(
      planSave(t, edit(t, { title: 'Edited while unticked' }), NOW).patch,
    ).toEqual({})
  })

  it('unarchives and saves the edits in one patch', () => {
    const t = task({ archivedAt: at(10) })
    expect(
      planSave(t, edit(t, { title: 'Back on', archived: false }), NOW).patch,
    ).toEqual({
      title: 'Back on',
      archivedAt: null,
    })
  })

  it('ends a running snooze when the deadline or reminder changes', () => {
    const t = task({ deadline: at(17, 20), snoozedUntil: at(17, 13) })
    const plan = planSave(t, edit(t, { deadlineTime: '21:00' }), NOW)
    expect(plan.patch).toEqual({ deadline: at(17, 21), snoozedUntil: null })
    expect(plan.snoozeEnds).toBe(true)
  })

  it('clears an expired snooze too, without a note', () => {
    const t = task({ remindAt: at(16, 7), snoozedUntil: at(16, 9) })
    const plan = planSave(t, edit(t, { remindDate: '', remindTime: '' }), NOW)
    expect(plan.patch).toEqual({ remindAt: null, snoozedUntil: null })
    expect(plan.snoozeEnds).toBe(false)
  })

  it('leaves the snooze alone for other edits', () => {
    const t = task({ deadline: at(17, 20), snoozedUntil: at(17, 13) })
    const plan = planSave(
      t,
      edit(t, { title: 'New title', status: 'In progress' }),
      NOW,
    )
    expect(plan.patch).toEqual({ title: 'New title', status: 'In progress' })
    expect(plan.snoozeEnds).toBe(false)
  })
})

describe('saveErrorMessage', () => {
  it('turns a database rule name into a sentence', () => {
    expect(saveErrorMessage('remind_not_after_deadline')).toBe(
      "The reminder can't be after the deadline. Nothing was saved.",
    )
  })

  it('shows any other message as it came', () => {
    expect(saveErrorMessage('Task not found')).toBe(
      "Couldn't save (Task not found). Nothing was saved.",
    )
  })
})
