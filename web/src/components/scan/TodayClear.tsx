import type { TodayState } from '../../helpers/taskHelpers'
import { CaughtUpIcon } from '../shared/Icons'

/**
 * What an empty Today section says. Caught up (nothing open due today or overdue, pinned and
 * snoozed tasks included): a green check, and how many were done today. If only pinned tasks
 * are due, they're in Pinned above with their bells, so this only says "Nothing else".
 */
export function TodayClear({
  state,
  done,
}: {
  state: TodayState
  done: number
}) {
  // The moment the app is for: a box the size of a short list, so it reads as an arrival.
  if (state === 'caughtUp')
    return (
      <div className="mt-2 flex flex-col items-center justify-center gap-3 rounded border border-green-200 bg-green-50 px-4 py-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full border-2 border-green-600 bg-white">
          <CaughtUpIcon />
        </span>
        <p className="text-xl font-semibold text-green-800">
          You're caught up.
        </p>
        {done > 0 && <p className="text-sm text-gray-600">{done} done today</p>}
      </div>
    )
  // Not caught up: the pinned tasks above are still due. Same shape, quieter: grey, smaller.
  return (
    <div className="mt-2 flex flex-col items-center justify-center gap-2 rounded border border-gray-200 bg-white px-4 py-6 text-center">
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full border border-gray-300 bg-gray-50"
      >
        📌
      </span>
      <p className="font-medium text-gray-700">Nothing else due today</p>
      <p className="text-sm text-gray-500">Check the pinned tasks above.</p>
    </div>
  )
}
