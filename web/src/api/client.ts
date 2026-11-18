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

/**
 * A failed API call. `detail` is the API's own message: for a broken database rule it is the
 * constraint name from schema.sql (e.g. "remind_not_after_deadline"), which the form turns
 * into a sentence.
 */
export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/** FastAPI sends `{"detail": "..."}`, or a list of field errors when a request fails validation. */
async function readDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item: { msg?: string }) => item.msg ?? '')
        .filter(Boolean)
        .join('; ')
    }
  } catch {
    // Not JSON (a proxy error page, say): fall through to the status text.
  }
  return res.statusText || `Request failed with ${res.status}`
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  // fetch only rejects on network errors; a 404 or 500 must be turned into an error here
  // so TanStack Query reports it and the screen can show it.
  if (!res.ok) throw new ApiError(res.status, await readDetail(res))
  return res.json() as Promise<T>
}

const getJson = <T>(path: string) => requestJson<T>(path)

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

/**
 * The fields an update may change. Only the fields present are changed; `null` clears one.
 * Dates are sent as ISO strings in UTC (JSON.stringify calls Date.toJSON).
 */
export type TaskPatch = Partial<Omit<Task, 'id' | 'ownerId' | 'createdAt'>>

/** PATCH /api/tasks/{id}: returns the task as saved. */
export async function updateTask(id: number, patch: TaskPatch): Promise<Task> {
  const task = await requestJson<TaskJson>(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return parseTask(task)
}
