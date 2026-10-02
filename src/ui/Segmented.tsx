interface Props<T extends string> {
  label: string
  value: T
  options: ReadonlyArray<readonly [T, string]>
  onChange: (value: T) => void
  className?: string
}

/** A row of mutually exclusive buttons (pressed state, not tabs). */
export function Segmented<T extends string>({ label, value, options, onChange, className }: Props<T>) {
  return (
    <div className={className ? `segmented ${className}` : 'segmented'} role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}>
          {text}
        </button>
      ))}
    </div>
  )
}
