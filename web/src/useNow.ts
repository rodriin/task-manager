import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every minute. Re-renders the screen so a task turns
 * Overdue the minute its deadline passes, and Today rolls over at midnight, without a reload.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id) // stop the timer when the screen goes away
  }, [intervalMs])
  return now
}
