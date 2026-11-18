// Calls to the JSON API. The UI and API share one origin (in dev, Vite forwards /api),
// so plain relative URLs work everywhere.
import type { Task, User } from '../types'

type DateField =
  | 'deadline'
  | 'remindAt'
  | 'snoozedUntil'
  | 'createdAt'
  | 'completedAt'
  | 'archivedAt'

// A task as it arrives over the wire: timestamps are ISO strings like "2026-11-17T22:00:00Z".
type TaskJson = Omit<Task, DateField> & Record<DateField, string | null>

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  // fetch only rejects on network errors; a 404 or 500 must be turned into an error here
  // so TanStack Query reports it and the screen can show it.
  if (!res.ok) throw new Error(`${path} failed with ${res.status}`)
  return res.json() as Promise<T>
}

const toDate = (value: string | null) =>
  value === null ? null : new Date(value)

// The one place ISO strings become Dates. Everything after this works with Date objects,
// which date-fns shows in the viewer's local time.
function parseTask(row: TaskJson): Task {
  return {
    ...row,
    deadline: toDate(row.deadline),
    remindAt: toDate(row.remindAt),
    snoozedUntil: toDate(row.snoozedUntil),
    createdAt: new Date(row.createdAt as string),
    completedAt: toDate(row.completedAt),
    archivedAt: toDate(row.archivedAt),
  }
}

/** Every task, archived included. The scan is built from this in the browser. */
export async function fetchTasks(): Promise<Task[]> {
  const rows = await getJson<TaskJson[]>('/api/tasks')
  return rows.map(parseTask)
}

/** The single user (no login). */
export function fetchMe(): Promise<User> {
  return getJson<User>('/api/me')
}
