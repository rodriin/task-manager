// Shared looks for the dialog's fields and buttons.
// No width or colour in the base styles: two Tailwind classes for the same property
// (w-full and w-auto, bg-white and bg-blue-600) don't override each other by order.
export const FIELD =
  'rounded border border-gray-300 bg-white px-2 py-1 disabled:bg-gray-100 disabled:text-gray-500'

const BUTTON = 'rounded border px-3 py-1 disabled:opacity-40'

/** The main action (Save): blue, so it stands out. */
export const PRIMARY_BUTTON = `${BUTTON} border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600`

/** Other actions (Cancel). */
export const SECONDARY_BUTTON = `${BUTTON} border-gray-300 bg-white hover:bg-gray-100`

/** Small Clear button, the same look as Clear on the table toolbar. */
export const CLEAR_BUTTON =
  'rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-white'
