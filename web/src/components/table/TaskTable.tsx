// The All tasks tab: every task ever entered, in one table.
// TanStack Table v9 does the search, filters, sorting and pages in the browser:
// search and filters narrow the rows, the sort orders what's left, then it's split into pages.
import { useMemo } from 'react'
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  useTable,
  type SortFn,
} from '@tanstack/react-table'
import { day, when } from '../../helpers/formatDates'
import {
  alertState,
  isNew,
  matchesDeadline,
  matchesSearch,
  matchesStatus,
  taskStatus,
  type DeadlineFilter,
  type StatusFilter,
  type TaskStatus,
} from '../../helpers/taskHelpers'
import type { Task } from '../../types'
import { NewTag } from '../shared/NewTag'
import { Tag } from '../shared/Tag'
import { TitleButton } from '../shared/TitleButton'
import { TaskTableToolbar } from './TaskTableToolbar'

// Which table features are switched on. Defined once, outside the component, as v9 asks.
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { text: sortFn_text },
})

const helper = createColumnHelper<typeof features, Task>()

/** Sorts numbers (times, ranks) ascending; the table flips it for descending. */
const numeric: SortFn<typeof features, Task> = (a, b, id) =>
  a.getValue<number>(id) - b.getValue<number>(id)

// Sort orders that follow meaning, not the alphabet.
const STATUS_RANK: Record<TaskStatus, number> = {
  'Not started': 0,
  'In progress': 1,
  Completed: 2,
  Archived: 3,
}
const PRIORITY_RANK = { Low: 0, Medium: 1, High: 2 }

/** Empty dates come back as undefined, so `sortUndefined: 'last'` keeps them at the end either way. */
const time = (date: Date | null) => date?.getTime()

/**
 * The columns. They depend on `now` (overdue, "today"), so they are rebuilt when the clock ticks.
 * Each accessor returns the value the column sorts by; `cell` decides what is shown.
 */
function makeColumns(now: Date, onOpen: (id: number) => void) {
  const dateColumn = (id: string, header: string) => ({
    id,
    header,
    sortFn: numeric,
    sortUndefined: 'last' as const,
  })

  return helper.columns([
    helper.accessor((t) => (t.pinned ? 0 : 1), {
      id: 'pinned',
      header: 'Pin',
      sortFn: numeric, // pinned first on the first click
      cell: ({ row }) =>
        row.original.pinned ? (
          <span role="img" aria-label="Pinned">
            📌
          </span>
        ) : null,
    }),
    helper.accessor('title', {
      header: 'Title',
      sortFn: 'text',
      cell: ({ row }) => <TitleButton task={row.original} onOpen={onOpen} />,
    }),
    helper.accessor((t) => STATUS_RANK[taskStatus(t)], {
      id: 'status',
      header: 'Status',
      sortFn: numeric,
      // The Status dropdown sets this filter.
      filterFn: (row, _id, value: StatusFilter) =>
        matchesStatus(row.original, value, now),
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1">
          {taskStatus(row.original)}
          {alertState(row.original, now) === 'overdue' && (
            <Tag className="bg-red-600 text-white">Overdue</Tag>
          )}
          {isNew(row.original, now) && <NewTag />}
        </span>
      ),
    }),
    helper.accessor((t) => PRIORITY_RANK[t.priority], {
      id: 'priority',
      header: 'Priority',
      sortFn: numeric,
      cell: ({ row }) =>
        row.original.priority === 'High' ? (
          <Tag className="bg-gray-700 text-white">High</Tag>
        ) : (
          row.original.priority
        ),
    }),
    helper.accessor((t) => t.category ?? undefined, {
      id: 'category',
      header: 'Category',
      sortFn: 'text',
      sortUndefined: 'last',
    }),
    helper.accessor((t) => t.type ?? undefined, {
      id: 'type',
      header: 'Type',
      sortFn: 'text',
      sortUndefined: 'last',
    }),
    helper.accessor((t) => time(t.deadline), {
      ...dateColumn('deadline', 'Deadline'),
      // The Deadline dropdown sets this filter.
      filterFn: (row, _id, value: DeadlineFilter) =>
        matchesDeadline(row.original, value, now),
      cell: ({ row }) => {
        const { deadline } = row.original
        if (!deadline) return null
        const overdue = alertState(row.original, now) === 'overdue'
        return (
          <span className={overdue ? 'font-semibold text-red-700' : ''}>
            {when(deadline, now)}
          </span>
        )
      },
    }),
    helper.accessor((t) => time(t.remindAt), {
      ...dateColumn('remindAt', 'Reminder'),
      cell: ({ row }) => {
        const { remindAt } = row.original
        if (!remindAt) return null
        const reminding = alertState(row.original, now) === 'reminder'
        return (
          <span className={reminding ? 'font-semibold text-amber-800' : ''}>
            {when(remindAt, now)}
          </span>
        )
      },
    }),
    helper.accessor((t) => time(t.completedAt), {
      ...dateColumn('completedAt', 'Completed'),
      cell: ({ row }) =>
        row.original.completedAt ? day(row.original.completedAt, now) : null,
    }),
    helper.accessor((t) => time(t.createdAt), {
      ...dateColumn('createdAt', 'Created'),
      cell: ({ row }) => day(row.original.createdAt, now),
    }),
  ])
}

