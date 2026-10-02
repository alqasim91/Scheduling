import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface Props {
  /** Id of the heading that names the dialog. */
  titleId: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

/**
 * An accessible modal dialog: labelled by its heading, focus moves in and is trapped, Escape
 * (or a click on the backdrop) closes it, and focus returns to what had it before.
 */
export function Modal({ titleId, onClose, children, wide }: Props) {
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const node = dialog.current
    const first = node?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? node)?.focus()
    return () => previous?.focus?.()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const node = dialog.current
    if (!node) return
    const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) {
      event.preventDefault()
      return
    }
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === node)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialog}
        className={wide ? 'modal modal--wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  )
}
