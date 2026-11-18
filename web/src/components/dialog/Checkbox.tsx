/** A checkbox with its label to the right. */
export function Checkbox({
  ref,
  id,
  label,
  checked,
  onChange,
}: {
  ref?: React.Ref<HTMLInputElement>
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
      />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  )
}
