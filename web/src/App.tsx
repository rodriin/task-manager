import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { fetchMe, fetchTasks } from './api/client'
import { TaskDialog } from './components/dialog/TaskDialog'
import { TaskSection } from './components/scan/TaskSection'
import { TaskTable } from './components/table/TaskTable'
import { buildScan } from './helpers/taskHelpers'
import { useNow } from './useNow'

type Tab = 'today' | 'all'
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All tasks' },
]

/**
 * Two tabs. Today (the scan, the opening screen): Pinned, Today, Tomorrow, then Reminders.
 * All tasks: the full table. Both use the same tasks query, so there's one request.
 */
function App() {
  const now = useNow()
  const [tab, setTab] = useState<Tab>('today')
  // The task open in the detail and edit dialog, if any.
  const [openTaskId, setOpenTaskId] = useState<number | null>(null)

  // Keyboard for the tabs (the standard ARIA tabs pattern): Tab reaches the selected tab only;
  // the arrow keys, Home and End move between tabs and select them.
  const onTabKey = (event: React.KeyboardEvent) => {
    const index = TABS.findIndex((t) => t.id === tab)
    const next = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    setTab(TABS[next].id)
    document.getElementById(`tab-${TABS[next].id}`)?.focus()
  }
  // TanStack Query fetches, caches and refetches when the window regains focus.
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: fetchTasks })
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const scan = tasks.data ? buildScan(tasks.data, now) : null
  const openTask = tasks.data?.find((t) => t.id === openTaskId)

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* The table needs more width than the scan. */}
      <main
        className={`mx-auto flex flex-col gap-6 px-4 py-6 ${tab === 'all' ? 'max-w-7xl' : 'max-w-2xl'}`}
      >
        <header className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-xl font-bold">
              {me.data ? me.data.displayName : 'Task Manager'}
            </h1>
            <span className="text-sm text-gray-500">
              {format(now, 'EEEE d MMMM, HH:mm')}
            </span>
          </div>
          <div
            role="tablist"
            aria-label="Views"
            onKeyDown={onTabKey}
            className="flex gap-1 border-b border-gray-200"
          >
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
                  tab === id
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {tasks.isPending && <p>Loading tasks…</p>}
        {tasks.isError && (
          <p className="text-red-700">
            Couldn't load tasks: {tasks.error.message}
          </p>
        )}
        {scan && tab === 'today' && (
          <div
            role="tabpanel"
            id="panel-today"
            aria-labelledby="tab-today"
            className="flex flex-col gap-6"
          >
            <TaskSection
              title="Pinned"
              tasks={scan.pinned}
              now={now}
              onOpen={setOpenTaskId}
              hideWhenEmpty
            />
            <TaskSection
              title="Today"
              subtitle={format(now, 'EEE d MMM')}
              tasks={scan.today}
              now={now}
              onOpen={setOpenTaskId}
            />
            <TaskSection
              title="Tomorrow"
              subtitle={format(addDays(now, 1), 'EEE d MMM')}
              tasks={scan.tomorrow}
              now={now}
              onOpen={setOpenTaskId}
            />
            <TaskSection
              title="Reminders"
              tasks={scan.reminders}
              now={now}
              onOpen={setOpenTaskId}
              hideWhenEmpty
            />
          </div>
        )}
        {/* Kept mounted while hidden, so its search, filters, sort and page survive a tab switch. */}
        {tasks.data && (
          <div
            role="tabpanel"
            id="panel-all"
            aria-labelledby="tab-all"
            hidden={tab !== 'all'}
          >
            <TaskTable tasks={tasks.data} now={now} onOpen={setOpenTaskId} />
          </div>
        )}
        {openTask && (
          <TaskDialog
            key={openTask.id}
            task={openTask}
            now={now}
            onClose={() => setOpenTaskId(null)}
          />
        )}
      </main>
    </div>
  )
}

export default App
