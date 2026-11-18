import type { Task } from '../../types'

/**
 * A task's title as a button that opens its detail and edit dialog. A button, not a click on
 * the whole row, so it is reachable by keyboard and announced by screen readers.
 */
export function TitleButton({
  task,
  onOpen,
}: {
  task: Task
  onOpen: (id: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="text-left font-medium hover:underline cursor-pointer"
    >
      {task.title}
    </button>
  )
}
