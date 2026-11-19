import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  render as renderPlain,
  screen,
  within,
  type RenderOptions,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '../../types'
import { TaskSection } from './TaskSection'

/** Renders with a query client: the bell's snooze menu saves through it. */
const render = (ui: React.ReactElement, options?: RenderOptions) =>
  renderPlain(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    ),
    ...options,
  })

// Fixed "now": Tuesday 17 Nov 2026, 10:00 local time.
const NOW = new Date(2026, 10, 17, 10, 0)

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
    createdAt: new Date(2026, 10, 1),
    completedAt: null,
    archivedAt: null,
    ...fields,
  }
}

describe('TaskSection', () => {
  it('collapses from its heading and keeps the count', async () => {
    render(
      <TaskSection
        title="Today"
        tasks={[task(1), task(2)]}
        now={NOW}
        onOpen={() => {}}
      />,
    )
    const section = screen.getByRole('region', { name: 'Today' })
    expect(within(section).getByText('Task 1')).toBeVisible()

    await userEvent.click(within(section).getByText('Today'))
    expect(within(section).getByText('Task 1')).not.toBeVisible()
    expect(within(section).getByText('(2 Tasks)')).toBeVisible()

    await userEvent.click(within(section).getByText('Today'))
    expect(within(section).getByText('Task 1')).toBeVisible()
  })

  it('shows the New icon with High, and with the overdue bell', () => {
    const hourAgo = new Date(NOW.getTime() - 60 * 60 * 1000)
    render(
      <TaskSection
        title="Today"
        tasks={[
          task(1, {
            createdAt: hourAgo,
            priority: 'High',
            deadline: new Date(2026, 10, 16, 20),
          }),
        ]}
        now={NOW}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('High')).toBeVisible()
    expect(screen.getByRole('img', { name: 'New' })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Overdue/ })).toBeVisible()
  })

  it('a line: the bell, the deadline, no "Overdue" words; a reminder that is not the alert is hidden', () => {
    render(
      <TaskSection
        title="Today"
        tasks={[
          task(1, {
            deadline: new Date(2026, 10, 16, 20),
            remindAt: new Date(2026, 10, 16, 7),
          }),
          task(2, {
            deadline: new Date(2026, 10, 17, 20),
            remindAt: new Date(2026, 10, 17, 18),
          }),
        ]}
        now={NOW}
        onOpen={() => {}}
      />,
    )
    const [late, later] = screen.getAllByRole('listitem')
    expect(within(late).getByRole('button', { name: /^Overdue/ })).toBeVisible()
    expect(within(late).queryByText(/Overdue/)).toBeNull() // the bell's label says it
    expect(late).toHaveClass('bg-red-50')
    expect(within(late).queryByText(/Reminder/)).toBeNull() // overdue is the alert
    expect(within(later).getByText('Due Today 20:00')).toBeVisible()
    expect(within(later).queryByText(/Reminder/)).toBeNull()
    expect(within(later).queryByRole('button', { name: /Snooze/ })).toBeNull()
  })

  it('a snoozed overdue line is quiet: no tint, the snoozed icon and when it ends', () => {
    render(
      <TaskSection
        title="Today"
        tasks={[
          task(1, {
            deadline: new Date(2026, 10, 16, 20),
            snoozedUntil: new Date(2026, 10, 17, 13),
          }),
        ]}
        now={NOW}
        onOpen={() => {}}
      />,
    )
    const line = screen.getByRole('listitem')
    expect(line).not.toHaveClass('bg-red-50')
    expect(
      within(line).getByRole('button', { name: /^Snoozed until Today 13:00/ }),
    ).toBeVisible()
    // Line 2: the snooze end as a short time, labelled for screen readers.
    expect(
      within(line).getByText('Snoozed until').parentElement,
    ).toHaveTextContent('Snoozed until13:00')
  })
})
