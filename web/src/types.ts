// Shapes of the data the UI works with. They match the API's camelCase JSON,
// except that timestamps are turned into Date objects when they arrive (see api/client.ts).

export type Status = 'Not Started' | 'In-Progress' // Completed and Overdue are derived, never stored
export type Priority = 'Low' | 'Medium' | 'High'

export interface Task {
  id: number
  title: string
  description: string | null
  deadline: Date | null
  status: Status
  category: string | null
  type: string | null
  priority: Priority
  remindAt: Date | null
  ownerId: number
  pinned: boolean
  snoozedUntil: Date | null
  createdAt: Date
  completedAt: Date | null // set = completed
  archivedAt: Date | null // set = archived
}

export interface User {
  id: number
  firstname: string
  lastname: string
  preferredName: string | null
  displayName: string
}
