import { useContext, useId, useState, type ReactNode } from 'react'
import { AccordionContext } from './accordionContext.ts'

interface Props {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

/** A collapsible sidebar section. Its heading is a button that shows or hides the content. */
export function Section({ title, defaultOpen = false, children }: Props) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen)
  const accordion = useContext(AccordionContext)
  // Inside an accordion only one section is open; on its own a section opens and closes freely.
  const open = accordion ? accordion.open === title : ownOpen
  const setOpen = (next: (current: boolean) => boolean) => (accordion ? accordion.toggle(title) : setOwnOpen(next))
  const id = useId()
  return (
    <section className="section" data-open={open}>
      <h2 className="section__title">
        <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((o) => !o)}>
          <span className="section__chevron" aria-hidden="true">
            ›
          </span>
          {title}
        </button>
      </h2>
      {open && (
        <div id={`${id}-body`} className="section__body" role="region" aria-label={title}>
          {children}
        </div>
      )}
    </section>
  )
}
