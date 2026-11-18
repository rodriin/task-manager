import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '../../types'
import { TaskDialog } from './TaskDialog'

// Fixed "now": Tuesday 17 Nov 2026, 10:00 local time.
const NOW = new Date(2026, 10, 17, 10, 0)
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour)

function task(fields: Partial<Task> = {}): Task {
  return {
    id: 7,
    title: 'Tow bar inspection',
    description: null,
    deadline: null,
    status: 'In progress',
    category: 'Supply',
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

/** The JSON the API sends back: the task with the patch applied. */
const asJson = (t: Task, patch: object) =>
  JSON.parse(JSON.stringify({ ...t, ...patch }))

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function open(t: Task) {
  const onClose = vi.fn()
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  client.setQueryData(['tasks'], [t])
  render(
    <QueryClientProvider client={client}>
      <TaskDialog task={t} now={NOW} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, client }
}

/** The body of the one PATCH sent. */
const sentPatch = () => {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/tasks/7')
  expect(init.method).toBe('PATCH')
  return JSON.parse(init.body)
}

const okResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 })

describe('TaskDialog', () => {
  it("opens with the task's values, focus on the title", () => {
    open(task({ deadline: at(18, 20) }))
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
    expect(screen.getByLabelText('Title')).toHaveValue('Tow bar inspection')
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.getByLabelText('Status')).toHaveValue('In progress')
    expect(screen.getByLabelText('Category')).toHaveValue('Supply')
    expect(screen.getByLabelText('Deadline date')).toHaveValue('2026-11-18')
    expect(screen.getByLabelText(/Deadline time/)).toHaveValue('20:00')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('sends only the title when only the title changed, then closes and updates the cache', async () => {
    const t = task()
    fetchMock.mockResolvedValue(
      okResponse(asJson(t, { title: 'Tow bar fixed' })),
    )
    const { onClose, client } = open(t)

    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Tow bar fixed')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(sentPatch()).toEqual({ title: 'Tow bar fixed' })
    expect(onClose).toHaveBeenCalled()
    expect(client.getQueryData<Task[]>(['tasks'])?.[0].title).toBe(
      'Tow bar fixed',
    )
  })

  it('shows where the reminder moves when the deadline moves before it, and sends both', async () => {
    const t = task({ deadline: at(20, 20), remindAt: at(19, 7) })
    fetchMock.mockResolvedValue(okResponse(asJson(t, {})))
    open(t)

    await userEvent.clear(screen.getByLabelText('Deadline date'))
    await userEvent.type(screen.getByLabelText('Deadline date'), '2026-11-18')
    expect(
      screen.getByText('Reminder moves to Today 07:00'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(sentPatch()).toEqual({
      deadline: at(18, 20).toISOString(),
      remindAt: at(17, 7).toISOString(),
    })
  })

  it('keeps the dialog open with a plain message when the database refuses', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'snooze_after_reminder' }), {
        status: 422,
      }),
    )
    const { onClose } = open(task())

    await userEvent.type(screen.getByLabelText('Title'), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The snooze has to end after the reminder. Nothing was saved.',
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Title')).toHaveValue('Tow bar inspection!')
  })

  it('Cancel closes without sending anything', async () => {
    const { onClose } = open(task())
    await userEvent.type(screen.getByLabelText('Title'), ' edited')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens an archived task locked, except for Archived', () => {
    open(task({ archivedAt: at(10) }))
    expect(screen.getByText(/Untick Archived to edit/)).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toBeDisabled()
    expect(screen.getByLabelText('Completed')).toBeDisabled()
    expect(screen.getByLabelText('Archived')).toBeEnabled()
    expect(screen.getByLabelText('Archived')).toHaveFocus()
  })

  it('re-ticking Archived on an archived task puts the stored values back', async () => {
    open(task({ archivedAt: at(10) }))
    await userEvent.click(screen.getByLabelText('Archived'))
    expect(screen.getByLabelText('Title')).toBeEnabled()
    await userEvent.type(screen.getByLabelText('Title'), ' edited')

    await userEvent.click(screen.getByLabelText('Archived'))
    expect(screen.getByLabelText('Title')).toHaveValue('Tow bar inspection')
    expect(screen.getByLabelText('Title')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('archiving an open task locks the fields, unpins, and keeps the typed title', async () => {
    const t = task({ pinned: true })
    fetchMock.mockResolvedValue(okResponse(asJson(t, {})))
    open(t)

    await userEvent.type(screen.getByLabelText('Title'), ' done')
    await userEvent.click(screen.getByLabelText('Archived'))

    expect(screen.getByLabelText('Title')).toBeDisabled()
    expect(screen.getByLabelText('Title')).toHaveValue(
      'Tow bar inspection done',
    )
    expect(screen.getByLabelText('Pinned')).not.toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const patch = sentPatch()
    expect(patch).toMatchObject({
      title: 'Tow bar inspection done',
      pinned: false,
    })
    expect(patch.archivedAt).toEqual(expect.any(String))
  })

  it('unticking Archived again on an open task restores Pinned', async () => {
    open(task({ pinned: true }))
    await userEvent.click(screen.getByLabelText('Archived'))
    await userEvent.click(screen.getByLabelText('Archived'))
    expect(screen.getByLabelText('Pinned')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
