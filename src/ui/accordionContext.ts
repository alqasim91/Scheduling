import { createContext } from 'react'

export interface AccordionState {
  open: string | null
  toggle: (title: string) => void
}

export const AccordionContext = createContext<AccordionState | null>(null)
