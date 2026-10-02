import { useMemo, useState, type ReactNode } from 'react'
import { AccordionContext } from './accordionContext.ts'

/** Sidebar sections inside it open one at a time. */
export function Accordion({ initial, children }: { initial: string | null; children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(initial)
  const value = useMemo(() => ({ open, toggle: (title: string) => setOpen((o) => (o === title ? null : title)) }), [open])
  return <AccordionContext.Provider value={value}>{children}</AccordionContext.Provider>
}
