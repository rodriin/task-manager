import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { fetchMe, fetchTasks } from './api/client'
import { TaskDialog } from './components/dialog/TaskDialog'
import { PRIMARY_BUTTON } from './components/dialog/styles'
import { TOAST_MS, Toasts, type Toast } from './components/shared/Toasts'
import { TaskSection } from './components/scan/TaskSection'
import { TaskTable } from './components/table/TaskTable'
import type { FormValues } from './helpers/taskForm'
import { buildScan } from './helpers/taskHelpers'
import type { Task } from './types'
import { useNow } from './useNow'

type Tab = 'today' | 'all'
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All tasks' },
]

/** Which dialog is open, if any. A clone starts from the edit form as it was on screen. */
type Dialog =
  | { kind: 'edit'; id: number }
  | { kind: 'new' }
  | { kind: 'clone'; id: number; values: FormValues }

/**
 * Two tabs. Today (the scan, the opening screen): Pinned, Today, Tomorrow, New, then Reminders.
 * All tasks: the full table. Both use the same tasks query, so there's one request.
 */
function App() {
  const now = useNow()
  const [tab, setTab] = useState<Tab>('today')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const openTask = (id: number) => setDialog({ kind: 'edit', id })

  // "New task created" toasts. They stack, and each goes after TOAST_MS.
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastKey = useRef(0)
  const onCreated = (task: Task) => {
    const key = ++toastKey.current
    setToasts((all) => [
      ...all,
      { key, message: `New task created: ${task.title}` },
    ])
    setTimeout(
      () => setToasts((all) => all.filter((t) => t.key !== key)),
      TOAST_MS,
    )
  }

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
  const editTask =
    dialog?.kind === 'edit'
      ? tasks.data?.find((t) => t.id === dialog.id)
      : undefined

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
          <div className="flex items-end justify-between gap-2 border-b border-gray-200">
            <div
              role="tablist"
              aria-label="Views"
              onKeyDown={onTabKey}
              className="flex gap-1"
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
                  className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${tab === id
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDialog({ kind: 'new' })}
              className={`${PRIMARY_BUTTON} mb-1 text-sm`}
            >
              New task
            </button>
          </div>
        </header>
        <Toasts toasts={toasts} />

        {tasks.isPending && <p>Loading tasks…</p>}
        {tasks.isError && (
          <p className="text-red-700">
            Couldn't load tasks: {tasks.error.message}
          </p>
        )}
        {/* Both panels stay mounted while hidden: the table keeps its search, filters, sort and
            page, and the scan keeps which sections are collapsed. */}
        {scan && (
          <div
            role="tabpanel"
            id="panel-today"
            aria-labelledby="tab-today"
            hidden={tab !== 'today'}
            className="flex flex-col gap-6"
          >
            <TaskSection
              title="Pinned"
              tasks={scan.pinned}
              now={now}
              onOpen={openTask}
              hideWhenEmpty
            />
            <TaskSection
              title="Today"
              subtitle={format(now, 'EEE d MMM')}
              tasks={scan.today}
              now={now}
              onOpen={openTask}
            />
            <TaskSection
              title="Tomorrow"
              subtitle={format(addDays(now, 1), 'EEE d MMM')}
              tasks={scan.tomorrow}
              now={now}
              onOpen={openTask}
            />
            <TaskSection
              title="New"
              tasks={scan.newTasks}
              now={now}
              onOpen={openTask}
              hideWhenEmpty
            />
            <TaskSection
              title="Reminders"
              tasks={scan.reminders}
              now={now}
              onOpen={openTask}
              hideWhenEmpty
            />
          </div>
        )}
        {tasks.data && (
          <div
            role="tabpanel"
            id="panel-all"
            aria-labelledby="tab-all"
            hidden={tab !== 'all'}
          >
            <TaskTable tasks={tasks.data} now={now} onOpen={openTask} />
          </div>
        )}
        {/* A key per task and mode, so each dialog opens fresh (edit 7, then clone of 7). */}
        {editTask && (
          <TaskDialog
            key={`edit-${editTask.id}`}
            mode={{ kind: 'edit', task: editTask }}
            now={now}
            onClose={() => setDialog(null)}
            onClone={(values) =>
              setDialog({ kind: 'clone', id: editTask.id, values })
            }
          />
        )}
        {dialog?.kind === 'new' && (
          <TaskDialog
            key="new"
            mode={{ kind: 'new' }}
            now={now}
            onClose={() => setDialog(null)}
            onCreated={onCreated}
          />
        )}
        {dialog?.kind === 'clone' && (
          <TaskDialog
            key={`clone-${dialog.id}`}
            mode={{ kind: 'clone', values: dialog.values }}
            now={now}
            onClose={() => setDialog(null)}
            onCreated={onCreated}
          />
        )}
      </main>
    </div>
  )
}

export default App
