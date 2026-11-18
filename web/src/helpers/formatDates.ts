// Date formatting shared by the scan and the full list.
// 24-hour times: military friendly, and what a flight schedule uses.
import { format, isSameDay, isSameYear } from 'date-fns'

/** Time only when the date is today; the day as well otherwise; the year too when it isn't this year. */
export function when(date: Date, now: Date): string {
  if (isSameDay(date, now)) return format(date, "'Today' HH:mm")
  if (isSameYear(date, now)) return format(date, 'EEE d MMM, HH:mm')
  return format(date, 'd MMM yyyy, HH:mm')
}

/** The day only, with the year when it isn't this year. */
export function day(date: Date, now: Date): string {
  return format(date, isSameYear(date, now) ? 'EEE d MMM' : 'd MMM yyyy')
}
