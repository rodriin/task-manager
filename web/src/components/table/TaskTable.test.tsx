import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '../../types'
import { TaskTable } from './TaskTable'

// Fixed "now": Tuesday 17 Nov 2026, 10:00 local time.
const NOW = new Date(2026, 10, 17, 10, 0)
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour)

function task(id: number, fields: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
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

/** Titles of the rows on the current page, top to bottom. */
const titles = () =>
  screen
    .getAllByRole('row')
    .slice(1) // skip the header row
    .map((row) => within(row).getAllByRole('cell')[1].textContent)

describe('TaskTable', () => {
  it('labels every search and filter field', () => {
    render(<TaskTable tasks={[task(1)]} now={NOW} onOpen={() => {}} />)
    expect(
      screen.getByRole('searchbox', { name: 'Search tasks' }),
    ).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Deadline' })).toBeVisible()
    expect(screen.getByRole('search')).toBeVisible()
  })

  it('shows 10 rows per page in the order given, and a Deadline sort puts no deadline last', async () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      task(i + 1, { deadline: i === 0 ? null : at(18 + i) }),
    )
    render(<TaskTable tasks={tasks} now={NOW} onOpen={() => {}} />)

    expect(screen.getByText('12 tasks')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(titles()).toHaveLength(10)
    expect(titles()[0]).toBe('Task 1') // no sort: the order the API sent

    await userEvent.click(screen.getByRole('button', { name: 'Deadline' }))
    expect(titles()[0]).toBe('Task 2')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(titles()).toEqual(['Task 12', 'Task 1'])
  })

  it('treats pinned tasks as ordinary rows, and the Pin column sorts them first', async () => {
    const tasks = [
      task(1, { deadline: at(18) }),
      task(2, { deadline: at(20), pinned: true }),
      task(3, { deadline: at(19) }),
    ]
    render(<TaskTable tasks={tasks} now={NOW} onOpen={() => {}} />)
    expect(titles()).toEqual(['Task 1', 'Task 2', 'Task 3'])

    await userEvent.click(screen.getByRole('button', { name: 'Pin' }))
    expect(titles()[0]).toBe('Task 2')
    await userEvent.click(screen.getByRole('button', { name: 'Pin' }))
    expect(titles()[2]).toBe('Task 2')
    await userEvent.click(screen.getByRole('button', { name: 'Pin' })) // third click clears
    expect(titles()).toEqual(['Task 1', 'Task 2', 'Task 3'])
  })

  it('combines search, the Status filter and a column sort', async () => {
    const tasks = [
      task(1, { title: 'Tow bar B', category: 'Supply' }),
      task(2, { title: 'Tow bar A', completedAt: at(16) }),
      task(3, { title: 'Morning brief' }),
      task(4, { title: 'Tow bar C', archivedAt: at(16) }),
    ]
    render(<TaskTable tasks={tasks} now={NOW} onOpen={() => {}} />)

    await userEvent.type(screen.getByLabelText('Search tasks'), 'tow')
    expect(screen.getByText('3 tasks')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Open')
    expect(titles()).toEqual(['Tow bar B'])

    await userEvent.selectOptions(screen.getByLabelText('Status'), '')
    await userEvent.click(screen.getByRole('button', { name: 'Title' }))
    expect(titles()).toEqual(['Tow bar A', 'Tow bar B', 'Tow bar C'])

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('4 tasks')).toBeInTheDocument()
  })

  it('filters by deadline and offers to clear when nothing matches', async () => {
    const tasks = [
      task(1, { deadline: at(16) }), // overdue
      task(2, { deadline: at(17, 20) }), // today
      task(3), // no deadline
    ]
    render(<TaskTable tasks={tasks} now={NOW} onOpen={() => {}} />)

    await userEvent.selectOptions(screen.getByLabelText('Deadline'), 'Overdue')
    expect(titles()).toEqual(['Task 1'])
    expect(within(screen.getByRole('table')).getByText('Overdue')).toBeVisible() // the red tag

    await userEvent.selectOptions(screen.getByLabelText('Deadline'), 'Later')
    expect(screen.getByText('No tasks match.')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Clear search and filters' }),
    )
    expect(titles()).toHaveLength(3)
  })

  it('tags new tasks, next to Overdue when both, and the New filter lists them all', async () => {
    const hourAgo = new Date(NOW.getTime() - 60 * 60 * 1000)
    const tasks = [
      task(1, { createdAt: hourAgo }), // new
      task(2, { createdAt: hourAgo, deadline: at(16) }), // new and overdue
      task(3), // old
    ]
    render(<TaskTable tasks={tasks} now={NOW} onOpen={() => {}} />)
    const statusCell = (row: number) =>
      within(screen.getAllByRole('row')[row]).getAllByRole('cell')[2]

    expect(within(statusCell(1)).getByText('New')).toBeVisible()
    expect(within(statusCell(2)).getByText('New')).toBeVisible()
    expect(within(statusCell(2)).getByText('Overdue')).toBeVisible()
    expect(within(statusCell(3)).queryByText('New')).toBeNull()

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'New')
    expect(titles()).toEqual(['Task 1', 'Task 2'])
  })
})
