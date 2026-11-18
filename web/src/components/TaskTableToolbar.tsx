import { useId } from 'react'
import {
  DEADLINE_FILTERS,
  STATUS_FILTERS,
  type DeadlineFilter,
  type StatusFilter,
} from '../helpers/taskHelpers'

interface Props {
  search: string
  status: StatusFilter | undefined
  deadline: DeadlineFilter | undefined
  matching: number
  onSearch: (value: string) => void
  onStatus: (value: StatusFilter | undefined) => void
  onDeadline: (value: DeadlineFilter | undefined) => void
  onClear: () => void
}

const fieldStyle =
  'rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-gray-500'

/**
 * Search box and the two filters above the full list. One row, wrapping on narrow screens.
 * An empty dropdown value ("All", "Any") means no filter.
 *
 * Accessibility: every field has a real <label> tied to it with htmlFor/id (the search label
 * is visually hidden, the placeholder is not a label); the group is a search landmark; the
 * count is a polite live region, so a screen reader hears "12 tasks" after each change.
 */
export function TaskTableToolbar({
  search,
  status,
  deadline,
  matching,
  onSearch,
  onStatus,
  onDeadline,
  onClear,
}: Props) {
  const id = useId() // unique ids, so the labels point at the right fields
  const narrowed =
    search !== '' || status !== undefined || deadline !== undefined

  return (
    <div
      role="search"
      aria-label="Search and filter tasks"
      className="flex flex-wrap items-center gap-x-4 gap-y-2"
    >
      <label htmlFor={`${id}-search`} className="sr-only">
        Search tasks
      </label>
      <input
        id={`${id}-search`}
        type="search"
        placeholder="Search title, description, category, type, priority..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className={`${fieldStyle} min-w-110 grow`}
      />
      <div className="flex items-center gap-1 text-sm text-gray-600">
        <label htmlFor={`${id}-status`}>Status</label>
        <select
          id={`${id}-status`}
          value={status ?? ''}
          onChange={(e) =>
            onStatus((e.target.value || undefined) as StatusFilter | undefined)
          }
          className={fieldStyle}
        >
          <option value="">All</option>
          {STATUS_FILTERS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1 text-sm text-gray-600">
        <label htmlFor={`${id}-deadline`}>Deadline</label>
        <select
          id={`${id}-deadline`}
          value={deadline ?? ''}
          onChange={(e) =>
            onDeadline(
              (e.target.value || undefined) as DeadlineFilter | undefined,
            )
          }
          className={fieldStyle}
        >
          <option value="">Any</option>
          {DEADLINE_FILTERS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
      {narrowed && (
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-gray-600 hover:text-gray-900 rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100"
        >
          Clear
        </button>
      )}
      <span aria-live="polite" className="ml-auto text-sm text-gray-500">
        {matching} {matching === 1 ? 'task' : 'tasks'}
      </span>
    </div>
  )
}
