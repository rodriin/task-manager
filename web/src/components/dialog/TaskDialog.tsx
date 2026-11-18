// Task detail and edit, in one dialog that opens on the form.
// The native <dialog> with showModal() gives the focus trap, Escape to close, the backdrop,
// and makes the page behind inert, with no library.
import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, updateTask, type TaskPatch } from '../../api/client'
import { day, when } from '../../helpers/formatDates'
import {
  CATEGORIES,
  DEFAULT_DEADLINE_TIME,
  DEFAULT_REMINDER_TIME,
  DESCRIPTION_MAX,
  PRIORITIES,
  STATUSES,
  TITLE_MAX,
  TYPES,
  hasErrors,
  planSave,
  saveErrorMessage,
  toFormValues,
  type FormValues,
} from '../../helpers/taskForm'
import type { Task } from '../../types'
import { Checkbox } from './Checkbox'
import { DateTimeField } from './DateTimeField'
import { FieldError } from './FieldError'
import { Select } from './Select'
import { TaskFacts } from './TaskFacts'
import { FIELD, PRIMARY_BUTTON, SECONDARY_BUTTON } from './styles'

interface Props {
  task: Task
  now: Date
  /** Called once the dialog has closed (saved, cancelled, Escape or backdrop). */
  onClose: () => void
}

/**
 * The form copies the task once, when it opens (App gives it `key={task.id}`), so a background
 * refetch doesn't wipe what's being typed. The save goes through `planSave`, which sends only
 * what changed.
 */