/**
 * Row color. Red and amber are alerts (open tasks only), the same as the scan.
 * Completed is muted green (done, something good); archived is muted grey.
 * The colored bar on the left is an inset shadow, because table rows can't take a border.
 */
function rowTone(task: Task, now: Date): string {
  const status = taskStatus(task)
  if (status === 'Archived') return 'bg-gray-50 text-gray-400'
  if (status === 'Completed') return 'bg-green-50 text-green-800'
  const alert = alertState(task, now)
  if (alert === 'overdue')
    return 'bg-red-50 shadow-[inset_4px_0_0_var(--color-red-600)]'
  if (alert === 'reminder')
    return 'bg-amber-50 shadow-[inset_4px_0_0_var(--color-amber-500)]'
  return 'bg-white'
}

const SORT_ARROW = { asc: ' ▲', desc: ' ▼' }

export function TaskTable({
  tasks,
  now,
  onOpen,
}: {
  tasks: Task[]
  now: Date
  /** Opens the task's detail and edit dialog. */
  onOpen: (id: number) => void
}) {
  const columns = useMemo(() => makeColumns(now, onOpen), [now, onOpen])

  const table = useTable({
    features,
    columns,
    data: tasks,
    initialState: {
      // No sort by default: rows stay in the order the API sends them (by id, the order
      // they were entered). Clearing a column's sort comes back to this order.
      sorting: [],
      pagination: { pageIndex: 0, pageSize: 10 },
    },
    // The page is reset by hand when the search or a filter changes (below), not every time
    // the clock ticks and the columns are rebuilt.
    autoResetPageIndex: false,
    // Every column's first click sorts ascending (TanStack defaults numbers to descending):
    // pinned first, A to Z, earliest date first.
    sortDescFirst: false,
    // Search: one check per task, on the whole task, run through the title column.
    globalFilterFn: (row, _id, value: string) =>
      matchesSearch(row.original, value),
    getColumnCanGlobalFilter: (column) => column.id === 'title',
  })

  const statusColumn = table.getColumn('status')
  const deadlineColumn = table.getColumn('deadline')
  const search = (table.state.globalFilter as string | undefined) ?? ''
  const status = statusColumn?.getFilterValue() as StatusFilter | undefined
  const deadline = deadlineColumn?.getFilterValue() as
    DeadlineFilter | undefined
  const matching = table.getFilteredRowModel().rows.length
  const rows = table.getRowModel().rows

  // Any change to the search or filters goes back to page 1.
  const narrow = (apply: () => void) => {
    apply()
    table.setPageIndex(0)
  }
  const clear = () =>
    narrow(() => {
      table.setGlobalFilter('')
      table.resetColumnFilters(true)
    })

  return (
    <section aria-label="All tasks" className="flex flex-col gap-3">
      <TaskTableToolbar
        search={search}
        status={status}
        deadline={deadline}
        matching={matching}
        onSearch={(value) => narrow(() => table.setGlobalFilter(value))}
        onStatus={(value) => narrow(() => statusColumn?.setFilterValue(value))}
        onDeadline={(value) =>
          narrow(() => deadlineColumn?.setFilterValue(value))
        }
        onClear={clear}
      />

      {matching === 0 ? (
        <p
          role="status"
          className="flex items-center gap-3 text-sm text-gray-500"
        >
          No tasks match.
          <button
            type="button"
            onClick={clear}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-700 hover:bg-gray-100"
          >
            Clear search and filters
          </button>
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                All tasks. Column headings are buttons that sort the table.
              </caption>
              <thead className="bg-gray-100 text-xs text-gray-600 uppercase">
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => {
                      const sorted = header.column.getIsSorted()
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          className="px-3 py-2 font-semibold whitespace-nowrap"
                          aria-sort={
                            sorted === 'asc'
                              ? 'ascending'
                              : sorted === 'desc'
                                ? 'descending'
                                : 'none'
                          }
                        >
                          {/* Click: sort; again: reverse; a third time: clear. Back to page 1 each time. */}
                          <button
                            type="button"
                            onClick={(event) => {
                              header.column.getToggleSortingHandler()?.(event)
                              table.setPageIndex(0) // a new order starts at page 1
                            }}
                            className="uppercase hover:text-gray-900"
                          >
                            <table.FlexRender header={header} />
                            {/* The arrow is for the eye; aria-sort on the heading says it to a screen reader. */}
                            <span aria-hidden="true">
                              {sorted ? SORT_ARROW[sorted] : ''}
                            </span>
                          </button>
                        </th>
                      )
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.id} className={rowTone(row.original, now)}>
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        // Only the title wraps; dates and labels stay on one line.
                        className={`px-3 py-2 align-top ${cell.column.id === 'title' ? 'min-w-56' : 'whitespace-nowrap'}`}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav
            aria-label="Pages"
            className="flex items-center justify-end gap-3 text-sm"
          >
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
            >
              Previous
            </button>
            <span aria-live="polite" className="text-gray-600">
              Page {table.state.pagination.pageIndex + 1} of{' '}
              {table.getPageCount()}
            </span>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100 disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  )
}
