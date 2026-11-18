export interface Toast {
  key: number
  message: string
}

/** How long a toast stays; it fades out over the last half second (see index.css). */
export const TOAST_MS = 5000

/**
 * Short confirmations at the top right of the page, green like a completed task (success) ("New task created: …"). They stack and fade by
 * themselves; App removes each after TOAST_MS. The live region is always on the page, so a
 * screen reader announces each one as it's added.
 */
export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-3 z-10 flex flex-col items-end gap-2 px-4"
    >
      {toasts.map((toast) => (
        <p
          key={toast.key}
          className="animate-toast max-w-full rounded border border-l-4 border-green-600 bg-green-50 px-4 py-2 text-sm font-medium text-green-800 shadow-md sm:max-w-sm"
        >
          {toast.message}
        </p>
      ))}
    </div>
  )
}