export function TaskDialog({ task, now, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const archivedRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const queryClient = useQueryClient()

  const [values, setValues] = useState<FormValues>(() => toFormValues(task))
  // Pinned as it was before Archived was ticked, so unticking Archived can put it back.
  const [pinnedBeforeArchive, setPinnedBeforeArchive] = useState(task.pinned)

  const storedArchived = task.archivedAt !== null
  const locked = values.archived
  const plan = planSave(task, values, now)
  const canSave = Object.keys(plan.patch).length > 0 && !hasErrors(plan.errors)

  const save = useMutation({
    mutationFn: (patch: TaskPatch) => updateTask(task.id, patch),
    onSuccess: (saved) => {
      // No optimistic update: the scan and table change only once the database has accepted it.
      queryClient.setQueryData<Task[]>(['tasks'], (tasks) =>
        tasks?.map((t) => (t.id === saved.id ? saved : t)),
      )
      dialogRef.current?.close()
    },
  })

  // Open as a modal once, when mounted; focus the title, or Archived when the form opens locked.
  // (Kept off the task's later values: a save that archives must not reopen the dialog.)
  const [opensLocked] = useState(storedArchived)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    ;(opensLocked ? archivedRef : titleRef).current?.focus()
  }, [opensLocked])

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const toggleArchived = (archived: boolean) => {
    if (archived && storedArchived) {
      // Re-ticking an archived task puts every field back to what is stored, so nothing changes.
      setValues(toFormValues(task))
    } else if (archived) {
      // Archiving an open task keeps the edits; Pinned unticks, the same as the server.
      setPinnedBeforeArchive(values.pinned)
      setValues((v) => ({ ...v, archived: true, pinned: false }))
    } else {
      setValues((v) => ({
        ...v,
        archived: false,
        pinned: storedArchived ? v.pinned : pinnedBeforeArchive,
      }))
    }
  }

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault()
    // Plan again with the real time of the save: Completed and Archived are stamped with it.
    const final = planSave(task, values, new Date())
    if (Object.keys(final.patch).length > 0 && !hasErrors(final.errors)) {
      save.mutate(final.patch)
    }
  }

  const ids = {
    title: `${id}-title`,
    heading: `${id}-heading`,
    description: `${id}-description`,
    status: `${id}-status`,
    priority: `${id}-priority`,
    category: `${id}-category`,
    type: `${id}-type`,
    pinned: `${id}-pinned`,
    completed: `${id}-completed`,
    archived: `${id}-archived`,
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={ids.heading}
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> itself (the content fills it), so close.
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current.close()
      }}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-lg p-0 text-gray-900 shadow-xl backdrop:bg-gray-900/40"
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5" noValidate>
        <div className="flex items-start justify-between gap-3">
          <h2 id={ids.heading} className="text-lg font-semibold">
            Edit task
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialogRef.current?.close()}
            className="rounded px-2 text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <TaskFacts task={task} now={now} />

        {locked && (
          <p className="rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">
            {task.archivedAt
              ? `Archived on ${day(task.archivedAt, now)}.`
              : 'Will be archived when saved.'}{' '}
            Untick Archived to edit.
          </p>
        )}

        {/* Every field except Archived; disabling the fieldset disables them all. */}
        <fieldset disabled={locked} className="flex min-w-0 flex-col gap-3">
          <legend className="sr-only">Task details</legend>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.title} className="text-sm font-medium">
              Title
            </label>
            <input
              ref={titleRef}
              id={ids.title}
              value={values.title}
              maxLength={TITLE_MAX}
              required
              aria-invalid={plan.errors.title ? true : undefined}
              aria-describedby={
                plan.errors.title ? `${ids.title}-error` : undefined
              }
              onChange={(e) => set('title', e.target.value)}
              className={`${FIELD} w-full`}
            />
            <FieldError id={`${ids.title}-error`} message={plan.errors.title} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={ids.description} className="text-sm font-medium">
              Description
            </label>
            <textarea
              id={ids.description}
              value={values.description}
              maxLength={DESCRIPTION_MAX}
              rows={3}
              onChange={(e) => set('description', e.target.value)}
              className={`${FIELD} w-full`}
            />
            <FieldError
              id={`${ids.description}-error`}
              message={plan.errors.description}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              id={ids.status}
              label="Status"
              value={values.status}
              options={STATUSES}
              onChange={(v) => set('status', v as FormValues['status'])}
            />
            <Select
              id={ids.priority}
              label="Priority"
              value={values.priority}
              options={PRIORITIES}
              onChange={(v) => set('priority', v as FormValues['priority'])}
            />
            <Select
              id={ids.category}
              label="Category"
              value={values.category}
              options={CATEGORIES}
              none
              onChange={(v) => set('category', v)}
            />
            <Select
              id={ids.type}
              label="Type"
              value={values.type}
              options={TYPES}
              none
              onChange={(v) => set('type', v)}
            />
          </div>

          <DateTimeField
            id={`${id}-deadline`}
            label="Deadline"
            date={values.deadlineDate}
            time={values.deadlineTime}
            defaultTime={DEFAULT_DEADLINE_TIME}
            error={plan.errors.deadline}
            onChange={(date, time) =>
              setValues((v) => ({
                ...v,
                deadlineDate: date,
                deadlineTime: time,
              }))
            }
          />
          <DateTimeField
            id={`${id}-remind`}
            label="Reminder"
            date={values.remindDate}
            time={values.remindTime}
            defaultTime={DEFAULT_REMINDER_TIME}
            error={plan.errors.remindAt}
            note={
              plan.reminderMovesTo
                ? `Reminder moves to ${when(plan.reminderMovesTo, now)}`
                : undefined
            }
            onChange={(date, time) =>
              setValues((v) => ({ ...v, remindDate: date, remindTime: time }))
            }
          />
          {plan.snoozeEnds && (
            <p className="text-sm text-gray-700" aria-live="polite">
              Snooze ends: the dates changed.
            </p>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Checkbox
              id={ids.pinned}
              label="Pinned"
              checked={values.pinned}
              onChange={(v) => set('pinned', v)}
            />
            <Checkbox
              id={ids.completed}
              label="Completed"
              checked={values.completed}
              onChange={(v) => set('completed', v)}
            />
          </div>
        </fieldset>

        {/* Archived sits outside the fieldset, so it stays usable when everything else is locked. */}
        <Checkbox
          ref={archivedRef}
          id={ids.archived}
          label="Archived"
          checked={values.archived}
          onChange={toggleArchived}
        />

        <p role="alert" className="text-sm text-red-700 empty:hidden">
          {save.isError
            ? saveErrorMessage(
                save.error instanceof ApiError ? save.error.detail : undefined,
              )
            : ''}
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={SECONDARY_BUTTON}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave || save.isPending}
            className={PRIMARY_BUTTON}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
