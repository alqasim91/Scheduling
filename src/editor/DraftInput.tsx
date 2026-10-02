import { useState } from 'react'

interface Props {
  label: string
  value: string
  /** Is this text acceptable as a committed value? */
  validate: (text: string) => boolean
  onCommit: (text: string) => void
  placeholder?: string
  hint?: string
}

/**
 * A text input that keeps what you type in a local draft and only commits valid values,
 * so a half-typed date or time never reaches (and corrupts) the schedule.
 */
export function DraftInput({ label, value, validate, onCommit, placeholder, hint }: Props) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    // The committed value changed from outside (load, undo, another control): resync the draft.
    setSeen(value)
    setDraft(value)
  }
  const valid = validate(draft)

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        aria-invalid={!valid}
        onChange={(e) => {
          const text = e.target.value
          setDraft(text)
          if (validate(text)) onCommit(text)
        }}
        onBlur={() => {
          if (!validate(draft)) setDraft(value)
        }}
      />
      {!valid && hint && <small className="field__error">{hint}</small>}
    </label>
  )
}
