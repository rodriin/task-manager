import { useQuery } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import { fetchMe, fetchTasks } from './api/client'
import { TaskSection } from './components/TaskSection'
import { buildScan } from './helpers/taskHelpers'
import { useNow } from './useNow'

/** The opening screen: the scan. Pinned, Today, Tomorrow, then Reminders. */
function App() {
  const now = useNow()
  // TanStack Query fetches, caches and refetches when the window regains focus.
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: fetchTasks })
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe })
  const scan = tasks.data ? buildScan(tasks.data, now) : null

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
        <header className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold">
            {me.data ? me.data.displayName : 'Task Manager'}
          </h1>
          <span className="text-sm text-gray-500">
            {format(now, 'EEEE d MMMM, HH:mm')}
          </span>
        </header>

        {tasks.isPending && <p>Loading tasks…</p>}
        {tasks.isError && (
          <p className="text-red-700">
            Couldn't load tasks: {tasks.error.message}
          </p>
        )}
        {scan && (
          <>
            <TaskSection
              title="Pinned"
              tasks={scan.pinned}
              now={now}
              hideWhenEmpty
            />
            <TaskSection
              title="Today"
              subtitle={format(now, 'EEE d MMM')}
              tasks={scan.today}
              now={now}
            />
            <TaskSection
              title="Tomorrow"
              subtitle={format(addDays(now, 1), 'EEE d MMM')}
              tasks={scan.tomorrow}
              now={now}
            />
            <TaskSection
              title="Reminders"
              tasks={scan.reminders}
              now={now}
              hideWhenEmpty
            />
          </>
        )}
      </main>
    </div>
  )
}

export default App
