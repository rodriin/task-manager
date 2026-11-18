// Task detail and edit, new task and clone: one dialog that opens on the form.
// The native <dialog> with showModal() gives the focus trap, Escape to close, the backdrop,
// and makes the page behind inert, with no library.
import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  createTask,
  updateTask,
  type TaskCreateBody,
  type TaskPatch,
} from '../../api/client'
import { day, when } from '../../helpers/formatDates'
import {
  CATEGORIES,
  DEFAULT_DEADLINE_TIME,
  DEFAULT_REMINDER_TIME,
  DESCRIPTION_MAX,
  EMPTY_VALUES,
  PRIORITIES,
  STATUSES,
  TITLE_MAX,
  TYPES,
  hasErrors,
  planCreate,
  planSave,
  saveErrorMessage,
  toCloneValues,
  toFormValues,
  type FormValues,
} from '../../helpers/taskForm'
import type { Task } from '../../types'
import { Checkbox } from './Checkbox'
import { DateTimeField } from './DateTimeField'
import { FieldError } from './FieldError'
import { Select } from './Select'
import { TaskFacts } from './TaskFacts'
import {
  ACCENT_BUTTON,
  FIELD,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  WARNING,
} from './styles'

/**
 * What the dialog is for: edit a stored task, add a new one, or add a clone. A clone starts
 * from the edit form as it was on screen (`toCloneValues`), unsaved edits included.
 */
export type DialogMode =
  | { kind: 'edit'; task: Task }
  | { kind: 'new' }
  | { kind: 'clone'; values: FormValues }

interface Props {
  mode: DialogMode
  now: Date
  /** Called once the dialog has closed (saved, cancelled, Escape or backdrop). */
  onClose: () => void
  /** Edit only: Clone was clicked; gets the clone's starting values. The task isn't saved. */
  onClone?: (values: FormValues) => void
  /** New and clone: the task the API created. */
  onCreated?: (task: Task) => void
}

const HEADINGS = { edit: 'Edit task', new: 'New task', clone: 'Clone task' }

/**
 * The form copies its starting values once, when it opens (App gives it a `key` per task and
 * mode), so a background refetch doesn't wipe what's being typed.
 * Edit saves through `planSave` (a PATCH with only what changed); new and clone through
 * `planCreate` (a POST with every field).
 */
export function TaskDialog({ mode, now, onClose, onClone, onCreated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const deadlineRef = useRef<HTMLInputElement>(null)
  const archivedRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const queryClient = useQueryClient()

  const task = mode.kind === 'edit' ? mode.task : null
  // The form as it opened: what "edited" is measured against.
  const [initial] = useState<FormValues>(() =>
    mode.kind === 'edit'
      ? toFormValues(mode.task)
      : mode.kind === 'clone'
        ? mode.values
        : EMPTY_VALUES,
  )
  const [values, setValues] = useState<FormValues>(initial)
  // Pinned as it was before Archived was ticked, so unticking Archived can put it back.
  const [pinnedBeforeArchive, setPinnedBeforeArchive] = useState(initial.pinned)

  const storedArchived = task !== null && task.archivedAt !== null
  const locked = values.archived
  const editPlan = task ? planSave(task, values, now) : null
  const createPlan = task ? null : planCreate(values, initial, now)
  const errors = (editPlan ?? createPlan)!.errors
  const reminderMovesTo = (editPlan ?? createPlan)!.reminderMovesTo
  const canSave =
    !hasErrors(errors) &&
    (editPlan ? Object.keys(editPlan.patch).length > 0 : true)

  const save = useMutation({
    mutationFn: (request: { patch: TaskPatch } | { body: TaskCreateBody }) =>
      'patch' in request
        ? updateTask(task!.id, request.patch)
        : createTask(request.body),
    onSuccess: (saved) => {
      // No optimistic update: the scan and table change only once the database has accepted it.
      queryClient.setQueryData<Task[]>(['tasks'], (tasks) =>
        task
          ? tasks?.map((t) => (t.id === saved.id ? saved : t))
          : tasks && [...tasks, saved],
      )
      if (!task) onCreated?.(saved)
      dialogRef.current?.close()
    },
  })

  // Open as a modal once, when mounted. Focus goes to the title; to Archived when the form opens
  // locked; to the Deadline date for a clone, the field most likely to change.
  // (Kept off the task's later values: a save that archives must not reopen the dialog.)
  const [firstFocus] = useState(() =>
    storedArchived
      ? archivedRef
      : mode.kind === 'clone'
        ? deadlineRef
        : titleRef,
  )
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    firstFocus.current?.focus()
  }, [firstFocus])

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const toggleArchived = (archived: boolean) => {
    if (archived && storedArchived) {
      // Re-ticking an archived task puts every field back to what is stored, so nothing changes.
      setValues(initial)
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
    const at = new Date()
    if (task) {
      const final = planSave(task, values, at)
      if (Object.keys(final.patch).length > 0 && !hasErrors(final.errors)) {
        save.mutate({ patch: final.patch })
      }
    } else {
      const final = planCreate(values, initial, at)
      if (!hasErrors(final.errors)) save.mutate({ body: final.body })
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
            {HEADINGS[mode.kind]}
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

        {task && <TaskFacts task={task} now={now} />}

        {task && locked && (
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
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? `${ids.title}-error` : undefined}
              onChange={(e) => set('title', e.target.value)}
              className={`${FIELD} w-full`}
            />
            <FieldError id={`${ids.title}-error`} message={errors.title} />
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
              message={errors.description}
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
            error={errors.deadline}
            dateRef={deadlineRef}
            note={
              createPlan?.deadlinePassed
                ? 'This deadline has passed: it will show as overdue.'
                : undefined
            }
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
            error={errors.remindAt}
            note={
              reminderMovesTo
                ? `Reminder moves to ${when(reminderMovesTo, now)}`
                : undefined
            }
            onChange={(date, time) =>
              setValues((v) => ({ ...v, remindDate: date, remindTime: time }))
            }
          />
          {editPlan?.snoozeEnds && (
            <p className={WARNING} aria-live="polite">
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

        {/* Archived sits outside the fieldset, so it stays usable when everything else is locked.
            Edit only: a new task can't be created archived. */}
        {task && (
          <Checkbox
            ref={archivedRef}
            id={ids.archived}
            label="Archived"
            checked={values.archived}
            onChange={toggleArchived}
          />
        )}

        <p role="alert" className="text-sm text-red-700 empty:hidden">
          {save.isError
            ? saveErrorMessage(
                save.error instanceof ApiError ? save.error.detail : undefined,
              )
            : ''}
        </p>

        <div className="flex flex-wrap justify-end gap-2">
          {task && (
            // Outside the locked fieldset, so done and archived tasks can be cloned. Copies the
            // form as it is on screen; this task is not saved.
            <button
              type="button"
              onClick={() => onClone?.(toCloneValues(values))}
              className={`${ACCENT_BUTTON} mr-auto`}
            >
              Clone
            </button>
          )}
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
            {save.isPending ? 'Saving…' : task ? 'Save' : 'Add task'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
