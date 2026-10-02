import { createContext, useContext } from 'react'

export interface Notification {
  text: string
  /** A button next to the text, e.g. Undo. */
  action?: { label: string; run: () => void }
}

export type Notify = (notification: Notification) => void

export const NotifyContext = createContext<Notify | null>(null)

/** Show a short toast, optionally with an action such as Undo. */
export function useNotify(): Notify {
  const notify = useContext(NotifyContext)
  if (!notify) throw new Error('useNotify needs a <NotifyProvider>')
  return notify
}
