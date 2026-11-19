import { render, screen, within } from '@testing-library/react'
import type { Task } from '../../types'
import { LINES_PER_CARD, PrintCard } from './PrintCard'

// Fixed "now": Tuesday 17 Nov 2026, 10:00 local time.
const NOW = new Date(2026, 10, 17, 10, 0)
const at = (day: number, hour: number) => new Date(2026, 10, day, hour)

function task(id: number, fields: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'Not on the card',
    deadline: null,
    status: 'Not started',
    category: 'Admin',
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

// The card is hidden on screen (print only), so these check content, not visibility.
describe('PrintCard', () => {
  it('one line per task, in order, in plain words', () => {
    render(
      <PrintCard
        title="Today"
        subtitle="Tue 17 Nov"
        now={NOW}
        tasks={[
          task(1, {
            deadline: at(16, 20),
            snoozedUntil: at(18, 7),
            priority: 'High',
          }),
          task(2, { deadline: at(17, 20), pinned: true }),
        ]}
      />,
    )
    expect(screen.getByRole('heading')).toHaveTextContent('Today · Tue 17 Nov')
    expect(screen.getByText(/Printed Tue 17 Nov 10:00/)).toBeInTheDocument()
    const [first, second] = screen.getAllByRole('listitem')
    // Snoozed, but paper can't snooze.
    expect(first).toHaveTextContent('! Task 1OVERDUE Mon 20:00')
    expect(second).toHaveTextContent('Task 2 📌20:00')
    expect(second).not.toHaveTextContent('OVERDUE')
    expect(screen.queryByText(/Not on the card/)).toBeNull()
    expect(screen.queryByText(/Admin/)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('a long section flows onto a second card', () => {
    const tasks = Array.from({ length: LINES_PER_CARD + 2 }, (_, i) =>
      task(i + 1),
    )
    render(<PrintCard title="Tomorrow" now={NOW} tasks={tasks} />)
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getAllByRole('listitem')).toHaveLength(
      LINES_PER_CARD,
    )
    expect(within(cards[1]).getByRole('heading')).toHaveTextContent(
      'Tomorrow (2/2)',
    )
  })
})
