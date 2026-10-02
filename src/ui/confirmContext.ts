import { createContext, useContext } from 'react'

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm button as destructive. */
  danger?: boolean
}

export type Confirm = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<Confirm | null>(null)

/** `await confirm({...})` resolves true or false. Use it only for what Undo cannot take back. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm needs a <ConfirmProvider>')
  return confirm
}
