import { render, screen } from '@testing-library/react'
import { TodayClear } from './TodayClear'

describe('TodayClear', () => {
  it("caught up: says so, with today's done count", () => {
    render(<TodayClear state="caughtUp" done={3} />)
    expect(screen.getByText("You're caught up.")).toBeVisible()
    expect(screen.getByText('3 done today')).toBeVisible()
  })

  it('caught up with nothing done today: no count', () => {
    render(<TodayClear state="caughtUp" done={0} />)
    expect(screen.queryByText(/done today/)).toBeNull()
  })

  it('only pinned tasks due: not caught up', () => {
    render(<TodayClear state="pinnedOnly" done={3} />)
    expect(screen.getByText('Nothing else due today')).toBeVisible()
    expect(screen.getByText('Check the pinned tasks above.')).toBeVisible()
    expect(screen.queryByText(/caught up/)).toBeNull()
  })
})
