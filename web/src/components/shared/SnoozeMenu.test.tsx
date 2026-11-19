import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '../../types'
import { SnoozeMenu } from './SnoozeMenu'

// Fixed "now": Tuesday 17 Nov 2026, 10:00 local time.
const NOW = new Date(2026, 10, 17, 10, 0)
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour)

function task(fields: Partial<Task> = {}): Task {
  return {
    id: 7,
    title: 'Maintenance sign-off, jet 211',
    description: null,
    deadline: at(16, 20), // overdue
    status: 'Not started',
    category: null,
    type: null,
    priority: 'High',
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

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function open(t: Task) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  client.setQueryData(['tasks'], [t])
  render(
    <QueryClientProvider client={client}>
      <SnoozeMenu task={t} now={NOW} />
    </QueryClientProvider>,
  )
  return client
}

/** The body of the one PATCH sent. */
const sentPatch = () => {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/tasks/7')
  expect(init.method).toBe('PATCH')
  return JSON.parse(init.body)
}

const respond = (t: Task, patch: object) =>
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ...t, ...patch }), { status: 200 }),
  )

describe('SnoozeMenu', () => {
  it('the bell opens six options, each with its end time', async () => {
    open(task())
    await userEvent.click(
      screen.getByRole('button', { name: /^Overdue.*Snooze$/ }),
    )
    const items = screen.getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual([
      '30 minutesuntil 10:30',
      '1 houruntil 11:00',
      '3 hoursuntil 13:00',
      '6 hoursuntil 16:00',
      '8 hoursuntil 18:00',
      'Tomorrow morninguntil Wed 07:00',
    ])
    expect(items[0]).toHaveFocus()
  })

  it('saves the chosen end time once, updates the cache and closes', async () => {
    const t = task()
    const until = new Date(2026, 10, 17, 13)
    respond(t, { snoozedUntil: until.toISOString() })
    const client = open(t)
    await userEvent.click(screen.getByRole('button', { name: /Snooze$/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^3 hours/ }))

    expect(sentPatch()).toEqual({ snoozedUntil: until.toISOString() })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(client.getQueryData<Task[]>(['tasks'])![0].snoozedUntil).toEqual(
      until,
    )
  })

  it('stops at the deadline when it comes first', async () => {
    open(task({ deadline: at(17, 15) })) // due soon
    await userEvent.click(screen.getByRole('button', { name: /^Due soon/ }))
    expect(
      screen.getByRole('menuitem', { name: /^8 hours/ }),
    ).toHaveTextContent('until 15:00 (deadline)')
  })

  it('a snoozed task offers End snooze first, which sends null', async () => {
    const t = task({ snoozedUntil: at(17, 15) })
    respond(t, { snoozedUntil: null })
    open(t)
    await userEvent.click(
      screen.getByRole('button', { name: /^Snoozed until.*Change snooze$/ }),
    )
    const first = screen.getAllByRole('menuitem')[0]
    expect(first).toHaveTextContent('End snooze')
    await userEvent.click(first)
    expect(sentPatch()).toEqual({ snoozedUntil: null })
  })

  it('keeps the menu open with the error when the save is refused', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'snooze_after_reminder' }), {
        status: 422,
      }),
    )
    open(task())
    await userEvent.click(screen.getByRole('button', { name: /Snooze$/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^1 hour/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The snooze has to end after the reminder.',
    )
    expect(screen.getByRole('menu')).toBeVisible()
  })

  it('arrow keys move, Escape closes and returns focus to the bell', async () => {
    open(task())
    const bell = screen.getByRole('button', { name: /Snooze$/ })
    await userEvent.click(bell)
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('menuitem')[1]).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getAllByRole('menuitem')[5]).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(bell).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows only the check on a completed task, and nothing without an alert', () => {
    open(task({ completedAt: at(16) }))
    expect(screen.getByRole('img', { name: /^Completed/ })).toBeVisible()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
