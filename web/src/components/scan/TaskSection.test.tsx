import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '../../types'
import { TaskSection } from './TaskSection'

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

  it('shows New next to High, and next to Overdue', () => {
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
    expect(screen.getByText('New')).toBeVisible()
    expect(screen.getByText(/^Overdue/)).toBeVisible()
  })
})
