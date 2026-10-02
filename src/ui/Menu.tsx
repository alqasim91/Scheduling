import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface MenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
}

interface Props {
  /** The menu's accessible name (and the button's text unless `display` is given). */
  label: string
  items: readonly MenuItem[]
  /** What the button shows instead of the label and a caret, e.g. an icon. */
  display?: ReactNode
  /** Open the list towards the end of the screen (for buttons at the end of a row). */
  alignEnd?: boolean
}

/** A dropdown menu button: arrow keys move, Enter or click chooses, Esc or a click elsewhere closes. */
export function MenuButton({ label, items, display, alignEnd }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const first = root.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
    first?.focus()
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])

  function close(refocus: boolean) {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const nodes = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
    const at = nodes.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      nodes[(at + 1) % nodes.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      nodes[(at - 1 + nodes.length) % nodes.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      nodes[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      nodes[nodes.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className="menu" ref={root} onKeyDown={handleKeyDown}>
      <button
        ref={trigger}
        type="button"
        className="ghost"
        aria-label={display ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {display ?? (
          <>
            {label}
            <span aria-hidden="true"> ▾</span>
          </>
        )}
      </button>
      {open && (
        <div id={id} className={alignEnd ? 'menu__list menu__list--end' : 'menu__list'} role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close(false)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
