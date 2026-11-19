// The status icons: inline SVG, so no icon library. Shapes from Lucide (lucide.dev, ISC licence).
// Color comes from the text color (currentColor), set by whoever uses them.
import { signalLabel, taskSignal, type Signal } from '../../helpers/taskHelpers'
import type { Task } from '../../types'

const BELL = (
  <>
    <path d="M10.268 21a2 2 0 0 0 3.464 0" />
    <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
  </>
)
const BELL_OFF = (
  <>
    <path d="M10.268 21a2 2 0 0 0 3.464 0" />
    <path d="M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742" />
    <path d="m2 2 20 20" />
    <path d="M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05" />
  </>
)
const CHECK = <path d="M20 6 9 17l-5-5" />
const SPARKLES = (
  <>
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <path d="M20 3v4" />
    <path d="M22 5h-4" />
  </>
)
const ALARM = (
  <>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2" />
    <path d="M5 3 2 6" />
    <path d="m22 6-3-3" />
  </>
)

/** The SVG frame every icon shares: 24-unit Lucide shapes, drawn in the text color. */
function Svg({
  children,
  className,
  label,
  strokeWidth = 2,
  fill = 'none',
}: {
  children: React.ReactNode
  className: string
  label?: string
  strokeWidth?: number
  fill?: string
}) {
  // The tooltip is a `title` attribute, not an SVG <title>: that would add its words to the
  // text around the icon (a title cell would read "Tow barNew").
  const svg = (
    <svg
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
    >
      {children}
    </svg>
  )
  return label ? (
    <span title={label} className="inline-flex shrink-0">
      {svg}
    </span>
  ) : (
    svg
  )
}

/**
 * New: violet sparkles next to the title, in a task's first 24 hours (isNew). An icon, not a
 * tag, so High, In progress and New don't stack up into three labels. Violet means new only.
 */
export function NewIcon() {
  return (
    <Svg
      className="size-4 text-violet-600"
      fill="currentColor"
      strokeWidth={1.5}
      label="New"
    >
      {SPARKLES}
    </Svg>
  )
}

/** Small icons for the scan line's times: the reminder (alarm clock) and the snooze end. Hidden: the text says it. */
export function TimeIcon({ kind }: { kind: 'reminder' | 'snoozed' }) {
  return (
    <Svg className="size-3.5">{kind === 'reminder' ? ALARM : BELL_OFF}</Svg>
  )
}

/** Shape and color per signal. Red = overdue, amber = act soon, grey = snoozed, green = done. */
const LOOKS: Record<Signal, { shape: React.ReactNode; color: string }> = {
  overdue: { shape: BELL, color: 'text-red-600' },
  warning: { shape: BELL, color: 'text-amber-600' },
  snoozed: { shape: BELL_OFF, color: 'text-gray-500' },
  done: { shape: CHECK, color: 'text-green-600' },
}

/** One icon. With a label it's an image a screen reader reads (and a tooltip); without, it's hidden. */
export function SignalIcon({
  signal,
  label,
}: {
  signal: Signal
  label?: string
}) {
  const { shape, color } = LOOKS[signal]
  return (
    <Svg
      className={`size-4 ${color}`}
      strokeWidth={signal === 'snoozed' ? 2 : 2.5}
      label={label}
    >
      {shape}
    </Svg>
  )
}

/** The task's icon, labelled, or nothing. For places with no snooze menu (the dialog). */
export function TaskIcon({ task, now }: { task: Task; now: Date }) {
  const signal = taskSignal(task, now)
  const label = signalLabel(task, now)
  return signal && label ? <SignalIcon signal={signal} label={label} /> : null
}
