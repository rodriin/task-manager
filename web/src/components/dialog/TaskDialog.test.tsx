import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '../../types'
import { toCloneValues, toFormValues } from '../../helpers/taskForm'
import { TaskDialog, type DialogMode } from './TaskDialog'

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

/** Renders the dialog. A task opens it in edit mode; a DialogMode opens new or clone. */
function open(target: Task | DialogMode, cached: Task[] = []) {
  const mode: DialogMode =
    'kind' in target ? target : { kind: 'edit', task: target }
  const onClose = vi.fn()
  const onClone = vi.fn()
  const onCreated = vi.fn()
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  client.setQueryData(['tasks'], mode.kind === 'edit' ? [mode.task] : cached)
  render(
    <QueryClientProvider client={client}>
      <TaskDialog
        mode={mode}
        now={NOW}
        onClose={onClose}
        onClone={onClone}
        onCreated={onCreated}
      />
    </QueryClientProvider>,
  )
  return { onClose, onClone, onCreated, client }
}

/** The body of the one POST sent. */
const sentCreate = () => {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/tasks')
  expect(init.method).toBe('POST')
  return JSON.parse(init.body)
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

  it('End snooze says so, and Save ends the snooze in one PATCH', async () => {
    const t = task({ deadline: at(16, 20), snoozedUntil: at(17, 15) })
    fetchMock.mockResolvedValue(okResponse(asJson(t, { snoozedUntil: null })))
    open(t)

    expect(screen.getByText('Snoozed until 15:00')).toBeVisible()
    expect(screen.getByText('· overdue by 14 hours')).toHaveClass('text-red-700')
    await userEvent.click(screen.getByRole('button', { name: 'End snooze' }))
    expect(screen.getByText('Snooze ends when saved.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'End snooze' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(sentPatch()).toEqual({ snoozedUntil: null })
  })

  it('says the state in one short line, and the created date in small print', () => {
    open(task({ deadline: at(10, 20), createdAt: at(1) }))
    expect(screen.getByText('Overdue by 6 days')).toHaveAttribute(
      'title',
      'Was due Tue 10 Nov, 20:00',
    )
    expect(screen.getByText('Created Sun 1 Nov')).toBeVisible()
  })

  it('shows nothing under the heading when there is no alert, snooze or completion', () => {
    open(task({ deadline: at(25, 20) }))
    expect(
      screen.queryByText(/Overdue|Due in|Reminder since|Snoozed/),
    ).toBeNull()
  })

  it('End snooze then Cancel sends nothing', async () => {
    const { onClose } = open(
      task({ deadline: at(16, 20), snoozedUntil: at(17, 15) }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'End snooze' }))
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

  it('has a Clone button that passes the form as on screen, unsaved edits included, and saves nothing', async () => {
    const t = task({ pinned: true, completedAt: at(10) })
    const { onClone } = open(t)

    await userEvent.type(screen.getByLabelText('Title'), ' (short)')
    await userEvent.click(screen.getByRole('button', { name: 'Clone' }))

    expect(onClone).toHaveBeenCalledWith({
      ...toFormValues(t),
      title: 'Tow bar inspection (short)',
      status: 'Not started',
      pinned: true,
      completed: false,
      archived: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Clone works on an archived, locked task', async () => {
    const { onClone } = open(task({ archivedAt: at(10) }))
    expect(screen.getByRole('button', { name: 'Clone' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Clone' }))
    expect(onClone).toHaveBeenCalled()
  })
})

describe('TaskDialog: new task', () => {
  it('saves with only a title, on Enter, and adds the task to the cache', async () => {
    const existing = task({ id: 3 })
    const created = task({
      id: 99,
      title: 'Check the tow bar adapter fits',
      status: 'Not started',
      priority: 'Low',
      category: null,
      createdAt: NOW,
    })
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(asJson(created, {})), { status: 201 }),
    )
    const { onClose, onCreated, client } = open({ kind: 'new' }, [existing])

    expect(screen.getByRole('heading', { name: 'New task' })).toBeVisible()
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.queryByLabelText('Archived')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clone' })).toBeNull()

    await userEvent.type(
      screen.getByLabelText('Title'),
      'Check the tow bar adapter fits{Enter}',
    )

    expect(sentCreate()).toEqual({
      title: 'Check the tow bar adapter fits',
      description: null,
      deadline: null,
      remindAt: null,
      status: 'Not started',
      priority: 'Low',
      category: null,
      type: null,
      pinned: false,
    })
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }))
    expect(onClose).toHaveBeenCalled()
    expect(client.getQueryData<Task[]>(['tasks'])?.map((t) => t.id)).toEqual([
      3, 99,
    ])
  })

  it('Add task is disabled until there is a title', async () => {
    open({ kind: 'new' })
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Title'), 'Brief')
    expect(screen.getByRole('button', { name: 'Add task' })).toBeEnabled()
  })

  it('notes a deadline that has passed', async () => {
    open({ kind: 'new' })
    await userEvent.type(screen.getByLabelText('Deadline date'), '2026-11-16')
    expect(
      screen.getByText('This deadline has passed: it will show as overdue.'),
    ).toBeInTheDocument()
  })

  it('keeps the dialog open with a plain message when the database refuses', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'remind_not_after_deadline' }), {
        status: 422,
      }),
    )
    const { onClose, onCreated } = open({ kind: 'new' })
    await userEvent.type(screen.getByLabelText('Title'), 'Brief{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The reminder can't be after the deadline. Nothing was saved.",
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('TaskDialog: clone', () => {
  // Last week's roll-up: due Fri 13 Nov 15:00, reminder Thu 12 Nov 07:00.
  const rollUp = task({
    title: 'Status roll-up to the squadron',
    deadline: at(13, 15),
    remindAt: at(12, 7),
    completedAt: at(13, 14),
  })
  const cloneOf = (t: Task): DialogMode => ({
    kind: 'clone',
    values: toCloneValues(toFormValues(t)),
  })

  it('opens with the copied values, focus on the Deadline date', () => {
    open(cloneOf(rollUp))
    expect(screen.getByRole('heading', { name: 'Clone task' })).toBeVisible()
    expect(screen.getByLabelText('Title')).toHaveValue(
      'Status roll-up to the squadron',
    )
    expect(screen.getByLabelText('Status')).toHaveValue('Not started')
    expect(screen.getByLabelText('Completed')).not.toBeChecked()
    expect(screen.getByLabelText('Deadline date')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Add task' })).toBeEnabled()
  })

  it('moving the deadline later leaves the reminder', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(asJson(rollUp, { id: 50 })), { status: 201 }),
    )
    open(cloneOf(rollUp))
    await userEvent.clear(screen.getByLabelText('Deadline date'))
    await userEvent.type(screen.getByLabelText('Deadline date'), '2026-11-20')
    expect(screen.queryByText(/Reminder moves to/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    const body = sentCreate()
    expect(body.deadline).toBe(at(20, 15).toISOString())
    expect(body.remindAt).toBe(at(12, 7).toISOString())
  })

  it('moving the deadline before the reminder moves it, and says so', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(asJson(rollUp, { id: 50 })), { status: 201 }),
    )
    open(cloneOf(rollUp))
    await userEvent.clear(screen.getByLabelText('Deadline date'))
    await userEvent.type(screen.getByLabelText('Deadline date'), '2026-11-11')
    expect(screen.getByText(/Reminder moves to/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(sentCreate().remindAt).toBe(at(10, 7).toISOString())
  })
})
