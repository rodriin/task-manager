import { format } from 'date-fns'
import { cardLine } from '../../helpers/printCard'
import type { Task } from '../../types'

/** Lines that fit on one 5 × 3 inch card at this type size. More tasks go on a second card. */
export const LINES_PER_CARD = 10

export interface PrintSection {
  title: string
  subtitle?: string
  tasks: Task[]
}

interface Props extends PrintSection {
  now: Date
}

/**
 * One scan section as index cards, for printing only (hidden on screen). Plain black on white:
 * a box to tick by pen, "!" for High, OVERDUE in words, the time on the right. Each card is a
 * 5 × 3 inch box with a border to cut along, so any printer prints it at true size.
 */
export function PrintCard({ title, subtitle, tasks, now }: Props) {
  const lines = tasks.map((task) => cardLine(task, now))
  const cards: (typeof lines)[] = []
  for (let i = 0; i < lines.length; i += LINES_PER_CARD)
    cards.push(lines.slice(i, i + LINES_PER_CARD))

  return (
    <div className="hidden flex-col gap-6 text-black print:flex">
      {cards.map((card, index) => (
        <article
          key={index}
          className="flex h-72 w-120 break-inside-avoid flex-col overflow-hidden border border-black px-[0.2in] py-[0.15in] text-[10pt] leading-[1.4]"
        >
          <header className="flex items-baseline justify-between border-b border-black pb-[2pt]">
            <h1 className="text-[11pt] font-bold uppercase">
              {title}
              {subtitle && (
                <span className="font-normal normal-case"> · {subtitle}</span>
              )}
              {cards.length > 1 && (
                <span className="font-normal normal-case">
                  {' '}
                  ({index + 1}/{cards.length})
                </span>
              )}
            </h1>
            <span className="text-[8pt]">
              Printed {format(now, 'EEE d MMM HH:mm')}
            </span>
          </header>
          <ul className="mt-1">
            {card.map((line) => (
              <li key={line.id} className="flex items-baseline gap-[4pt]">
                <span aria-hidden="true">☐</span>
                <span className="min-w-0 flex-1 truncate">
                  {line.high && <b>! </b>}
                  {line.title}
                  {line.pinned && ' 📌'}
                </span>
                <span className="shrink-0 tabular-nums">
                  {line.overdue && <b>OVERDUE </b>}
                  {line.time}
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  )
}
