import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { Speaker } from '../../model/schema.ts'

interface Props {
  label: string
  value: string
  speakers: readonly Speaker[]
  onChange: (text: string) => void
  /** The person picked "Add 'name' as new speaker". */
  onAddNew: (name: string) => void
}

const norm = (text: string) => text.trim().toLowerCase()

/**
 * A speaker field with suggestions: type any name, or choose one from the speakers list with the
 * arrow keys or the pointer. A name that is not in the list can be added to it from the same list.
 */
export function SpeakerCombobox({ label, value, speakers, onChange, onAddNew }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // Until you type, the list shows every speaker (so you can switch); after, it narrows to what you typed.
  const [typed, setTyped] = useState(false)
  const id = useId()
  const listId = `${id}-list`

  const options = useMemo(() => {
    const q = typed ? norm(value) : ''
    const matches = speakers.filter((s) => s.name.trim() !== '' && (q === '' || norm(s.name).includes(q)))
    const known = speakers.some((s) => norm(s.name) === q)
    const entries: Array<{ kind: 'speaker'; speaker: Speaker } | { kind: 'new'; name: string }> = matches.map((speaker) => ({ kind: 'speaker', speaker }))
    if (q !== '' && !known) entries.push({ kind: 'new', name: value.trim() })
    return entries
  }, [speakers, value, typed])

  function choose(index: number) {
    const entry = options[index]
    if (!entry) return
    if (entry.kind === 'speaker') onChange(entry.speaker.name)
    else onAddNew(entry.name)
    setOpen(false)
    setActive(-1)
    setTyped(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setActive((a) => (options.length === 0 ? -1 : (a + 1) % options.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) setOpen(true)
      setActive((a) => (options.length === 0 ? -1 : (a - 1 + options.length) % options.length))
    } else if (e.key === 'Enter') {
      if (open && active >= 0) {
        e.preventDefault()
        e.stopPropagation()
        choose(active)
      } else if (open) {
        setOpen(false)
      }
    } else if (e.key === 'Escape' && open) {
      // Close the list first; the next Esc closes the editor.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      setActive(-1)
    }
  }

  // Once the text is exactly a listed speaker there is nothing left to suggest, so the list gets out of the way.
  const complete = typed && options.length === 1 && options[0]?.kind === 'speaker' && norm(options[0].speaker.name) === norm(value)
  const expanded = open && options.length > 0 && !complete
  return (
    <div className="field combo">
      <label htmlFor={`${id}-input`}>{label}</label>
      <input
        id={`${id}-input`}
        type="text"
        dir="auto"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder="Choose or type a name"
        onChange={(e) => {
          onChange(e.target.value)
          setTyped(true)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => {
          setTyped(false)
          setOpen(true)
        }}
        onBlur={() => {
          setOpen(false)
          setActive(-1)
          setTyped(false)
        }}
        onKeyDown={handleKeyDown}
      />
      {expanded && (
        <ul id={listId} className="combo__list" role="listbox" aria-label={`${label} suggestions`}>
          {options.map((entry, i) => (
            <li
              key={entry.kind === 'speaker' ? entry.speaker.id : 'new'}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={entry.kind === 'new' ? 'combo__option combo__option--new' : 'combo__option'}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {entry.kind === 'speaker' ? (
                <>
                  <span>{entry.speaker.name}</span>
                  {entry.speaker.role && <small>{entry.speaker.role}</small>}
                </>
              ) : (
                <span>Add ‘{entry.name}’ as new speaker</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
