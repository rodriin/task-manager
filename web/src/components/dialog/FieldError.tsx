/** A field's error, linked to the field with aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-sm text-red-700">
      {message}
    </p>
  )
}
