// The task's icon, and on an alerting or snoozed task, the button that opens the snooze menu.
// Snooze is the answer to an alert, so it lives on the bell: in the scan and in the table.
import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, updateTask } from '../../api/client'
import { clock } from '../../helpers/formatDates'
import { snoozeOptions } from '../../helpers/snooze'
import { saveErrorMessage } from '../../helpers/taskForm'
import { signalLabel, taskSignal } from '../../helpers/taskHelpers'
import type { Task } from '../../types'
import { SignalIcon } from './Icons'

const MENU_WIDTH = 256 // px, w-64
const ITEM =
  'flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm -outline-offset-2 hover:bg-gray-100 focus:bg-gray-100'

/**
 * A completed task shows the check; a task with no alert shows nothing.
 * The menu saves at once (PATCH snoozedUntil), with the end time each option shows, so what he
 * sees is what's saved. It's placed with `position: fixed`, so the table's scroll box can't clip
 * it; it closes on scroll, Escape, Tab or a click outside.
 */
export function SnoozeMenu({ task, now }: { task: Task; now: Date }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<React.CSSProperties>({})
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (snoozedUntil: Date | null) =>
      updateTask(task.id, { snoozedUntil }),
    onSuccess: (saved) => {
      queryClient.setQueryData<Task[]>(['tasks'], (tasks) =>
        tasks?.map((t) => (t.id === saved.id ? saved : t)),
      )
      close()
    },
  })

  const close = (refocus = true) => {
    setOpen(false)
    save.reset()
    if (refocus) buttonRef.current?.focus()
  }

  // While open: focus the first item; close on a click outside or any scroll.
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const outside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        !menuRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      )
        setOpen(false)
    }
    const scrolled = () => setOpen(false)
    document.addEventListener('mousedown', outside)
    window.addEventListener('scroll', scrolled, true)
    window.addEventListener('resize', scrolled)
    return () => {
      document.removeEventListener('mousedown', outside)
      window.removeEventListener('scroll', scrolled, true)
      window.removeEventListener('resize', scrolled)
    }
  }, [open])

  const signal = taskSignal(task, now)
  const label = signalLabel(task, now)
  if (!signal || !label) return null
  if (signal === 'done') return <SignalIcon signal={signal} label={label} />

  const toggle = () => {
    if (open) return close()
    // Below the button, or above it when there's no room; never off the right edge.
    const rect = buttonRef.current!.getBoundingClientRect()
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8),
    )
    setPlace(
      rect.bottom + 300 > window.innerHeight && rect.top > 300
        ? { left, bottom: window.innerHeight - rect.top + 4 }
        : { left, top: rect.bottom + 4 },
    )
    setOpen(true)
  }

  // Arrow keys, Home and End move between the items; Escape closes; Tab closes and moves on.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const items = [
      ...menuRef.current!.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[event.key]
    if (next !== undefined) {
      event.preventDefault()
      items[next].focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation() // don't close a dialog behind it
      close()
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  const snoozed = signal === 'snoozed'
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label}. ${snoozed ? 'Change snooze' : 'Snooze'}`}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={toggle}
        className="-m-1 rounded p-1 hover:bg-gray-200/70"
      >
        <SignalIcon signal={signal} />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={`${id}-menu`}
          role="menu"
          aria-label={snoozed ? 'Change snooze' : 'Snooze'}
          onKeyDown={onKeyDown}
          style={{ position: 'fixed', width: MENU_WIDTH, ...place }}
          className="z-30 flex flex-col rounded border border-gray-200 bg-white py-1 text-gray-900 shadow-lg"
        >
          {snoozed && (
            <>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={save.isPending}
                onClick={() => save.mutate(null)}
                className={`${ITEM} font-medium`}
              >
                End snooze
              </button>
              <div role="separator" className="my-1 border-t border-gray-200" />
            </>
          )}
          <p className="px-3 pt-1 pb-0.5 text-xs font-semibold text-gray-500 uppercase">
            Snooze
          </p>
          {snoozeOptions(task, now).map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={save.isPending}
              onClick={() => save.mutate(option.until)}
              className={ITEM}
            >
              <span>{option.label}</span>
              <span className="text-xs text-gray-500">
                until {clock(option.until, now)}
                {option.capped ? ' (deadline)' : ''}
              </span>
            </button>
          ))}
          <p role="alert" className="px-3 text-sm text-red-700 empty:hidden">
            {save.isError
              ? saveErrorMessage(
                  save.error instanceof ApiError
                    ? save.error.detail
                    : undefined,
                )
              : ''}
          </p>
        </div>
      )}
    </>
  )
}
