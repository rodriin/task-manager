import { normalizeTime } from '../../helpers/taskForm'
import { FieldError } from './FieldError'
import { CLEAR_BUTTON, FIELD } from './styles'

/**
 * A native date picker plus a typed 24-hour time (the browser's time picker shows AM/PM on a
 * US machine). Picking a date with no time fills in the default time.
 */
export function DateTimeField({
  id,
  label,
  date,
  time,
  defaultTime,
  error,
  note,
  onChange,
}: {
  id: string
  label: string
  date: string
  time: string
  defaultTime: string
  error?: string
  note?: string
  onChange: (date: string, time: string) => void
}) {
  const describedBy = [error && `${id}-error`, note && `${id}-note`]
    .filter(Boolean)
    .join(' ')
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-date`} className="sr-only">
          {label} date
        </label>
        <input
          id={`${id}-date`}
          type="date"
          value={date}
          aria-describedby={describedBy || undefined}
          onChange={(e) => {
            const nextDate = e.target.value
            onChange(nextDate, nextDate && !time ? defaultTime : time)
          }}
          className={FIELD}
        />
        <label htmlFor={`${id}-time`} className="sr-only">
          {label} time (24-hour, HH:mm)
        </label>
        <input
          id={`${id}-time`}
          type="text"
          inputMode="numeric"
          placeholder="HH:mm"
          maxLength={5}
          value={time}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(e) => onChange(date, e.target.value)}
          // "700" or "7:00" becomes "07:00" when leaving the field.
          onBlur={() => {
            const normal = normalizeTime(time)
            if (normal && normal !== time) onChange(date, normal)
          }}
          className={`${FIELD} w-20 font-mono`}
        />
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onChange('', '')}
          disabled={!date && !time}
          className={CLEAR_BUTTON}
        >
          Clear
        </button>
      </div>
      <FieldError id={`${id}-error`} message={error} />
      {note && (
        <p
          id={`${id}-note`}
          className="text-sm text-gray-700"
          aria-live="polite"
        >
          {note}
        </p>
      )}
    </fieldset>
  )
}
