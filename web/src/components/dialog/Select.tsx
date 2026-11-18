import { FIELD } from './styles'

/** A labelled dropdown. With `none`, the first option is "None" (saved as null). */
export function Select({
  id,
  label,
  value,
  options,
  none = false,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  /** Offer "None" (saved as null). */
  none?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} w-full`}
      >
        {none && <option value="">None</option>}
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  )
}
